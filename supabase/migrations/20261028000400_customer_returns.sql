-- Customer returns: request against a delivered note, receive for inspection,
-- then release to stock (customer_return movement) or reject (no stock change).
-- Goods under inspection are not counted in on-hand stock.

alter table public.erp_customer_returns
	add column if not exists idempotency_key uuid,
	add column if not exists updated_at timestamptz not null default now(),
	add column if not exists resolution_note text not null default '';

create unique index if not exists erp_customer_returns_idempotency_idx
	on public.erp_customer_returns (workspace_id, idempotency_key) where idempotency_key is not null;
create index if not exists erp_customer_returns_note_idx
	on public.erp_customer_returns (workspace_id, delivery_note_id);
create index if not exists erp_customer_return_lines_return_idx
	on public.erp_customer_return_lines (return_id);
create index if not exists erp_customer_return_lines_delivery_line_idx
	on public.erp_customer_return_lines (delivery_line_id);

create or replace function public.erp_create_customer_return(
	p_note_id uuid,
	p_reason text,
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
	v_role text;
	v_existing uuid;
	v_note record;
	v_driver uuid;
	v_line jsonb;
	v_dl record;
	v_qty integer;
	v_used integer;
	v_id uuid := gen_random_uuid();
	v_count integer := 0;
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager', 'delivery']) r;

	if p_idempotency_key is null then
		raise exception 'idempotency_key_required' using errcode = 'P0001';
	end if;
	if p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 300 then
		raise exception 'return_reason_required' using errcode = 'P0001';
	end if;
	if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
		raise exception 'invalid_return_lines' using errcode = 'P0001';
	end if;

	select r.id into v_existing from public.erp_customer_returns r
	where r.workspace_id = v_workspace_id and r.idempotency_key = p_idempotency_key;
	if found then return v_existing; end if;

	select m.role_code into v_role from public.erp_workspace_memberships m
	where m.workspace_id = v_workspace_id and m.user_id = v_user_id and m.is_active;

	select n.id, n.status, n.client_id, n.client_name_snapshot, n.order_id into v_note
	from public.erp_delivery_notes n
	where n.id = p_note_id and n.workspace_id = v_workspace_id
	for update;
	if not found then
		raise exception 'delivery_note_not_found' using errcode = 'P0002';
	end if;
	if v_role = 'delivery' then
		select o.assigned_driver_id into v_driver from public.erp_sales_orders o where o.id = v_note.order_id;
		if v_driver is distinct from v_user_id then
			raise exception 'workspace_access_denied' using errcode = '42501';
		end if;
	end if;
	if v_note.status <> 'delivered' then
		raise exception 'delivery_note_not_delivered' using errcode = 'P0001';
	end if;

	insert into public.erp_customer_returns (
		id, workspace_id, document_number, delivery_note_id, client_id, client_name_snapshot,
		reason, status, created_by, idempotency_key
	) values (
		v_id, v_workspace_id,
		erp_private.erp_next_document_number(v_workspace_id, 'return', 'RET'),
		p_note_id, v_note.client_id, v_note.client_name_snapshot,
		btrim(p_reason), 'requested', v_user_id, p_idempotency_key
	);

	for v_line in select * from jsonb_array_elements(p_lines) loop
		if jsonb_typeof(v_line) <> 'object'
			or (v_line->>'deliveryLineId') is null
			or (v_line->>'deliveryLineId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
			or (v_line->>'quantity') is null
			or (v_line->>'quantity') !~ '^[0-9]{1,6}$' then
			raise exception 'invalid_return_lines' using errcode = 'P0001';
		end if;
		v_qty := (v_line->>'quantity')::integer;
		if v_qty < 1 then
			raise exception 'invalid_return_lines' using errcode = 'P0001';
		end if;

		select l.id, l.item_id, l.quantity into v_dl
		from public.erp_delivery_note_lines l
		where l.id = (v_line->>'deliveryLineId')::uuid and l.delivery_note_id = p_note_id;
		if not found then
			raise exception 'invalid_return_lines' using errcode = 'P0001';
		end if;

		select coalesce(sum(rl.quantity), 0) into v_used
		from public.erp_customer_return_lines rl
		join public.erp_customer_returns r on r.id = rl.return_id
		where rl.delivery_line_id = v_dl.id and r.status <> 'rejected';
		if v_used + v_qty > v_dl.quantity then
			raise exception 'return_quantity_exceeds_delivered' using errcode = 'P0001';
		end if;

		insert into public.erp_customer_return_lines (id, workspace_id, return_id, delivery_line_id, item_id, quantity)
		values (gen_random_uuid(), v_workspace_id, v_id, v_dl.id, v_dl.item_id, v_qty);
		v_count := v_count + 1;
	end loop;
	return v_id;
end;
$$;

create or replace function public.erp_receive_customer_return(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_status text;
begin
	select r.workspace_id into v_workspace_id
	from erp_private.erp_require_workspace_role(array['manager']) r;

	select c.status into v_status from public.erp_customer_returns c
	where c.id = p_return_id and c.workspace_id = v_workspace_id for update;
	if not found then
		raise exception 'return_not_found' using errcode = 'P0002';
	end if;
	if v_status <> 'requested' then
		raise exception 'return_not_requested' using errcode = 'P0001';
	end if;
	update public.erp_customer_returns set status = 'inspection', updated_at = now() where id = p_return_id;
end;
$$;

create or replace function public.erp_resolve_customer_return(p_return_id uuid, p_decision text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_status text;
	v_note_id uuid;
	v_line record;
	v_ship record;
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager']) r;

	if p_decision is null or p_decision not in ('release', 'reject') then
		raise exception 'invalid_return_decision' using errcode = 'P0001';
	end if;

	select c.status, c.delivery_note_id into v_status, v_note_id from public.erp_customer_returns c
	where c.id = p_return_id and c.workspace_id = v_workspace_id for update;
	if not found then
		raise exception 'return_not_found' using errcode = 'P0002';
	end if;
	if v_status <> 'inspection' then
		raise exception 'return_not_in_inspection' using errcode = 'P0001';
	end if;

	if p_decision = 'release' then
		for v_line in
			select rl.item_id, rl.quantity from public.erp_customer_return_lines rl where rl.return_id = p_return_id
		loop
			select m.location_id, m.lot_id into v_ship
			from public.inventory_movements m
			where m.workspace_id = v_workspace_id and m.reference_type = 'delivery_note'
				and m.reference_id = v_note_id and m.movement_type = 'shipment' and m.item_id = v_line.item_id
			order by m.recorded_at limit 1;
			if not found then
				raise exception 'shipment_record_missing' using errcode = 'P0001';
			end if;
			insert into public.inventory_movements (
				workspace_id, item_id, location_id, lot_id, movement_type, quantity_delta,
				reference_type, reference_id, idempotency_key, recorded_by
			) values (
				v_workspace_id, v_line.item_id, v_ship.location_id, v_ship.lot_id, 'customer_return', v_line.quantity,
				'customer_return', p_return_id, gen_random_uuid(), v_user_id
			);
		end loop;
	end if;

	update public.erp_customer_returns
	set status = case when p_decision = 'release' then 'released' else 'rejected' end,
		resolution_note = left(coalesce(btrim(p_note), ''), 300),
		updated_at = now()
	where id = p_return_id;
end;
$$;

revoke all on function public.erp_create_customer_return(uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.erp_receive_customer_return(uuid) from public, anon, authenticated;
revoke all on function public.erp_resolve_customer_return(uuid, text, text) from public, anon, authenticated;
grant execute on function public.erp_create_customer_return(uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.erp_receive_customer_return(uuid) to authenticated;
grant execute on function public.erp_resolve_customer_return(uuid, text, text) to authenticated;
