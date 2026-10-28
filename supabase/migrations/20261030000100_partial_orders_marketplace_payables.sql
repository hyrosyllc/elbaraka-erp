-- Loop closure pass:
--  1. Partial confirmation of sales orders (reserve what is available, top up later).
--  2. Deliveries can only claim stock that is reserved and not already promised to another ready note.
--  3. Return dispositions (a stock-side record for released AND rejected returns).
--  4. External returns: goods not delivered through the system, credited on an invoice.
--  5. Supplier payments (payables = received value - payments).
--  6. Material price marketplace: a price tick log per item, optionally per supplier.

-- ---------------------------------------------------------------- 1. partial orders

create or replace function erp_private.erp_reserve_order_stock(p_workspace_id uuid, p_user_id uuid, p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_line record;
	v_bucket record;
	v_need numeric;
	v_take numeric;
	v_short jsonb := '[]'::jsonb;
begin
	-- Lock items in a stable order so concurrent confirmations cannot deadlock.
	perform 1 from public.inventory_items i
	where i.id in (select l.item_id from public.erp_sales_order_lines l where l.order_id = p_order_id)
	order by i.id for update;

	for v_line in
		select l.item_id, l.sku_snapshot,
			l.quantity
			- coalesce((
				select sum(dl.quantity)
				from public.erp_delivery_note_lines dl
				join public.erp_delivery_notes dn on dn.id = dl.delivery_note_id
				where dl.order_line_id = l.id and dn.status in ('dispatched', 'delivered')
			), 0)
			- coalesce((
				select sum(r.quantity) from public.inventory_reservations r
				where r.workspace_id = p_workspace_id and r.source_type = 'sales_order'
					and r.source_id = p_order_id and r.item_id = l.item_id and r.status = 'active'
			), 0) as needed
		from public.erp_sales_order_lines l
		where l.order_id = p_order_id
		order by l.item_id
	loop
		v_need := v_line.needed;
		if v_need <= 0 then continue; end if;

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
				where m.workspace_id = p_workspace_id and m.item_id = v_line.item_id
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
				gen_random_uuid(), p_user_id, p_workspace_id
			);
			v_need := v_need - v_take;
		end loop;

		if v_need > 0 then
			v_short := v_short || jsonb_build_object('sku', v_line.sku_snapshot, 'short', v_need);
		end if;
	end loop;

	return v_short;
end;
$$;

drop function if exists public.erp_confirm_sales_order(uuid);

create or replace function public.erp_confirm_sales_order(p_order_id uuid, p_allow_partial boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_status text;
	v_short jsonb;
	v_reserved numeric;
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

	v_short := erp_private.erp_reserve_order_stock(v_workspace_id, v_user_id, p_order_id);

	if jsonb_array_length(v_short) > 0 then
		if not coalesce(p_allow_partial, false) then
			raise exception 'insufficient_stock' using errcode = 'P0001', detail = v_short::text;
		end if;
		select coalesce(sum(r.quantity), 0) into v_reserved
		from public.inventory_reservations r
		where r.workspace_id = v_workspace_id and r.source_type = 'sales_order' and r.source_id = p_order_id and r.status = 'active';
		if v_reserved <= 0 then
			raise exception 'nothing_available' using errcode = 'P0001', detail = v_short::text;
		end if;
	end if;

	update public.erp_sales_orders
	set status = 'confirmed', confirmed_at = now(), confirmed_by = v_user_id, updated_at = now()
	where id = p_order_id;

	insert into public.erp_sales_order_events (workspace_id, order_id, event_type, actor_id, detail)
	values (v_workspace_id, p_order_id, 'confirmed', v_user_id,
		jsonb_build_object('partial', jsonb_array_length(v_short) > 0, 'shortages', v_short));
end;
$$;

-- Reserve whatever stock has arrived since the order was confirmed.
create or replace function public.erp_reserve_order_remaining(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_status text;
	v_short jsonb;
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
	if v_status not in ('confirmed', 'part_delivered') then
		raise exception 'sales_order_not_reservable' using errcode = 'P0001';
	end if;

	v_short := erp_private.erp_reserve_order_stock(v_workspace_id, v_user_id, p_order_id);

	insert into public.erp_sales_order_events (workspace_id, order_id, event_type, actor_id, detail)
	values (v_workspace_id, p_order_id, 'updated', v_user_id, jsonb_build_object('reserved', true, 'shortages', v_short));
	return v_short;
end;
$$;

revoke all on function erp_private.erp_reserve_order_stock(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.erp_confirm_sales_order(uuid, boolean) from public, anon, authenticated;
revoke all on function public.erp_reserve_order_remaining(uuid) from public, anon, authenticated;
grant execute on function public.erp_confirm_sales_order(uuid, boolean) to authenticated;
grant execute on function public.erp_reserve_order_remaining(uuid) to authenticated;

-- ---------------------------------------------------------------- 2. delivery claims only free reserved stock

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
	v_free numeric;
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
		-- Stock reserved for the order and not yet promised to another ready note.
		select coalesce(sum(r.quantity), 0) - coalesce((
			select sum(dl.quantity)
			from public.erp_delivery_note_lines dl
			join public.erp_delivery_notes dn on dn.id = dl.delivery_note_id
			where dl.order_line_id = v_line.id and dn.status = 'ready' and dn.id <> v_note_id
		), 0) into v_free
		from public.inventory_reservations r
		where r.workspace_id = v_workspace_id and r.source_type = 'sales_order'
			and r.source_id = p_order_id and r.item_id = v_line.item_id and r.status = 'active';

		if p_lines is null then
			v_qty := least(v_line.remaining, floor(v_free))::integer;
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
		if v_free < v_qty then
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

-- ---------------------------------------------------------------- 3. return dispositions

create table if not exists public.erp_return_dispositions (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	return_id uuid not null references public.erp_customer_returns(id) on delete restrict,
	item_id uuid not null references public.inventory_items(id) on delete restrict,
	quantity integer not null check (quantity > 0),
	disposition text not null check (disposition in ('restocked', 'rejected')),
	note text not null default '',
	created_at timestamptz not null default now(),
	created_by uuid references auth.users(id) on delete restrict
);
create index if not exists erp_return_dispositions_return_idx on public.erp_return_dispositions (return_id);
create index if not exists erp_return_dispositions_item_idx on public.erp_return_dispositions (workspace_id, item_id, created_at desc);

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
	v_note text := left(coalesce(btrim(p_note), ''), 300);
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

	for v_line in
		select rl.item_id, rl.quantity from public.erp_customer_return_lines rl where rl.return_id = p_return_id
	loop
		if p_decision = 'release' then
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
		end if;
		insert into public.erp_return_dispositions (workspace_id, return_id, item_id, quantity, disposition, note, created_by)
		values (v_workspace_id, p_return_id, v_line.item_id, v_line.quantity,
			case when p_decision = 'release' then 'restocked' else 'rejected' end, v_note, v_user_id);
	end loop;

	update public.erp_customer_returns
	set status = case when p_decision = 'release' then 'released' else 'rejected' end,
		resolution_note = v_note,
		updated_at = now()
	where id = p_return_id;
end;
$$;

-- ---------------------------------------------------------------- 4. external returns

create table if not exists public.erp_external_returns (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	client_id uuid not null references public.erp_clients(id) on delete restrict,
	invoice_id uuid not null references public.erp_invoices(id) on delete restrict,
	item_id uuid references public.inventory_items(id) on delete restrict,
	description text not null check (char_length(btrim(description)) between 1 and 300),
	quantity integer not null check (quantity > 0),
	unit_value_mad numeric(14, 2) not null check (unit_value_mad > 0),
	credit_mad numeric(14, 2) not null check (credit_mad > 0),
	restocked boolean not null default false,
	adjustment_id uuid references public.erp_invoice_adjustments(id) on delete restrict,
	idempotency_key uuid not null,
	created_at timestamptz not null default now(),
	created_by uuid references auth.users(id) on delete restrict,
	unique (workspace_id, idempotency_key)
);
create index if not exists erp_external_returns_client_idx on public.erp_external_returns (workspace_id, client_id, created_at desc);

create or replace function public.erp_record_external_return(
	p_invoice_id uuid,
	p_item_id uuid,
	p_description text,
	p_quantity integer,
	p_unit_value_mad numeric,
	p_restock boolean,
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
	v_existing uuid;
	v_client_id uuid;
	v_item record;
	v_location uuid;
	v_credit numeric(14, 2);
	v_adjustment uuid;
	v_id uuid := gen_random_uuid();
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager']) r;

	if p_idempotency_key is null then
		raise exception 'idempotency_key_required' using errcode = 'P0001';
	end if;
	if p_quantity is null or p_quantity < 1 or p_quantity > 100000
		or p_unit_value_mad is null or p_unit_value_mad <= 0 or p_unit_value_mad <> round(p_unit_value_mad, 2) then
		raise exception 'invalid_external_return' using errcode = 'P0001';
	end if;
	if char_length(btrim(coalesce(p_description, ''))) not between 1 and 300 then
		raise exception 'adjustment_description_required' using errcode = 'P0001';
	end if;

	select e.id into v_existing from public.erp_external_returns e
	where e.workspace_id = v_workspace_id and e.idempotency_key = p_idempotency_key;
	if found then return v_existing; end if;

	select i.client_id into v_client_id from public.erp_invoices i
	where i.id = p_invoice_id and i.workspace_id = v_workspace_id;
	if not found then
		raise exception 'invoice_not_found' using errcode = 'P0002';
	end if;

	if p_item_id is not null then
		select i.id, i.track_lots, i.item_type into v_item from public.inventory_items i
		where i.id = p_item_id and i.workspace_id = v_workspace_id and i.is_active;
		if not found then
			raise exception 'item_not_found' using errcode = 'P0002';
		end if;
	elsif coalesce(p_restock, false) then
		raise exception 'restock_needs_item' using errcode = 'P0001';
	end if;

	v_credit := round(p_quantity * p_unit_value_mad, 2);
	-- Reuses the adjustment rules: the credit cannot exceed what the invoice is worth.
	v_adjustment := public.erp_add_invoice_adjustment(
		p_invoice_id, 'return_credit', v_credit, left(btrim(p_description), 300), p_idempotency_key
	);

	if coalesce(p_restock, false) then
		if v_item.track_lots then
			raise exception 'restock_lot_tracked' using errcode = 'P0001';
		end if;
		select l.id into v_location from public.inventory_locations l
		where l.workspace_id = v_workspace_id and l.location_type = 'warehouse' and l.is_active
		order by l.created_at, l.id limit 1;
		if v_location is null then
			raise exception 'invalid_receipt_location' using errcode = 'P0001';
		end if;
		insert into public.inventory_movements (
			workspace_id, item_id, location_id, lot_id, movement_type, quantity_delta,
			reference_type, reference_id, idempotency_key, recorded_by
		) values (
			v_workspace_id, p_item_id, v_location, null, 'customer_return', p_quantity,
			'external_return', v_id, gen_random_uuid(), v_user_id
		);
	end if;

	insert into public.erp_external_returns (
		id, workspace_id, client_id, invoice_id, item_id, description, quantity, unit_value_mad,
		credit_mad, restocked, adjustment_id, idempotency_key, created_by
	) values (
		v_id, v_workspace_id, v_client_id, p_invoice_id, p_item_id, btrim(p_description), p_quantity, p_unit_value_mad,
		v_credit, coalesce(p_restock, false), v_adjustment, p_idempotency_key, v_user_id
	);
	return v_id;
end;
$$;

-- ---------------------------------------------------------------- 5. supplier payments

create table if not exists public.erp_supplier_payments (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	supplier_id uuid not null references public.erp_suppliers(id) on delete restrict,
	purchase_order_id uuid references public.erp_purchase_orders(id) on delete restrict,
	amount_mad numeric(14, 2) not null check (amount_mad > 0),
	payment_method text not null check (payment_method in ('cash', 'bank_transfer', 'card', 'cheque', 'other')),
	paid_at timestamptz not null default now(),
	reference text not null default '' check (char_length(reference) <= 120),
	idempotency_key uuid not null,
	created_at timestamptz not null default now(),
	created_by uuid references auth.users(id) on delete restrict,
	unique (workspace_id, idempotency_key)
);
create index if not exists erp_supplier_payments_supplier_idx on public.erp_supplier_payments (workspace_id, supplier_id, paid_at desc);

create or replace function public.erp_record_supplier_payment(
	p_supplier_id uuid,
	p_purchase_order_id uuid,
	p_amount_mad numeric,
	p_method text,
	p_reference text,
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
	v_existing uuid;
	v_received numeric(16, 2);
	v_paid numeric(16, 2);
	v_id uuid := gen_random_uuid();
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager']) r;

	if p_idempotency_key is null then
		raise exception 'idempotency_key_required' using errcode = 'P0001';
	end if;
	if p_amount_mad is null or p_amount_mad <= 0 or p_amount_mad <> round(p_amount_mad, 2) then
		raise exception 'invalid_payment_amount' using errcode = 'P0001';
	end if;
	if p_method is null or p_method not in ('cash', 'bank_transfer', 'card', 'cheque', 'other') then
		raise exception 'invalid_payment_method' using errcode = 'P0001';
	end if;

	select p.id into v_existing from public.erp_supplier_payments p
	where p.workspace_id = v_workspace_id and p.idempotency_key = p_idempotency_key;
	if found then return v_existing; end if;

	perform 1 from public.erp_suppliers s where s.id = p_supplier_id and s.workspace_id = v_workspace_id for update;
	if not found then
		raise exception 'supplier_not_found' using errcode = 'P0002';
	end if;
	if p_purchase_order_id is not null and not exists (
		select 1 from public.erp_purchase_orders po
		where po.id = p_purchase_order_id and po.workspace_id = v_workspace_id and po.supplier_id = p_supplier_id
	) then
		raise exception 'purchase_order_not_found' using errcode = 'P0002';
	end if;

	select coalesce(sum(rl.quantity * rl.unit_cost_mad), 0)::numeric(16, 2) into v_received
	from public.erp_purchase_receipt_lines rl
	join public.erp_purchase_receipts r on r.id = rl.receipt_id
	join public.erp_purchase_orders po on po.id = r.purchase_order_id
	where rl.workspace_id = v_workspace_id and po.supplier_id = p_supplier_id;
	select coalesce(sum(p.amount_mad), 0) into v_paid
	from public.erp_supplier_payments p where p.workspace_id = v_workspace_id and p.supplier_id = p_supplier_id;
	if v_paid + p_amount_mad > v_received then
		raise exception 'payment_exceeds_payable' using errcode = 'P0001';
	end if;

	insert into public.erp_supplier_payments (
		id, workspace_id, supplier_id, purchase_order_id, amount_mad, payment_method, reference, idempotency_key, created_by
	) values (
		v_id, v_workspace_id, p_supplier_id, p_purchase_order_id, p_amount_mad, p_method,
		left(coalesce(btrim(p_reference), ''), 120), p_idempotency_key, v_user_id
	);
	return v_id;
end;
$$;

-- ---------------------------------------------------------------- 6. material price marketplace

create table if not exists public.erp_material_prices (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	item_id uuid not null references public.inventory_items(id) on delete restrict,
	supplier_id uuid references public.erp_suppliers(id) on delete restrict,
	price_mad numeric(14, 5) not null check (price_mad > 0),
	source text not null check (source in ('manual', 'purchase')),
	note text not null default '' check (char_length(note) <= 200),
	idempotency_key uuid,
	recorded_at timestamptz not null default now(),
	recorded_by uuid references auth.users(id) on delete set null
);
create index if not exists erp_material_prices_item_idx on public.erp_material_prices (workspace_id, item_id, recorded_at desc);
create index if not exists erp_material_prices_supplier_idx on public.erp_material_prices (workspace_id, item_id, supplier_id, recorded_at desc);
create unique index if not exists erp_material_prices_idempotency_idx
	on public.erp_material_prices (workspace_id, idempotency_key) where idempotency_key is not null;

create or replace function public.erp_record_material_price(
	p_item_id uuid,
	p_supplier_id uuid,
	p_price_mad numeric,
	p_note text,
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
	v_existing uuid;
	v_type text;
	v_id uuid := gen_random_uuid();
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager', 'purchasing']) r;

	if p_idempotency_key is null then
		raise exception 'idempotency_key_required' using errcode = 'P0001';
	end if;
	if p_price_mad is null or p_price_mad <= 0 or p_price_mad <> round(p_price_mad, 5) or p_price_mad > 100000000 then
		raise exception 'invalid_price' using errcode = 'P0001';
	end if;

	select p.id into v_existing from public.erp_material_prices p
	where p.workspace_id = v_workspace_id and p.idempotency_key = p_idempotency_key;
	if found then return v_existing; end if;

	select i.item_type into v_type from public.inventory_items i
	where i.id = p_item_id and i.workspace_id = v_workspace_id and i.is_active;
	if not found then
		raise exception 'item_not_found' using errcode = 'P0002';
	end if;
	if v_type = 'finished_good' then
		raise exception 'price_item_not_material' using errcode = 'P0001';
	end if;
	if p_supplier_id is not null and not exists (
		select 1 from public.erp_suppliers s where s.id = p_supplier_id and s.workspace_id = v_workspace_id and s.is_active
	) then
		raise exception 'supplier_not_found' using errcode = 'P0002';
	end if;

	insert into public.erp_material_prices (id, workspace_id, item_id, supplier_id, price_mad, source, note, idempotency_key, recorded_by)
	values (v_id, v_workspace_id, p_item_id, p_supplier_id, p_price_mad, 'manual', left(coalesce(btrim(p_note), ''), 200), p_idempotency_key, v_user_id);
	return v_id;
end;
$$;

-- A purchase order line is a real price paid to a supplier: it ticks the marketplace automatically.
create or replace function erp_private.erp_tick_price_from_po_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_po record;
begin
	if new.unit_cost_mad is null or new.unit_cost_mad <= 0 then
		return new;
	end if;
	select po.supplier_id, po.created_by into v_po from public.erp_purchase_orders po where po.id = new.purchase_order_id;
	insert into public.erp_material_prices (workspace_id, item_id, supplier_id, price_mad, source, note, recorded_at, recorded_by)
	values (new.workspace_id, new.item_id, v_po.supplier_id, round(new.unit_cost_mad, 5), 'purchase', 'Purchase order', new.created_at, v_po.created_by);
	return new;
end;
$$;

drop trigger if exists erp_purchase_order_line_price_tick on public.erp_purchase_order_lines;
create trigger erp_purchase_order_line_price_tick
	after insert on public.erp_purchase_order_lines
	for each row execute function erp_private.erp_tick_price_from_po_line();

insert into public.erp_material_prices (workspace_id, item_id, supplier_id, price_mad, source, note, recorded_at, recorded_by)
select pol.workspace_id, pol.item_id, po.supplier_id, round(pol.unit_cost_mad, 5), 'purchase', 'Purchase order', pol.created_at, po.created_by
from public.erp_purchase_order_lines pol
join public.erp_purchase_orders po on po.id = pol.purchase_order_id
where pol.unit_cost_mad > 0
	and not exists (select 1 from public.erp_material_prices x where x.workspace_id = pol.workspace_id and x.item_id = pol.item_id and x.recorded_at = pol.created_at);

-- ---------------------------------------------------------------- access

do $$
declare
	table_name text;
begin
	foreach table_name in array array['erp_return_dispositions', 'erp_external_returns', 'erp_supplier_payments', 'erp_material_prices'] loop
		execute format('alter table public.%I enable row level security', table_name);
		execute format('revoke all privileges on table public.%I from anon, authenticated', table_name);
		execute format('grant select on table public.%I to authenticated', table_name);
		execute format('drop policy if exists "staff read" on public.%I', table_name);
	end loop;
	foreach table_name in array array['erp_return_dispositions', 'erp_external_returns'] loop
		execute format(
			'create policy "staff read" on public.%I for select to authenticated using (workspace_id in (select workspace_id from public.erp_workspace_memberships where user_id = (select auth.uid()) and is_active and role_code = ''manager''))',
			table_name
		);
	end loop;
	foreach table_name in array array['erp_supplier_payments', 'erp_material_prices'] loop
		execute format(
			'create policy "staff read" on public.%I for select to authenticated using (workspace_id in (select workspace_id from public.erp_workspace_memberships where user_id = (select auth.uid()) and is_active and role_code in (''manager'', ''purchasing'')))',
			table_name
		);
	end loop;
end;
$$;

revoke all on function public.erp_create_delivery_note(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.erp_resolve_customer_return(uuid, text, text) from public, anon, authenticated;
revoke all on function public.erp_record_external_return(uuid, uuid, text, integer, numeric, boolean, uuid) from public, anon, authenticated;
revoke all on function public.erp_record_supplier_payment(uuid, uuid, numeric, text, text, uuid) from public, anon, authenticated;
revoke all on function public.erp_record_material_price(uuid, uuid, numeric, text, uuid) from public, anon, authenticated;
revoke all on function erp_private.erp_tick_price_from_po_line() from public, anon, authenticated;

grant execute on function public.erp_create_delivery_note(uuid, jsonb, uuid) to authenticated;
grant execute on function public.erp_resolve_customer_return(uuid, text, text) to authenticated;
grant execute on function public.erp_record_external_return(uuid, uuid, text, integer, numeric, boolean, uuid) to authenticated;
grant execute on function public.erp_record_supplier_payment(uuid, uuid, numeric, text, text, uuid) to authenticated;
grant execute on function public.erp_record_material_price(uuid, uuid, numeric, text, uuid) to authenticated;
