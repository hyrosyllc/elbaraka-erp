alter table public.erp_purchase_orders
	add column idempotency_key uuid;

create unique index erp_purchase_orders_workspace_idempotency_idx
	on public.erp_purchase_orders (workspace_id, idempotency_key)
	where idempotency_key is not null;

create table public.erp_purchase_receipts (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	document_number text not null,
	purchase_order_id uuid not null references public.erp_purchase_orders(id) on delete restrict,
	supplier_delivery_reference text not null default '',
	idempotency_key uuid not null,
	received_by uuid not null references auth.users(id) on delete restrict,
	created_at timestamptz not null default now(),
	unique (workspace_id, document_number),
	unique (workspace_id, idempotency_key)
);

create index erp_purchase_receipts_workspace_created_idx
	on public.erp_purchase_receipts (workspace_id, created_at desc);
create index erp_purchase_receipts_workspace_order_idx
	on public.erp_purchase_receipts (workspace_id, purchase_order_id);

create table public.erp_purchase_receipt_lines (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	receipt_id uuid not null references public.erp_purchase_receipts(id) on delete restrict,
	purchase_order_line_id uuid not null references public.erp_purchase_order_lines(id) on delete restrict,
	item_id uuid not null references public.inventory_items(id) on delete restrict,
	location_id uuid not null references public.inventory_locations(id) on delete restrict,
	lot_id uuid,
	quantity numeric(18, 3) not null check (quantity > 0),
	unit_cost_mad numeric(14, 5) not null check (unit_cost_mad >= 0),
	created_at timestamptz not null default now(),
	foreign key (item_id, lot_id)
		references public.inventory_lots(item_id, id) on delete restrict
);

create index erp_purchase_receipt_lines_receipt_idx
	on public.erp_purchase_receipt_lines (receipt_id, created_at);
create index erp_purchase_receipt_lines_purchase_line_idx
	on public.erp_purchase_receipt_lines (purchase_order_line_id);
create index erp_purchase_receipt_lines_item_lot_idx
	on public.erp_purchase_receipt_lines (item_id, lot_id);
create index erp_purchase_receipt_lines_location_idx
	on public.erp_purchase_receipt_lines (location_id);

create table public.inventory_transfers (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	document_number text not null,
	item_id uuid not null references public.inventory_items(id) on delete restrict,
	lot_id uuid,
	from_location_id uuid not null references public.inventory_locations(id) on delete restrict,
	to_location_id uuid not null references public.inventory_locations(id) on delete restrict,
	quantity numeric(18, 3) not null check (quantity > 0),
	reason text not null check (length(btrim(reason)) between 5 and 500),
	idempotency_key uuid not null,
	created_by uuid not null references auth.users(id) on delete restrict,
	created_at timestamptz not null default now(),
	foreign key (item_id, lot_id)
		references public.inventory_lots(item_id, id) on delete restrict,
	check (from_location_id <> to_location_id),
	unique (workspace_id, document_number),
	unique (workspace_id, idempotency_key)
);

create index inventory_transfers_workspace_created_idx
	on public.inventory_transfers (workspace_id, created_at desc);
create index inventory_transfers_item_lot_idx
	on public.inventory_transfers (item_id, lot_id);
create index inventory_transfers_locations_idx
	on public.inventory_transfers (from_location_id, to_location_id);

create table public.inventory_adjustment_requests (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	item_id uuid not null references public.inventory_items(id) on delete restrict,
	location_id uuid not null references public.inventory_locations(id) on delete restrict,
	lot_id uuid,
	quantity_delta numeric(18, 3) not null check (quantity_delta <> 0),
	reason text not null check (length(btrim(reason)) between 5 and 500),
	status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
	idempotency_key uuid not null,
	requested_by uuid not null references auth.users(id) on delete restrict,
	reviewed_by uuid references auth.users(id) on delete restrict,
	reviewed_at timestamptz,
	review_note text not null default '',
	created_at timestamptz not null default now(),
	foreign key (item_id, lot_id)
		references public.inventory_lots(item_id, id) on delete restrict,
	check (reviewed_by is distinct from requested_by),
	check (
		(status = 'pending' and reviewed_by is null and reviewed_at is null)
		or (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
	)
);

create unique index inventory_adjustments_workspace_idempotency_idx
	on public.inventory_adjustment_requests (workspace_id, idempotency_key);

create index inventory_adjustments_workspace_status_created_idx
	on public.inventory_adjustment_requests (workspace_id, status, created_at desc);
create index inventory_adjustments_item_lot_idx
	on public.inventory_adjustment_requests (item_id, lot_id);
create index inventory_adjustments_location_idx
	on public.inventory_adjustment_requests (location_id);

create index inventory_movements_workspace_item_location_lot_idx
	on public.inventory_movements (workspace_id, item_id, location_id, lot_id);
create index inventory_reservations_workspace_item_location_lot_active_idx
	on public.inventory_reservations (workspace_id, item_id, location_id, lot_id)
	where status = 'active';

alter table public.erp_purchase_receipts enable row level security;
alter table public.erp_purchase_receipt_lines enable row level security;
alter table public.inventory_transfers enable row level security;
alter table public.inventory_adjustment_requests enable row level security;

revoke all privileges on table public.erp_purchase_receipts from public, anon, authenticated;
revoke all privileges on table public.erp_purchase_receipt_lines from public, anon, authenticated;
revoke all privileges on table public.inventory_transfers from public, anon, authenticated;
revoke all privileges on table public.inventory_adjustment_requests from public, anon, authenticated;
grant select on table public.erp_purchase_receipts, public.erp_purchase_receipt_lines,
	public.inventory_transfers, public.inventory_adjustment_requests to authenticated;

create policy "workspace purchasing roles can read purchase receipts"
	on public.erp_purchase_receipts
	for select to authenticated
	using (
		workspace_id in (
			select workspace_id from public.erp_workspace_memberships
			where user_id = (select auth.uid())
				and is_active
				and role_code in ('manager', 'purchasing')
		)
	);

create policy "workspace purchasing roles can read purchase receipt lines"
	on public.erp_purchase_receipt_lines
	for select to authenticated
	using (
		workspace_id in (
			select workspace_id from public.erp_workspace_memberships
			where user_id = (select auth.uid())
				and is_active
				and role_code in ('manager', 'purchasing')
		)
	);

create policy "workspace purchasing roles can read inventory transfers"
	on public.inventory_transfers
	for select to authenticated
	using (
		workspace_id in (
			select workspace_id from public.erp_workspace_memberships
			where user_id = (select auth.uid())
				and is_active
				and role_code in ('manager', 'purchasing')
		)
	);

create policy "workspace purchasing roles can read inventory adjustments"
	on public.inventory_adjustment_requests
	for select to authenticated
	using (
		workspace_id in (
			select workspace_id from public.erp_workspace_memberships
			where user_id = (select auth.uid())
				and is_active
				and role_code in ('manager', 'purchasing')
		)
	);

create schema erp_private;
revoke all on schema erp_private from public, anon, authenticated;

create function erp_private.erp_require_workspace_role(p_allowed_roles text[])
returns table (workspace_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_user_id uuid := auth.uid();
	v_membership_count integer;
	v_workspace_id uuid;
begin
	if v_user_id is null then
		raise exception using errcode = '42501', message = 'authentication_required';
	end if;

	select count(*)::integer, (array_agg(m.workspace_id))[1]
		into v_membership_count, v_workspace_id
	from public.erp_workspace_memberships m
	where m.user_id = v_user_id
		and m.is_active
		and m.role_code = any (p_allowed_roles);

	if v_membership_count <> 1 then
		raise exception using errcode = '42501', message = 'workspace_access_denied';
	end if;

	return query select v_workspace_id, v_user_id;
end;
$$;

revoke all on function erp_private.erp_require_workspace_role(text[]) from public, anon, authenticated;

create function public.erp_create_inventory_item(
	p_sku text,
	p_name text,
	p_item_type text,
	p_base_unit text,
	p_track_lots boolean,
	p_reorder_point numeric,
	p_net_weight_g numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_item_id uuid;
	v_sku text := upper(btrim(coalesce(p_sku, '')));
	v_name text := btrim(coalesce(p_name, ''));
	v_reorder_point numeric := coalesce(p_reorder_point, 0);
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager']);

	if v_sku !~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'
		or length(v_name) not between 1 and 160
		or p_item_type is null
		or p_item_type not in ('raw_material', 'packaging', 'blend', 'finished_good')
		or p_base_unit is null
		or p_track_lots is null
		or v_reorder_point < 0
		or round(v_reorder_point, 3) <> v_reorder_point then
		raise exception using errcode = 'P0001', message = 'invalid_item';
	end if;

	if (p_item_type in ('raw_material', 'blend') and p_base_unit <> 'g')
		or (p_item_type in ('packaging', 'finished_good') and p_base_unit <> 'each')
		or (p_item_type = 'finished_good' and (p_net_weight_g is null or p_net_weight_g <= 0))
		or (p_item_type <> 'finished_good' and p_net_weight_g is not null) then
		raise exception using errcode = 'P0001', message = 'invalid_item_unit';
	end if;

	insert into public.inventory_items (
		workspace_id, sku, name, item_type, base_unit, net_weight_g,
		track_lots, reorder_point, is_active
	)
	values (
		v_workspace_id, v_sku, v_name, p_item_type, p_base_unit, p_net_weight_g,
		p_track_lots, v_reorder_point, true
	)
	returning id into v_item_id;

	return jsonb_build_object('id', v_item_id, 'sku', v_sku, 'name', v_name);
end;
$$;

create function public.erp_create_inventory_location(
	p_code text,
	p_name text,
	p_location_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_location_id uuid;
	v_code text := upper(btrim(coalesce(p_code, '')));
	v_name text := btrim(coalesce(p_name, ''));
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager']);

	if v_code !~ '^[A-Z0-9][A-Z0-9_-]{0,39}$'
		or length(v_name) not between 1 and 160
		or p_location_type is null
		or p_location_type not in ('warehouse', 'production', 'quarantine', 'transit', 'customer') then
		raise exception using errcode = 'P0001', message = 'invalid_location';
	end if;

	insert into public.inventory_locations (workspace_id, code, name, location_type, is_active)
	values (v_workspace_id, v_code, v_name, p_location_type, true)
	returning id into v_location_id;

	return jsonb_build_object('id', v_location_id, 'code', v_code, 'name', v_name);
end;
$$;

create function public.erp_create_purchase_order(
	p_supplier_id uuid,
	p_expected_at date,
	p_lines jsonb,
	p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_order_id uuid;
	v_document_number text;
	v_supplier_name text;
	v_line jsonb;
	v_item_id uuid;
	v_quantity numeric;
	v_unit_cost numeric;
	v_item record;
	v_existing record;
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager', 'purchasing']);

	if p_idempotency_key is null or jsonb_typeof(p_lines) is distinct from 'array' then
		raise exception using errcode = 'P0001', message = 'invalid_purchase_order';
	end if;
	if jsonb_array_length(p_lines) not between 1 and 100 then
		raise exception using errcode = 'P0001', message = 'invalid_purchase_order';
	end if;

	select po.id, po.document_number into v_existing
	from public.erp_purchase_orders po
	where po.workspace_id = v_workspace_id
		and po.idempotency_key = p_idempotency_key;
	if found then
		return jsonb_build_object('id', v_existing.id, 'document_number', v_existing.document_number, 'duplicate', true);
	end if;

	select s.name into v_supplier_name
	from public.erp_suppliers s
	where s.id = p_supplier_id
		and s.workspace_id = v_workspace_id
		and s.is_active;
	if not found then
		raise exception using errcode = 'P0002', message = 'supplier_not_found';
	end if;

	for v_line in select value from jsonb_array_elements(p_lines)
	loop
		if jsonb_typeof(v_line) <> 'object' then
			raise exception using errcode = 'P0001', message = 'invalid_purchase_order_line';
		end if;
		v_item_id := (v_line ->> 'item_id')::uuid;
		v_quantity := (v_line ->> 'quantity_ordered')::numeric;
		v_unit_cost := (v_line ->> 'unit_cost_mad')::numeric;

		if v_item_id is null or v_quantity is null or v_unit_cost is null
			or v_quantity <= 0 or round(v_quantity, 3) <> v_quantity
			or v_unit_cost < 0 or round(v_unit_cost, 5) <> v_unit_cost then
			raise exception using errcode = 'P0001', message = 'invalid_purchase_order_line';
		end if;

		select i.id, i.sku, i.name, i.base_unit into v_item
		from public.inventory_items i
		where i.id = v_item_id
			and i.workspace_id = v_workspace_id
			and i.is_active;
		if not found then
			raise exception using errcode = 'P0002', message = 'item_not_found';
		end if;
		if v_item.base_unit = 'each' and v_quantity <> trunc(v_quantity) then
			raise exception using errcode = 'P0001', message = 'whole_quantity_required';
		end if;
		if exists (
			select 1
			from jsonb_array_elements(p_lines) j(value)
			where (j.value ->> 'item_id')::uuid = v_item_id
			group by j.value ->> 'item_id'
			having count(*) > 1
		) then
			raise exception using errcode = 'P0001', message = 'duplicate_purchase_order_item';
		end if;
	end loop;

	v_document_number := 'PO-' || to_char(current_date, 'YYYYMMDD') || '-'
		|| upper(replace(p_idempotency_key::text, '-', ''));

	insert into public.erp_purchase_orders (
		id, workspace_id, document_number, supplier_id, supplier_name_snapshot,
		status, expected_at, created_by, idempotency_key
	)
	values (
		gen_random_uuid(), v_workspace_id, v_document_number, p_supplier_id, v_supplier_name,
		'draft', p_expected_at, v_user_id, p_idempotency_key
	)
	on conflict (workspace_id, idempotency_key) where idempotency_key is not null
	do nothing
	returning id into v_order_id;

	if v_order_id is null then
		select po.id, po.document_number into v_existing
		from public.erp_purchase_orders po
		where po.workspace_id = v_workspace_id
			and po.idempotency_key = p_idempotency_key;
		return jsonb_build_object('id', v_existing.id, 'document_number', v_existing.document_number, 'duplicate', true);
	end if;

	for v_line in select value from jsonb_array_elements(p_lines)
	loop
		v_item_id := (v_line ->> 'item_id')::uuid;
		v_quantity := (v_line ->> 'quantity_ordered')::numeric;
		v_unit_cost := (v_line ->> 'unit_cost_mad')::numeric;
		select i.sku, i.name into v_item
		from public.inventory_items i
		where i.id = v_item_id and i.workspace_id = v_workspace_id;

		insert into public.erp_purchase_order_lines (
			id, workspace_id, purchase_order_id, item_id, sku_snapshot, name_snapshot,
			quantity_ordered, quantity_received, unit_cost_mad
		)
		values (
			gen_random_uuid(), v_workspace_id, v_order_id, v_item_id, v_item.sku, v_item.name,
			v_quantity, 0, v_unit_cost
		);
	end loop;

	return jsonb_build_object('id', v_order_id, 'document_number', v_document_number, 'duplicate', false);
end;
$$;

create function public.erp_mark_purchase_order_ordered(p_purchase_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_order record;
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager', 'purchasing']);

	select po.id, po.document_number, po.status into v_order
	from public.erp_purchase_orders po
	where po.id = p_purchase_order_id and po.workspace_id = v_workspace_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'purchase_order_not_found';
	end if;
	if v_order.status <> 'draft' then
		raise exception using errcode = 'P0001', message = 'purchase_order_not_draft';
	end if;
	if not exists (
		select 1 from public.erp_purchase_order_lines pol
		where pol.purchase_order_id = v_order.id
			and pol.workspace_id = v_workspace_id
	) then
		raise exception using errcode = 'P0001', message = 'purchase_order_has_no_lines';
	end if;

	update public.erp_purchase_orders
	set status = 'ordered', ordered_at = now()
	where id = v_order.id and workspace_id = v_workspace_id;

	return jsonb_build_object('id', v_order.id, 'document_number', v_order.document_number, 'status', 'ordered');
end;
$$;

create function public.erp_cancel_purchase_order(p_purchase_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_order record;
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager', 'purchasing']);

	select po.id, po.document_number, po.status into v_order
	from public.erp_purchase_orders po
	where po.id = p_purchase_order_id and po.workspace_id = v_workspace_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'purchase_order_not_found';
	end if;
	if v_order.status not in ('draft', 'ordered') then
		raise exception using errcode = 'P0001', message = 'purchase_order_not_cancellable';
	end if;
	if exists (
		select 1 from public.erp_purchase_order_lines pol
		where pol.purchase_order_id = v_order.id
			and pol.workspace_id = v_workspace_id
			and pol.quantity_received > 0
	) then
		raise exception using errcode = 'P0001', message = 'purchase_order_has_receipts';
	end if;

	update public.erp_purchase_orders set status = 'cancelled'
	where id = v_order.id and workspace_id = v_workspace_id;
	return jsonb_build_object('id', v_order.id, 'document_number', v_order.document_number, 'status', 'cancelled');
end;
$$;

create function public.erp_receive_purchase_order(
	p_purchase_order_id uuid,
	p_supplier_delivery_reference text,
	p_received_lines jsonb,
	p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_order record;
	v_receipt_id uuid;
	v_document_number text;
	v_line jsonb;
	v_line_id uuid;
	v_item_id uuid;
	v_location_id uuid;
	v_quantity numeric;
	v_line_quantity numeric;
	v_lot_id uuid;
	v_lot_code text;
	v_supplier_lot_code text;
	v_expires_on date;
	v_quarantine boolean;
	v_location_type text;
	v_item record;
	v_lot record;
	v_existing record;
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager', 'purchasing']);

	if p_idempotency_key is null
		or jsonb_typeof(p_received_lines) is distinct from 'array'
		or length(btrim(coalesce(p_supplier_delivery_reference, ''))) > 120 then
		raise exception using errcode = 'P0001', message = 'invalid_receipt';
	end if;
	if jsonb_array_length(p_received_lines) not between 1 and 100 then
		raise exception using errcode = 'P0001', message = 'invalid_receipt';
	end if;

	select r.id, r.document_number into v_existing
	from public.erp_purchase_receipts r
	where r.workspace_id = v_workspace_id and r.idempotency_key = p_idempotency_key;
	if found then
		return jsonb_build_object('id', v_existing.id, 'document_number', v_existing.document_number, 'duplicate', true);
	end if;

	select po.id, po.document_number, po.status into v_order
	from public.erp_purchase_orders po
	where po.id = p_purchase_order_id and po.workspace_id = v_workspace_id
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'purchase_order_not_found';
	end if;

	select r.id, r.document_number into v_existing
	from public.erp_purchase_receipts r
	where r.workspace_id = v_workspace_id and r.idempotency_key = p_idempotency_key;
	if found then
		return jsonb_build_object('id', v_existing.id, 'document_number', v_existing.document_number, 'duplicate', true);
	end if;

	if v_order.status not in ('ordered', 'part_received') then
		raise exception using errcode = 'P0001', message = 'purchase_order_not_receivable';
	end if;
	if not exists (
		select 1 from public.erp_purchase_order_lines pol
		where pol.purchase_order_id = v_order.id and pol.workspace_id = v_workspace_id
	) then
		raise exception using errcode = 'P0001', message = 'purchase_order_has_no_lines';
	end if;

	v_document_number := 'REC-' || to_char(current_date, 'YYYYMMDD') || '-'
		|| upper(replace(p_idempotency_key::text, '-', ''));

	insert into public.erp_purchase_receipts (
		workspace_id, document_number, purchase_order_id,
		supplier_delivery_reference, idempotency_key, received_by
	)
	values (
		v_workspace_id, v_document_number, v_order.id,
		btrim(coalesce(p_supplier_delivery_reference, '')), p_idempotency_key, v_user_id
	)
	on conflict (workspace_id, idempotency_key) do nothing
	returning id into v_receipt_id;

	if v_receipt_id is null then
		select r.id, r.document_number into v_existing
		from public.erp_purchase_receipts r
		where r.workspace_id = v_workspace_id and r.idempotency_key = p_idempotency_key;
		return jsonb_build_object('id', v_existing.id, 'document_number', v_existing.document_number, 'duplicate', true);
	end if;

	for v_item_id in
		select distinct pol.item_id
		from jsonb_array_elements(p_received_lines) incoming(value)
		join public.erp_purchase_order_lines pol
			on pol.id = (incoming.value ->> 'purchase_order_line_id')::uuid
			and pol.purchase_order_id = v_order.id
			and pol.workspace_id = v_workspace_id
		order by pol.item_id
	loop
		perform i.id from public.inventory_items i
		where i.id = v_item_id and i.workspace_id = v_workspace_id
		for update;
	end loop;

	for v_line in select value from jsonb_array_elements(p_received_lines)
	loop
		v_line_id := (v_line ->> 'purchase_order_line_id')::uuid;
		v_quantity := (v_line ->> 'quantity')::numeric;
		if v_line_id is null or v_quantity is null
			or v_quantity <= 0 or round(v_quantity, 3) <> v_quantity then
			raise exception using errcode = 'P0001', message = 'invalid_receipt_quantity';
		end if;

		select pol.item_id, pol.quantity_ordered, pol.quantity_received,
			pol.unit_cost_mad, i.base_unit, i.track_lots
			into v_item
		from public.erp_purchase_order_lines pol
		join public.inventory_items i
			on i.id = pol.item_id and i.workspace_id = pol.workspace_id
		where pol.id = v_line_id
			and pol.purchase_order_id = v_order.id
			and pol.workspace_id = v_workspace_id
			and i.is_active;
		if not found then
			raise exception using errcode = 'P0002', message = 'purchase_order_line_not_found';
		end if;

		if v_item.base_unit = 'each' and v_quantity <> trunc(v_quantity) then
			raise exception using errcode = 'P0001', message = 'whole_quantity_required';
		end if;

		select coalesce(sum((incoming.value ->> 'quantity')::numeric), 0)
			into v_line_quantity
		from jsonb_array_elements(p_received_lines) incoming(value)
		where (incoming.value ->> 'purchase_order_line_id')::uuid = v_line_id;
		if v_line_quantity > v_item.quantity_ordered - v_item.quantity_received then
			raise exception using errcode = 'P0001', message = 'receipt_exceeds_open_quantity';
		end if;

		v_location_id := (v_line ->> 'location_id')::uuid;
		select l.location_type into v_location_type
		from public.inventory_locations l
		where l.id = v_location_id
			and l.workspace_id = v_workspace_id
			and l.is_active;
		if not found or v_location_type not in ('warehouse', 'production', 'quarantine') then
			raise exception using errcode = 'P0001', message = 'invalid_receiving_location';
		end if;

		v_lot_code := nullif(btrim(coalesce(v_line ->> 'lot_code', '')), '');
		v_supplier_lot_code := nullif(btrim(coalesce(v_line ->> 'supplier_lot_code', '')), '');
		v_expires_on := nullif(v_line ->> 'expires_on', '')::date;
		v_quarantine := coalesce((v_line ->> 'quarantine')::boolean, false);

		if length(coalesce(v_lot_code, '')) > 120
			or length(coalesce(v_supplier_lot_code, '')) > 120
			or (v_expires_on is not null and v_expires_on < current_date) then
			raise exception using errcode = 'P0001', message = 'invalid_receipt_lot';
		end if;

		if v_item.track_lots then
			if v_lot_code is null or jsonb_typeof(v_line -> 'quarantine') <> 'boolean' then
				raise exception using errcode = 'P0001', message = 'lot_details_required';
			end if;
			if (v_quarantine and v_location_type <> 'quarantine')
				or (not v_quarantine and v_location_type = 'quarantine') then
				raise exception using errcode = 'P0001', message = 'quarantine_location_mismatch';
			end if;

			if exists (
				select 1
				from jsonb_array_elements(p_received_lines) other(value)
				where other.value ->> 'purchase_order_line_id' = v_line_id::text
					and other.value ->> 'lot_code' = v_lot_code
					and other.value <> v_line
			) then
				raise exception using errcode = 'P0001', message = 'duplicate_receipt_lot';
			end if;

			insert into public.inventory_lots (
				workspace_id, item_id, lot_code, supplier_lot_code, expires_on, lot_status
			)
			values (
				v_workspace_id, v_item.item_id, v_lot_code, v_supplier_lot_code, v_expires_on,
				case when v_quarantine then 'quarantined' else 'available' end
			)
			on conflict (item_id, lot_code) do nothing;

			select l.id, l.supplier_lot_code, l.expires_on, l.lot_status
				into v_lot
			from public.inventory_lots l
			where l.workspace_id = v_workspace_id
				and l.item_id = v_item.item_id
				and l.lot_code = v_lot_code
			for update;
			if not found then
				raise exception using errcode = 'P0001', message = 'invalid_receipt_lot';
			end if;
			if v_lot.supplier_lot_code is distinct from v_supplier_lot_code
				or v_lot.expires_on is distinct from v_expires_on
				or v_lot.lot_status in ('closed', 'expired')
				or v_lot.lot_status is distinct from (case when v_quarantine then 'quarantined' else 'available' end) then
				raise exception using errcode = 'P0001', message = 'receipt_lot_mismatch';
			end if;
			v_lot_id := v_lot.id;
		else
			if v_lot_code is not null or v_supplier_lot_code is not null
				or v_expires_on is not null or v_quarantine
				or v_location_type = 'quarantine' then
				raise exception using errcode = 'P0001', message = 'unexpected_lot_details';
			end if;
			v_lot_id := null;
		end if;

		insert into public.erp_purchase_receipt_lines (
			workspace_id, receipt_id, purchase_order_line_id, item_id,
			location_id, lot_id, quantity, unit_cost_mad
		)
		values (v_workspace_id, v_receipt_id,
			v_line_id, v_item.item_id, v_location_id, v_lot_id, v_quantity, v_item.unit_cost_mad);
	end loop;

	for v_line_id in
		select distinct (incoming.value ->> 'purchase_order_line_id')::uuid
		from jsonb_array_elements(p_received_lines) incoming(value)
	loop
		select coalesce(sum((incoming.value ->> 'quantity')::numeric), 0)
			into v_line_quantity
		from jsonb_array_elements(p_received_lines) incoming(value)
		where (incoming.value ->> 'purchase_order_line_id')::uuid = v_line_id;

		update public.erp_purchase_order_lines pol
		set quantity_received = pol.quantity_received + v_line_quantity
		where pol.id = v_line_id
			and pol.purchase_order_id = v_order.id
			and pol.workspace_id = v_workspace_id;
	end loop;

	insert into public.inventory_movements (
		workspace_id, item_id, location_id, lot_id, movement_type,
		quantity_delta, reference_type, reference_id, idempotency_key, recorded_by
	)
	select rl.workspace_id, rl.item_id, rl.location_id, rl.lot_id, 'purchase_receipt',
		rl.quantity, 'erp_purchase_receipt', v_receipt_id, gen_random_uuid(), v_user_id
	from public.erp_purchase_receipt_lines rl
	where rl.receipt_id = v_receipt_id
		and rl.workspace_id = v_workspace_id;

	update public.erp_purchase_orders po
	set status = case
		when exists (
			select 1 from public.erp_purchase_order_lines pol
			where pol.purchase_order_id = po.id
				and pol.workspace_id = v_workspace_id
				and pol.quantity_received < pol.quantity_ordered
		) then 'part_received'
		else 'received'
	end
	where po.id = v_order.id and po.workspace_id = v_workspace_id;

	return jsonb_build_object('id', v_receipt_id, 'document_number', v_document_number, 'duplicate', false);
end;
$$;

create function public.erp_create_inventory_transfer(
	p_item_id uuid,
	p_lot_id uuid,
	p_from_location_id uuid,
	p_to_location_id uuid,
	p_quantity numeric,
	p_reason text,
	p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_transfer_id uuid;
	v_document_number text;
	v_existing record;
	v_item record;
	v_from_type text;
	v_to_type text;
	v_lot_status text;
	v_on_hand numeric;
	v_reserved numeric;
	v_reason text := btrim(coalesce(p_reason, ''));
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager', 'purchasing']);

	if p_idempotency_key is null
		or p_quantity is null or p_quantity <= 0 or round(p_quantity, 3) <> p_quantity
		or p_from_location_id = p_to_location_id
		or length(v_reason) not between 5 and 500 then
		raise exception using errcode = 'P0001', message = 'invalid_transfer';
	end if;

	select t.id, t.document_number into v_existing
	from public.inventory_transfers t
	where t.workspace_id = v_workspace_id and t.idempotency_key = p_idempotency_key;
	if found then
		return jsonb_build_object('id', v_existing.id, 'document_number', v_existing.document_number, 'duplicate', true);
	end if;

	select i.id, i.base_unit, i.track_lots into v_item
	from public.inventory_items i
	where i.id = p_item_id and i.workspace_id = v_workspace_id and i.is_active
	for update;
	if not found then
		raise exception using errcode = 'P0002', message = 'item_not_found';
	end if;
	if v_item.base_unit = 'each' and p_quantity <> trunc(p_quantity) then
		raise exception using errcode = 'P0001', message = 'whole_quantity_required';
	end if;
	if (v_item.track_lots and p_lot_id is null) or (not v_item.track_lots and p_lot_id is not null) then
		raise exception using errcode = 'P0001', message = 'lot_selection_mismatch';
	end if;

	perform l.id from public.inventory_locations l
	where l.workspace_id = v_workspace_id
		and l.id in (p_from_location_id, p_to_location_id)
	order by l.id
	for update;

	select l.location_type into v_from_type from public.inventory_locations l
	where l.id = p_from_location_id and l.workspace_id = v_workspace_id and l.is_active;
	select l.location_type into v_to_type from public.inventory_locations l
	where l.id = p_to_location_id and l.workspace_id = v_workspace_id and l.is_active;
	if v_from_type is null or v_to_type is null
		or v_from_type in ('customer', 'transit')
		or v_to_type in ('customer', 'transit') then
		raise exception using errcode = 'P0001', message = 'invalid_transfer_location';
	end if;

	if p_lot_id is not null then
		select l.lot_status into v_lot_status
		from public.inventory_lots l
		where l.id = p_lot_id and l.item_id = p_item_id and l.workspace_id = v_workspace_id;
		if not found or v_lot_status in ('closed', 'expired') then
			raise exception using errcode = 'P0001', message = 'invalid_transfer_lot';
		end if;
		if v_lot_status = 'quarantined' and v_to_type <> 'quarantine' then
			raise exception using errcode = 'P0001', message = 'quarantined_lot_requires_quarantine_location';
		end if;
		if (v_lot_status = 'quarantined') <> (v_from_type = 'quarantine')
			or (v_lot_status = 'quarantined') <> (v_to_type = 'quarantine') then
			raise exception using errcode = 'P0001', message = 'quarantine_location_mismatch';
		end if;
	elsif v_from_type = 'quarantine' or v_to_type = 'quarantine' then
		raise exception using errcode = 'P0001', message = 'lot_tracking_required_for_quarantine';
	end if;

	select coalesce(sum(m.quantity_delta), 0) into v_on_hand
	from public.inventory_movements m
	where m.workspace_id = v_workspace_id
		and m.item_id = p_item_id
		and m.location_id = p_from_location_id
		and m.lot_id is not distinct from p_lot_id;
	select coalesce(sum(r.quantity), 0) into v_reserved
	from public.inventory_reservations r
	where r.workspace_id = v_workspace_id
		and r.item_id = p_item_id
		and r.location_id = p_from_location_id
		and r.lot_id is not distinct from p_lot_id
		and r.status = 'active';
	if v_on_hand - v_reserved < p_quantity then
		raise exception using errcode = 'P0001', message = 'insufficient_stock';
	end if;

	v_document_number := 'TR-' || to_char(current_date, 'YYYYMMDD') || '-'
		|| upper(replace(p_idempotency_key::text, '-', ''));
	insert into public.inventory_transfers (
		workspace_id, document_number, item_id, lot_id, from_location_id,
		to_location_id, quantity, reason, idempotency_key, created_by
	)
	values (
		v_workspace_id, v_document_number, p_item_id, p_lot_id, p_from_location_id,
		p_to_location_id, p_quantity, v_reason, p_idempotency_key, v_user_id
	)
	on conflict (workspace_id, idempotency_key) do nothing
	returning id into v_transfer_id;

	if v_transfer_id is null then
		select t.id, t.document_number into v_existing
		from public.inventory_transfers t
		where t.workspace_id = v_workspace_id and t.idempotency_key = p_idempotency_key;
		return jsonb_build_object('id', v_existing.id, 'document_number', v_existing.document_number, 'duplicate', true);
	end if;

	insert into public.inventory_movements (
		workspace_id, item_id, location_id, lot_id, movement_type, quantity_delta,
		reference_type, reference_id, idempotency_key, recorded_by
	)
	values
		(v_workspace_id, p_item_id, p_from_location_id, p_lot_id, 'transfer_out', -p_quantity,
			'inventory_transfer', v_transfer_id, gen_random_uuid(), v_user_id),
		(v_workspace_id, p_item_id, p_to_location_id, p_lot_id, 'transfer_in', p_quantity,
			'inventory_transfer', v_transfer_id, gen_random_uuid(), v_user_id);

	return jsonb_build_object('id', v_transfer_id, 'document_number', v_document_number, 'duplicate', false);
end;
$$;

create function public.erp_request_inventory_adjustment(
	p_item_id uuid,
	p_location_id uuid,
	p_lot_id uuid,
	p_quantity_delta numeric,
	p_reason text,
	p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_request_id uuid;
	v_item record;
	v_location_type text;
	v_existing_id uuid;
	v_reason text := btrim(coalesce(p_reason, ''));
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager', 'purchasing']);

	if p_idempotency_key is null
		or p_quantity_delta is null or p_quantity_delta = 0
		or round(p_quantity_delta, 3) <> p_quantity_delta
		or length(v_reason) not between 5 and 500 then
		raise exception using errcode = 'P0001', message = 'invalid_adjustment';
	end if;

	select a.id into v_existing_id
	from public.inventory_adjustment_requests a
	where a.workspace_id = v_workspace_id and a.idempotency_key = p_idempotency_key;
	if found then
		return jsonb_build_object('id', v_existing_id, 'duplicate', true);
	end if;

	select i.id, i.base_unit, i.track_lots into v_item
	from public.inventory_items i
	where i.id = p_item_id and i.workspace_id = v_workspace_id and i.is_active;
	if not found then
		raise exception using errcode = 'P0002', message = 'item_not_found';
	end if;
	if v_item.base_unit = 'each' and p_quantity_delta <> trunc(p_quantity_delta) then
		raise exception using errcode = 'P0001', message = 'whole_quantity_required';
	end if;
	if (v_item.track_lots and p_lot_id is null) or (not v_item.track_lots and p_lot_id is not null) then
		raise exception using errcode = 'P0001', message = 'lot_selection_mismatch';
	end if;

	select l.location_type into v_location_type
	from public.inventory_locations l
	where l.id = p_location_id and l.workspace_id = v_workspace_id and l.is_active;
	if not found or v_location_type in ('customer', 'transit') then
		raise exception using errcode = 'P0001', message = 'invalid_adjustment_location';
	end if;
	if p_lot_id is not null and not exists (
		select 1 from public.inventory_lots l
		where l.id = p_lot_id and l.item_id = p_item_id and l.workspace_id = v_workspace_id
			and l.lot_status not in ('closed', 'expired')
	) then
		raise exception using errcode = 'P0001', message = 'invalid_adjustment_lot';
	end if;
	if p_lot_id is null and v_location_type = 'quarantine' then
		raise exception using errcode = 'P0001', message = 'lot_tracking_required_for_quarantine';
	end if;
	if p_lot_id is not null and exists (
		select 1
		from public.inventory_lots l
		where l.id = p_lot_id
			and l.item_id = p_item_id
			and l.workspace_id = v_workspace_id
			and (l.lot_status = 'quarantined') <> (v_location_type = 'quarantine')
	) then
		raise exception using errcode = 'P0001', message = 'quarantine_location_mismatch';
	end if;

	insert into public.inventory_adjustment_requests (
		workspace_id, item_id, location_id, lot_id, quantity_delta,
		reason, idempotency_key, requested_by
	)
	values (
		v_workspace_id, p_item_id, p_location_id, p_lot_id, p_quantity_delta,
		v_reason, p_idempotency_key, v_user_id
	)
	on conflict (workspace_id, idempotency_key) do nothing
	returning id into v_request_id;

	if v_request_id is null then
		select a.id into v_existing_id
		from public.inventory_adjustment_requests a
		where a.workspace_id = v_workspace_id
			and a.idempotency_key = p_idempotency_key;
		return jsonb_build_object('id', v_existing_id, 'duplicate', true);
	end if;

	return jsonb_build_object('id', v_request_id, 'status', 'pending', 'duplicate', false);
end;
$$;

create function public.erp_review_inventory_adjustment(
	p_request_id uuid,
	p_approve boolean,
	p_review_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_request record;
	v_on_hand numeric;
	v_reserved numeric;
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager']);

	select a.id, a.item_id, a.location_id, a.lot_id, a.quantity_delta,
		a.status, a.requested_by, i.is_active
		into v_request
	from public.inventory_adjustment_requests a
	join public.inventory_items i
		on i.id = a.item_id and i.workspace_id = a.workspace_id
	where a.id = p_request_id and a.workspace_id = v_workspace_id
	for update of a, i;
	if not found then
		raise exception using errcode = 'P0002', message = 'adjustment_not_found';
	end if;
	if v_request.status <> 'pending' then
		raise exception using errcode = 'P0001', message = 'adjustment_not_pending';
	end if;
	if v_request.requested_by = v_user_id then
		raise exception using errcode = '42501', message = 'self_approval_forbidden';
	end if;
	if p_approve is null then
		raise exception using errcode = 'P0001', message = 'invalid_adjustment_review';
	end if;
	if not p_approve and length(btrim(coalesce(p_review_note, ''))) not between 5 and 500 then
		raise exception using errcode = 'P0001', message = 'rejection_reason_required';
	end if;

	if p_approve then
		if not v_request.is_active then
			raise exception using errcode = 'P0001', message = 'item_not_active';
		end if;
		if v_request.quantity_delta < 0 then
			select coalesce(sum(m.quantity_delta), 0) into v_on_hand
			from public.inventory_movements m
			where m.workspace_id = v_workspace_id
				and m.item_id = v_request.item_id
				and m.location_id = v_request.location_id
				and m.lot_id is not distinct from v_request.lot_id;
			select coalesce(sum(r.quantity), 0) into v_reserved
			from public.inventory_reservations r
			where r.workspace_id = v_workspace_id
				and r.item_id = v_request.item_id
				and r.location_id = v_request.location_id
				and r.lot_id is not distinct from v_request.lot_id
				and r.status = 'active';
			if v_on_hand - v_reserved < abs(v_request.quantity_delta) then
				raise exception using errcode = 'P0001', message = 'insufficient_stock';
			end if;
		end if;

		insert into public.inventory_movements (
			workspace_id, item_id, location_id, lot_id, movement_type,
			quantity_delta, reference_type, reference_id, idempotency_key, recorded_by
		)
		values (
			v_workspace_id, v_request.item_id, v_request.location_id, v_request.lot_id,
			'adjustment', v_request.quantity_delta, 'inventory_adjustment',
			v_request.id, v_request.id, v_user_id
		);
	end if;

	update public.inventory_adjustment_requests
	set status = case when p_approve then 'approved' else 'rejected' end,
		reviewed_by = v_user_id,
		reviewed_at = now(),
		review_note = btrim(coalesce(p_review_note, ''))
	where id = v_request.id and workspace_id = v_workspace_id;

	return jsonb_build_object(
		'id', v_request.id,
		'status', case when p_approve then 'approved' else 'rejected' end
	);
end;
$$;

revoke all on function public.erp_create_inventory_item(text, text, text, text, boolean, numeric, numeric) from public, anon, authenticated;
revoke all on function public.erp_create_inventory_location(text, text, text) from public, anon, authenticated;
revoke all on function public.erp_create_purchase_order(uuid, date, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.erp_mark_purchase_order_ordered(uuid) from public, anon, authenticated;
revoke all on function public.erp_cancel_purchase_order(uuid) from public, anon, authenticated;
revoke all on function public.erp_receive_purchase_order(uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.erp_create_inventory_transfer(uuid, uuid, uuid, uuid, numeric, text, uuid) from public, anon, authenticated;
revoke all on function public.erp_request_inventory_adjustment(uuid, uuid, uuid, numeric, text, uuid) from public, anon, authenticated;
revoke all on function public.erp_review_inventory_adjustment(uuid, boolean, text) from public, anon, authenticated;

grant execute on function public.erp_create_inventory_item(text, text, text, text, boolean, numeric, numeric) to authenticated;
grant execute on function public.erp_create_inventory_location(text, text, text) to authenticated;
grant execute on function public.erp_create_purchase_order(uuid, date, jsonb, uuid) to authenticated;
grant execute on function public.erp_mark_purchase_order_ordered(uuid) to authenticated;
grant execute on function public.erp_cancel_purchase_order(uuid) to authenticated;
grant execute on function public.erp_receive_purchase_order(uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.erp_create_inventory_transfer(uuid, uuid, uuid, uuid, numeric, text, uuid) to authenticated;
grant execute on function public.erp_request_inventory_adjustment(uuid, uuid, uuid, numeric, text, uuid) to authenticated;
grant execute on function public.erp_review_inventory_adjustment(uuid, boolean, text) to authenticated;