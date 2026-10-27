-- Delivery notes: create from a confirmed order, dispatch (writes shipment
-- movements and consumes the order's stock reservations), deliver, or fail
-- (returns dispatched stock to the warehouse and re-reserves it for the order).

alter table public.erp_delivery_notes
	add column if not exists idempotency_key uuid,
	add column if not exists updated_at timestamptz not null default now(),
	add column if not exists failure_reason text;

create unique index if not exists erp_delivery_notes_idempotency_idx
	on public.erp_delivery_notes (workspace_id, idempotency_key)
	where idempotency_key is not null;

create index if not exists erp_delivery_notes_order_idx
	on public.erp_delivery_notes (workspace_id, order_id);

create index if not exists erp_delivery_note_lines_note_idx
	on public.erp_delivery_note_lines (delivery_note_id);

create index if not exists erp_delivery_note_lines_order_line_idx
	on public.erp_delivery_note_lines (order_line_id);

create or replace function erp_private.erp_delivery_actor(p_note_id uuid)
returns table (workspace_id uuid, user_id uuid, order_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_role text;
	v_order_id uuid;
	v_status text;
	v_driver uuid;
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager', 'delivery']) r;

	select m.role_code into v_role
	from public.erp_workspace_memberships m
	where m.workspace_id = v_workspace_id and m.user_id = v_user_id and m.is_active;

	select n.order_id, n.status into v_order_id, v_status
	from public.erp_delivery_notes n
	where n.id = p_note_id and n.workspace_id = v_workspace_id
	for update;
	if not found then
		raise exception 'delivery_note_not_found' using errcode = 'P0002';
	end if;

	if v_role = 'delivery' then
		select o.assigned_driver_id into v_driver
		from public.erp_sales_orders o where o.id = v_order_id;
		if v_driver is distinct from v_user_id then
			raise exception 'workspace_access_denied' using errcode = '42501';
		end if;
	end if;

	return query select v_workspace_id, v_user_id, v_order_id, v_status;
end;
$$;

create or replace function public.erp_create_delivery_note(
	p_order_id uuid,
	p_lines jsonb,
	p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_note_id uuid;
	v_status text;
	v_client_id uuid;
	v_client_name text;
	v_line record;
	v_request jsonb;
	v_qty integer;
	v_count integer := 0;
	v_seen uuid[] := '{}';
	v_reserved numeric;
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager']) r;

	if p_idempotency_key is null then
		raise exception 'idempotency_key_required' using errcode = 'P0001';
	end if;
	if p_lines is not null and (jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 100) then
		raise exception 'invalid_delivery_lines' using errcode = 'P0001';
	end if;

	select n.id into v_note_id
	from public.erp_delivery_notes n
	where n.workspace_id = v_workspace_id and n.idempotency_key = p_idempotency_key;
	if found then
		return v_note_id;
	end if;

	select o.status, o.client_id, o.client_name_snapshot into v_status, v_client_id, v_client_name
	from public.erp_sales_orders o
	where o.id = p_order_id and o.workspace_id = v_workspace_id
	for update;
	if not found then
		raise exception 'sales_order_not_found' using errcode = 'P0002';
	end if;
	if v_status not in ('confirmed', 'part_delivered') then
		raise exception 'sales_order_not_deliverable' using errcode = 'P0001';
	end if;

	v_note_id := gen_random_uuid();
	insert into public.erp_delivery_notes (
		id, workspace_id, document_number, order_id, client_id, client_name_snapshot,
		status, created_by, idempotency_key
	) values (
		v_note_id, v_workspace_id,
		'DN-' || to_char(now() at time zone 'Africa/Casablanca', 'YYYYMMDD') || '-' || upper(substr(replace(v_note_id::text, '-', ''), 1, 8)),
		p_order_id, v_client_id, v_client_name, 'ready', v_user_id, p_idempotency_key
	);

	for v_line in
		select l.id, l.item_id, l.sku_snapshot, l.name_snapshot, l.unit_price_mad,
			l.quantity - coalesce((
				select sum(dl.quantity)
				from public.erp_delivery_note_lines dl
				join public.erp_delivery_notes dn on dn.id = dl.delivery_note_id
				where dl.order_line_id = l.id and dn.status <> 'failed'
			), 0) as remaining
		from public.erp_sales_order_lines l
		where l.order_id = p_order_id
		order by l.item_id
	loop
		if p_lines is null then
			v_qty := v_line.remaining;
		else
			select (e->>'quantity')::integer into v_qty
			from jsonb_array_elements(p_lines) e
			where e->>'orderLineId' = v_line.id::text;
			if v_qty is null then
				continue;
			end if;
		end if;
		if v_qty <= 0 then
			continue;
		end if;
		if v_qty > v_line.remaining then
			raise exception 'delivery_quantity_exceeds_order' using errcode = 'P0001';
		end if;

		select coalesce(sum(r.quantity), 0) into v_reserved
		from public.inventory_reservations r
		where r.workspace_id = v_workspace_id and r.source_type = 'sales_order'
			and r.source_id = p_order_id and r.item_id = v_line.item_id and r.status = 'active';
		if v_reserved < v_qty then
			raise exception 'reservation_missing' using errcode = 'P0001';
		end if;

		insert into public.erp_delivery_note_lines (
			id, workspace_id, delivery_note_id, order_line_id, item_id, sku_snapshot, name_snapshot, quantity, unit_price_mad
		) values (
			gen_random_uuid(), v_workspace_id, v_note_id, v_line.id, v_line.item_id,
			v_line.sku_snapshot, v_line.name_snapshot, v_qty, v_line.unit_price_mad
		);
		v_count := v_count + 1;
		v_seen := v_seen || v_line.id;
	end loop;

	if p_lines is not null then
		for v_request in select * from jsonb_array_elements(p_lines) loop
			if not ((v_request->>'orderLineId')::uuid = any (v_seen)) then
				raise exception 'invalid_delivery_lines' using errcode = 'P0001';
			end if;
		end loop;
	end if;
	if v_count = 0 then
		raise exception 'nothing_to_deliver' using errcode = 'P0001';
	end if;

	insert into public.erp_sales_order_events (workspace_id, order_id, event_type, actor_id, detail)
	values (v_workspace_id, p_order_id, 'delivery_created', v_user_id, jsonb_build_object('deliveryNoteId', v_note_id));

	return v_note_id;
end;
$$;

create or replace function public.erp_dispatch_delivery_note(p_note_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_order_id uuid;
	v_status text;
	v_line record;
	v_res record;
	v_need numeric;
	v_take numeric;
begin
	select a.workspace_id, a.user_id, a.order_id, a.status into v_workspace_id, v_user_id, v_order_id, v_status
	from erp_private.erp_delivery_actor(p_note_id) a;

	if v_status <> 'ready' then
		raise exception 'delivery_note_not_ready' using errcode = 'P0001';
	end if;

	for v_line in
		select dl.item_id, dl.quantity
		from public.erp_delivery_note_lines dl
		where dl.delivery_note_id = p_note_id
		order by dl.item_id
	loop
		v_need := v_line.quantity;
		for v_res in
			select r.id, r.location_id, r.lot_id, r.quantity
			from public.inventory_reservations r
			where r.workspace_id = v_workspace_id and r.source_type = 'sales_order'
				and r.source_id = v_order_id and r.item_id = v_line.item_id and r.status = 'active'
			order by r.created_at, r.id
			for update
		loop
			exit when v_need <= 0;
			v_take := least(v_need, v_res.quantity);

			insert into public.inventory_movements (
				workspace_id, item_id, location_id, lot_id, movement_type, quantity_delta,
				reference_type, reference_id, idempotency_key, recorded_by
			) values (
				v_workspace_id, v_line.item_id, v_res.location_id, v_res.lot_id, 'shipment', -v_take,
				'delivery_note', p_note_id, gen_random_uuid(), v_user_id
			);

			if v_take = v_res.quantity then
				update public.inventory_reservations set status = 'consumed', closed_at = now() where id = v_res.id;
			else
				update public.inventory_reservations set quantity = quantity - v_take where id = v_res.id;
				insert into public.inventory_reservations (
					workspace_id, item_id, location_id, lot_id, quantity, source_type, source_id,
					status, idempotency_key, reserved_by, closed_at
				) values (
					v_workspace_id, v_line.item_id, v_res.location_id, v_res.lot_id, v_take, 'sales_order', v_order_id,
					'consumed', gen_random_uuid(), v_user_id, now()
				);
			end if;
			v_need := v_need - v_take;
		end loop;

		if v_need > 0 then
			raise exception 'reservation_missing' using errcode = 'P0001';
		end if;
	end loop;

	update public.erp_delivery_notes
	set status = 'dispatched', dispatched_at = now(), updated_at = now()
	where id = p_note_id;

	insert into public.erp_sales_order_events (workspace_id, order_id, event_type, actor_id, detail)
	values (v_workspace_id, v_order_id, 'dispatched', v_user_id, jsonb_build_object('deliveryNoteId', p_note_id));
end;
$$;

create or replace function public.erp_deliver_delivery_note(p_note_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_order_id uuid;
	v_status text;
	v_open_lines integer;
begin
	select a.workspace_id, a.user_id, a.order_id, a.status into v_workspace_id, v_user_id, v_order_id, v_status
	from erp_private.erp_delivery_actor(p_note_id) a;

	if v_status <> 'dispatched' then
		raise exception 'delivery_note_not_dispatched' using errcode = 'P0001';
	end if;

	update public.erp_delivery_notes
	set status = 'delivered', delivered_at = now(), updated_at = now()
	where id = p_note_id;

	select count(*) into v_open_lines
	from public.erp_sales_order_lines l
	where l.order_id = v_order_id
		and l.quantity > coalesce((
			select sum(dl.quantity)
			from public.erp_delivery_note_lines dl
			join public.erp_delivery_notes dn on dn.id = dl.delivery_note_id
			where dl.order_line_id = l.id and dn.status = 'delivered'
		), 0);

	update public.erp_sales_orders
	set status = case when v_open_lines = 0 then 'delivered' else 'part_delivered' end, updated_at = now()
	where id = v_order_id;

	insert into public.erp_sales_order_events (workspace_id, order_id, event_type, actor_id, detail)
	values (v_workspace_id, v_order_id, 'delivered', v_user_id, jsonb_build_object('deliveryNoteId', p_note_id, 'complete', v_open_lines = 0));
end;
$$;

create or replace function public.erp_fail_delivery_note(p_note_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_order_id uuid;
	v_status text;
	v_move record;
begin
	select a.workspace_id, a.user_id, a.order_id, a.status into v_workspace_id, v_user_id, v_order_id, v_status
	from erp_private.erp_delivery_actor(p_note_id) a;

	if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 300 then
		raise exception 'failure_reason_required' using errcode = 'P0001';
	end if;
	if v_status not in ('ready', 'dispatched') then
		raise exception 'delivery_note_not_failable' using errcode = 'P0001';
	end if;

	if v_status = 'dispatched' then
		for v_move in
			select m.item_id, m.location_id, m.lot_id, -m.quantity_delta as quantity
			from public.inventory_movements m
			where m.workspace_id = v_workspace_id and m.reference_type = 'delivery_note'
				and m.reference_id = p_note_id and m.movement_type = 'shipment'
		loop
			insert into public.inventory_movements (
				workspace_id, item_id, location_id, lot_id, movement_type, quantity_delta,
				reference_type, reference_id, idempotency_key, recorded_by
			) values (
				v_workspace_id, v_move.item_id, v_move.location_id, v_move.lot_id, 'customer_return', v_move.quantity,
				'delivery_note_failed', p_note_id, gen_random_uuid(), v_user_id
			);
			insert into public.inventory_reservations (
				workspace_id, item_id, location_id, lot_id, quantity, source_type, source_id,
				status, idempotency_key, reserved_by
			) values (
				v_workspace_id, v_move.item_id, v_move.location_id, v_move.lot_id, v_move.quantity, 'sales_order', v_order_id,
				'active', gen_random_uuid(), v_user_id
			);
		end loop;
	end if;

	update public.erp_delivery_notes
	set status = 'failed', failure_reason = btrim(p_reason), updated_at = now()
	where id = p_note_id;

	insert into public.erp_sales_order_events (workspace_id, order_id, event_type, actor_id, detail)
	values (v_workspace_id, v_order_id, 'delivery_failed', v_user_id, jsonb_build_object('deliveryNoteId', p_note_id, 'reason', btrim(p_reason)));
end;
$$;

revoke all on function erp_private.erp_delivery_actor(uuid) from public, anon, authenticated;
revoke all on function public.erp_create_delivery_note(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.erp_dispatch_delivery_note(uuid) from public, anon, authenticated;
revoke all on function public.erp_deliver_delivery_note(uuid) from public, anon, authenticated;
revoke all on function public.erp_fail_delivery_note(uuid, text) from public, anon, authenticated;

grant execute on function public.erp_create_delivery_note(uuid, jsonb, uuid) to authenticated;
grant execute on function public.erp_dispatch_delivery_note(uuid) to authenticated;
grant execute on function public.erp_deliver_delivery_note(uuid) to authenticated;
grant execute on function public.erp_fail_delivery_note(uuid, text) to authenticated;
