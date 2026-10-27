-- Sales order lifecycle (create, confirm with stock reservation, cancel, dispatch
-- assignment) plus the driver fields used by the Delivery Map.

alter table public.erp_clients
	add column if not exists default_driver_id uuid references auth.users (id) on delete set null;

alter table public.erp_sales_orders
	add column if not exists requested_delivery_date date,
	add column if not exists priority text not null default 'normal',
	add column if not exists assigned_driver_id uuid references auth.users (id) on delete set null,
	add column if not exists notes text not null default '',
	add column if not exists confirmed_at timestamptz,
	add column if not exists confirmed_by uuid,
	add column if not exists cancelled_at timestamptz,
	add column if not exists cancel_reason text,
	add column if not exists updated_at timestamptz not null default now();

alter table public.erp_sales_orders
	add constraint erp_sales_orders_priority_check check (priority in ('normal', 'urgent')),
	add constraint erp_sales_orders_notes_check check (char_length(notes) <= 1000);

create index if not exists erp_sales_orders_open_driver_idx
	on public.erp_sales_orders (workspace_id, assigned_driver_id)
	where status in ('draft', 'confirmed', 'part_delivered');

create index if not exists erp_sales_orders_client_history_idx
	on public.erp_sales_orders (workspace_id, client_id, created_at desc);

create table if not exists public.erp_sales_order_events (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null references public.erp_workspaces (id) on delete restrict,
	order_id uuid not null references public.erp_sales_orders (id) on delete cascade,
	event_type text not null check (event_type in ('created', 'confirmed', 'assigned', 'updated', 'cancelled')),
	actor_id uuid,
	detail jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now()
);

create index if not exists erp_sales_order_events_order_idx
	on public.erp_sales_order_events (order_id, created_at);

alter table public.erp_sales_order_events enable row level security;

create policy "manager read sales order events"
	on public.erp_sales_order_events for select to authenticated
	using (
		workspace_id in (
			select m.workspace_id from public.erp_workspace_memberships m
			where m.user_id = (select auth.uid()) and m.is_active and m.role_code = 'manager'
		)
	);

revoke all on public.erp_sales_order_events from anon, authenticated;
grant select on public.erp_sales_order_events to authenticated;

-- Workspace drivers (delivery role or manager) for assignment pickers and map legends.
create or replace function public.erp_list_workspace_drivers()
returns table (user_id uuid, full_name text, role_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
begin
	select r.workspace_id into v_workspace_id
	from erp_private.erp_require_workspace_role(array['manager', 'delivery']) r;

	return query
	select m.user_id, m.full_name, m.role_code
	from public.erp_workspace_memberships m
	where m.workspace_id = v_workspace_id
		and m.is_active
		and m.role_code in ('delivery', 'manager')
	order by m.full_name, m.user_id;
end;
$$;

create or replace function public.erp_create_sales_order(
	p_client_id uuid,
	p_lines jsonb,
	p_requested_delivery_date date,
	p_priority text,
	p_notes text,
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
	v_order_id uuid;
	v_client_name text;
	v_line jsonb;
	v_item_id uuid;
	v_qty integer;
	v_price numeric;
	v_sku text;
	v_name text;
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager']) r;

	if p_idempotency_key is null then
		raise exception 'idempotency_key_required' using errcode = 'P0001';
	end if;
	if coalesce(p_priority, 'normal') not in ('normal', 'urgent') then
		raise exception 'invalid_priority' using errcode = 'P0001';
	end if;
	if char_length(coalesce(p_notes, '')) > 1000 then
		raise exception 'notes_too_long' using errcode = 'P0001';
	end if;
	if p_lines is null or jsonb_typeof(p_lines) <> 'array'
		or jsonb_array_length(p_lines) not between 1 and 100 then
		raise exception 'invalid_order_lines' using errcode = 'P0001';
	end if;

	select o.id into v_order_id
	from public.erp_sales_orders o
	where o.workspace_id = v_workspace_id and o.idempotency_key = p_idempotency_key;
	if found then
		return v_order_id;
	end if;

	select c.name into v_client_name
	from public.erp_clients c
	where c.id = p_client_id and c.workspace_id = v_workspace_id and c.is_active;
	if not found then
		raise exception 'client_not_found' using errcode = 'P0002';
	end if;

	v_order_id := gen_random_uuid();
	insert into public.erp_sales_orders (
		id, workspace_id, document_number, client_id, client_name_snapshot, status,
		created_by, idempotency_key, requested_delivery_date, priority, notes
	) values (
		v_order_id, v_workspace_id,
		'SO-' || to_char(now() at time zone 'Africa/Casablanca', 'YYYYMMDD') || '-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 8)),
		p_client_id, v_client_name, 'draft', v_user_id, p_idempotency_key,
		p_requested_delivery_date, coalesce(p_priority, 'normal'), coalesce(p_notes, '')
	);

	for v_line in select * from jsonb_array_elements(p_lines) loop
		if jsonb_typeof(v_line) <> 'object' or (v_line->>'itemId') is null or (v_line->>'quantity') is null then
			raise exception 'invalid_order_lines' using errcode = 'P0001';
		end if;
		begin
			v_item_id := (v_line->>'itemId')::uuid;
			v_qty := (v_line->>'quantity')::integer;
			v_price := (v_line->>'unitPriceMad')::numeric;
		exception when others then
			raise exception 'invalid_order_lines' using errcode = 'P0001';
		end;
		if v_qty < 1 or v_qty > 10000 or (v_price is not null and v_price < 0) then
			raise exception 'invalid_order_lines' using errcode = 'P0001';
		end if;

		select i.sku, i.name into v_sku, v_name
		from public.inventory_items i
		where i.id = v_item_id and i.workspace_id = v_workspace_id
			and i.item_type = 'finished_good' and i.is_active;
		if not found then
			raise exception 'item_not_found' using errcode = 'P0002';
		end if;

		if v_price is null then
			select s.sale_price_mad into v_price
			from public.erp_product_sizes s
			where s.workspace_id = v_workspace_id and s.inventory_item_id = v_item_id and s.is_active
			limit 1;
			if v_price is null then
				raise exception 'price_required' using errcode = 'P0001';
			end if;
		end if;

		begin
			insert into public.erp_sales_order_lines (
				id, workspace_id, order_id, item_id, sku_snapshot, name_snapshot, quantity, unit_price_mad
			) values (
				gen_random_uuid(), v_workspace_id, v_order_id, v_item_id, v_sku, v_name, v_qty, v_price
			);
		exception when unique_violation then
			raise exception 'duplicate_order_item' using errcode = 'P0001';
		end;
	end loop;

	insert into public.erp_sales_order_events (workspace_id, order_id, event_type, actor_id, detail)
	values (v_workspace_id, v_order_id, 'created', v_user_id, jsonb_build_object('lines', jsonb_array_length(p_lines)));

	return v_order_id;
end;
$$;

create or replace function public.erp_confirm_sales_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_status text;
	v_line record;
	v_bucket record;
	v_need numeric;
	v_take numeric;
	v_short jsonb := '[]'::jsonb;
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager']) r;

	select o.status into v_status
	from public.erp_sales_orders o
	where o.id = p_order_id and o.workspace_id = v_workspace_id
	for update;
	if not found then
		raise exception 'sales_order_not_found' using errcode = 'P0002';
	end if;
	if v_status <> 'draft' then
		raise exception 'sales_order_not_confirmable' using errcode = 'P0001';
	end if;

	-- Lock items in a stable order so concurrent confirmations cannot deadlock.
	perform 1 from public.inventory_items i
	where i.id in (select l.item_id from public.erp_sales_order_lines l where l.order_id = p_order_id)
	order by i.id for update;

	for v_line in
		select l.item_id, l.sku_snapshot, l.quantity
		from public.erp_sales_order_lines l
		where l.order_id = p_order_id
		order by l.item_id
	loop
		v_need := v_line.quantity;

		for v_bucket in
			select b.location_id, b.lot_id, b.free
			from (
				select m.location_id, m.lot_id,
					sum(m.quantity_delta) - coalesce((
						select sum(r.quantity) from public.inventory_reservations r
						where r.workspace_id = m.workspace_id and r.item_id = m.item_id
							and r.location_id = m.location_id and r.lot_id is not distinct from m.lot_id
							and r.status = 'active'
					), 0) as free,
					max(lt.expires_on) as expires_on
				from public.inventory_movements m
				join public.inventory_locations loc on loc.id = m.location_id and loc.location_type = 'warehouse' and loc.is_active
				left join public.inventory_lots lt on lt.id = m.lot_id
				where m.workspace_id = v_workspace_id and m.item_id = v_line.item_id
					and (m.lot_id is null or lt.lot_status = 'available')
				group by m.workspace_id, m.item_id, m.location_id, m.lot_id
			) b
			where b.free > 0
			order by b.expires_on nulls last, b.location_id
		loop
			exit when v_need <= 0;
			v_take := least(v_need, v_bucket.free);
			insert into public.inventory_reservations (
				item_id, location_id, lot_id, quantity, source_type, source_id, status,
				idempotency_key, reserved_by, workspace_id
			) values (
				v_line.item_id, v_bucket.location_id, v_bucket.lot_id, v_take, 'sales_order', p_order_id, 'active',
				gen_random_uuid(), v_user_id, v_workspace_id
			);
			v_need := v_need - v_take;
		end loop;

		if v_need > 0 then
			v_short := v_short || jsonb_build_object('sku', v_line.sku_snapshot, 'short', v_need);
		end if;
	end loop;

	if jsonb_array_length(v_short) > 0 then
		raise exception 'insufficient_stock' using errcode = 'P0001', detail = v_short::text;
	end if;

	update public.erp_sales_orders
	set status = 'confirmed', confirmed_at = now(), confirmed_by = v_user_id, updated_at = now()
	where id = p_order_id;

	insert into public.erp_sales_order_events (workspace_id, order_id, event_type, actor_id)
	values (v_workspace_id, p_order_id, 'confirmed', v_user_id);
end;
$$;

create or replace function public.erp_cancel_sales_order(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_status text;
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager']) r;

	if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 300 then
		raise exception 'cancel_reason_required' using errcode = 'P0001';
	end if;

	select o.status into v_status
	from public.erp_sales_orders o
	where o.id = p_order_id and o.workspace_id = v_workspace_id
	for update;
	if not found then
		raise exception 'sales_order_not_found' using errcode = 'P0002';
	end if;
	if v_status not in ('draft', 'confirmed')
		or exists (select 1 from public.erp_delivery_notes d where d.order_id = p_order_id) then
		raise exception 'sales_order_not_cancellable' using errcode = 'P0001';
	end if;

	update public.inventory_reservations
	set status = 'released', closed_at = now()
	where workspace_id = v_workspace_id and source_type = 'sales_order'
		and source_id = p_order_id and status = 'active';

	update public.erp_sales_orders
	set status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(p_reason), updated_at = now()
	where id = p_order_id;

	insert into public.erp_sales_order_events (workspace_id, order_id, event_type, actor_id, detail)
	values (v_workspace_id, p_order_id, 'cancelled', v_user_id, jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

create or replace function public.erp_update_sales_order_dispatch(
	p_order_id uuid,
	p_driver_id uuid,
	p_requested_delivery_date date,
	p_priority text,
	p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_status text;
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager']) r;

	if coalesce(p_priority, 'normal') not in ('normal', 'urgent') then
		raise exception 'invalid_priority' using errcode = 'P0001';
	end if;
	if char_length(coalesce(p_notes, '')) > 1000 then
		raise exception 'notes_too_long' using errcode = 'P0001';
	end if;

	select o.status into v_status
	from public.erp_sales_orders o
	where o.id = p_order_id and o.workspace_id = v_workspace_id
	for update;
	if not found then
		raise exception 'sales_order_not_found' using errcode = 'P0002';
	end if;
	if v_status not in ('draft', 'confirmed', 'part_delivered') then
		raise exception 'sales_order_closed' using errcode = 'P0001';
	end if;

	if p_driver_id is not null and not exists (
		select 1 from public.erp_workspace_memberships m
		where m.workspace_id = v_workspace_id and m.user_id = p_driver_id
			and m.is_active and m.role_code in ('delivery', 'manager')
	) then
		raise exception 'driver_not_found' using errcode = 'P0002';
	end if;

	update public.erp_sales_orders
	set assigned_driver_id = p_driver_id,
		requested_delivery_date = p_requested_delivery_date,
		priority = coalesce(p_priority, 'normal'),
		notes = coalesce(p_notes, ''),
		updated_at = now()
	where id = p_order_id;

	insert into public.erp_sales_order_events (workspace_id, order_id, event_type, actor_id, detail)
	values (v_workspace_id, p_order_id, 'assigned', v_user_id, jsonb_build_object(
		'driverId', p_driver_id,
		'requestedDeliveryDate', p_requested_delivery_date,
		'priority', coalesce(p_priority, 'normal')
	));
end;
$$;

create or replace function public.erp_set_client_driver(p_client_id uuid, p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
begin
	select r.workspace_id into v_workspace_id
	from erp_private.erp_require_workspace_role(array['manager']) r;

	if p_driver_id is not null and not exists (
		select 1 from public.erp_workspace_memberships m
		where m.workspace_id = v_workspace_id and m.user_id = p_driver_id
			and m.is_active and m.role_code in ('delivery', 'manager')
	) then
		raise exception 'driver_not_found' using errcode = 'P0002';
	end if;

	update public.erp_clients set default_driver_id = p_driver_id
	where id = p_client_id and workspace_id = v_workspace_id;
	if not found then
		raise exception 'client_not_found' using errcode = 'P0002';
	end if;
end;
$$;

revoke all on function public.erp_list_workspace_drivers() from public, anon, authenticated;
revoke all on function public.erp_create_sales_order(uuid, jsonb, date, text, text, uuid) from public, anon, authenticated;
revoke all on function public.erp_confirm_sales_order(uuid) from public, anon, authenticated;
revoke all on function public.erp_cancel_sales_order(uuid, text) from public, anon, authenticated;
revoke all on function public.erp_update_sales_order_dispatch(uuid, uuid, date, text, text) from public, anon, authenticated;
revoke all on function public.erp_set_client_driver(uuid, uuid) from public, anon, authenticated;

grant execute on function public.erp_list_workspace_drivers() to authenticated;
grant execute on function public.erp_create_sales_order(uuid, jsonb, date, text, text, uuid) to authenticated;
grant execute on function public.erp_confirm_sales_order(uuid) to authenticated;
grant execute on function public.erp_cancel_sales_order(uuid, text) to authenticated;
grant execute on function public.erp_update_sales_order_dispatch(uuid, uuid, date, text, text) to authenticated;
grant execute on function public.erp_set_client_driver(uuid, uuid) to authenticated;
