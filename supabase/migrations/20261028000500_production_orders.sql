-- Production orders: plan against the latest approved recipe, start (consumes
-- components from available warehouse stock, oldest expiry first), complete
-- (creates a traceable output lot and a production_output movement), or cancel
-- while still planned.

alter table public.erp_production_orders
	add column if not exists idempotency_key uuid,
	add column if not exists updated_at timestamptz not null default now(),
	add column if not exists started_at timestamptz,
	add column if not exists completed_at timestamptz;

create unique index if not exists erp_production_orders_idempotency_idx
	on public.erp_production_orders (workspace_id, idempotency_key) where idempotency_key is not null;
create index if not exists erp_production_orders_status_idx
	on public.erp_production_orders (workspace_id, status);

create or replace function public.erp_create_production_order(
	p_output_item_id uuid,
	p_target_quantity numeric,
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
	v_recipe record;
	v_id uuid := gen_random_uuid();
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager', 'purchasing']) r;

	if p_idempotency_key is null then
		raise exception 'idempotency_key_required' using errcode = 'P0001';
	end if;
	if p_target_quantity is null or p_target_quantity <= 0 or p_target_quantity > 1000000 or p_target_quantity <> round(p_target_quantity, 3) then
		raise exception 'invalid_target_quantity' using errcode = 'P0001';
	end if;

	select o.id into v_existing from public.erp_production_orders o
	where o.workspace_id = v_workspace_id and o.idempotency_key = p_idempotency_key;
	if found then return v_existing; end if;

	if not exists (
		select 1 from public.inventory_items i
		where i.id = p_output_item_id and i.workspace_id = v_workspace_id and i.is_active
			and i.item_type in ('blend', 'finished_good')
	) then
		raise exception 'output_item_not_found' using errcode = 'P0002';
	end if;

	select rc.id, rc.version into v_recipe
	from public.inventory_recipes rc
	where rc.workspace_id = v_workspace_id and rc.output_item_id = p_output_item_id and rc.status = 'approved'
	order by rc.version desc limit 1;
	if not found then
		raise exception 'no_approved_recipe' using errcode = 'P0001';
	end if;

	insert into public.erp_production_orders (
		id, workspace_id, document_number, output_item_id, recipe_id, recipe_version,
		target_quantity, status, created_by, idempotency_key
	) values (
		v_id, v_workspace_id,
		erp_private.erp_next_document_number(v_workspace_id, 'production', 'PRD'),
		p_output_item_id, v_recipe.id, v_recipe.version, p_target_quantity, 'planned', v_user_id, p_idempotency_key
	);
	return v_id;
end;
$$;

create or replace function public.erp_start_production_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_order record;
	v_out_qty numeric;
	v_comp record;
	v_bucket record;
	v_need numeric;
	v_take numeric;
	v_short jsonb := '[]'::jsonb;
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager', 'purchasing']) r;

	select o.id, o.status, o.recipe_id, o.target_quantity into v_order
	from public.erp_production_orders o
	where o.id = p_order_id and o.workspace_id = v_workspace_id for update;
	if not found then
		raise exception 'production_order_not_found' using errcode = 'P0002';
	end if;
	if v_order.status <> 'planned' then
		raise exception 'production_order_not_planned' using errcode = 'P0001';
	end if;

	select rc.output_quantity into v_out_qty from public.inventory_recipes rc where rc.id = v_order.recipe_id;
	if not exists (select 1 from public.inventory_recipe_components c where c.recipe_id = v_order.recipe_id) then
		raise exception 'recipe_has_no_components' using errcode = 'P0001';
	end if;

	perform 1 from public.inventory_items i
	where i.id in (select c.input_item_id from public.inventory_recipe_components c where c.recipe_id = v_order.recipe_id)
	order by i.id for update;

	for v_comp in
		select c.input_item_id, i.sku, round(c.quantity * v_order.target_quantity / v_out_qty, 3) as required
		from public.inventory_recipe_components c
		join public.inventory_items i on i.id = c.input_item_id
		where c.recipe_id = v_order.recipe_id
		order by c.input_item_id
	loop
		v_need := v_comp.required;
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
					and (loc.workspace_id = m.workspace_id or loc.workspace_id is null)
				left join public.inventory_lots lt on lt.id = m.lot_id
				where m.workspace_id = v_workspace_id and m.item_id = v_comp.input_item_id
					and (m.lot_id is null or lt.lot_status = 'available')
				group by m.workspace_id, m.item_id, m.location_id, m.lot_id
			) b
			where b.free > 0
			order by b.expires_on nulls last, b.location_id
		loop
			exit when v_need <= 0;
			v_take := least(v_need, v_bucket.free);
			insert into public.inventory_movements (
				workspace_id, item_id, location_id, lot_id, movement_type, quantity_delta,
				reference_type, reference_id, idempotency_key, recorded_by
			) values (
				v_workspace_id, v_comp.input_item_id, v_bucket.location_id, v_bucket.lot_id, 'production_consumption', -v_take,
				'production_order', p_order_id, gen_random_uuid(), v_user_id
			);
			v_need := v_need - v_take;
		end loop;

		if v_need > 0 then
			v_short := v_short || jsonb_build_object('sku', v_comp.sku, 'short', v_need);
		end if;
	end loop;

	if jsonb_array_length(v_short) > 0 then
		raise exception 'insufficient_components' using errcode = 'P0001', detail = v_short::text;
	end if;

	update public.erp_production_orders
	set status = 'in_progress', started_at = now(), updated_at = now()
	where id = p_order_id;
end;
$$;

create or replace function public.erp_complete_production_order(p_order_id uuid, p_actual_quantity numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_order record;
	v_location uuid;
	v_lot uuid := gen_random_uuid();
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager', 'purchasing']) r;

	if p_actual_quantity is null or p_actual_quantity <= 0 or p_actual_quantity > 1000000 or p_actual_quantity <> round(p_actual_quantity, 3) then
		raise exception 'invalid_actual_quantity' using errcode = 'P0001';
	end if;

	select o.id, o.status, o.output_item_id, o.document_number into v_order
	from public.erp_production_orders o
	where o.id = p_order_id and o.workspace_id = v_workspace_id for update;
	if not found then
		raise exception 'production_order_not_found' using errcode = 'P0002';
	end if;
	if v_order.status <> 'in_progress' then
		raise exception 'production_order_not_in_progress' using errcode = 'P0001';
	end if;

	select l.id into v_location from public.inventory_locations l
	where (l.workspace_id = v_workspace_id or l.workspace_id is null) and l.location_type = 'warehouse' and l.is_active
	order by (l.code = 'MAIN-WH') desc, l.code limit 1;
	if v_location is null then
		raise exception 'no_warehouse_location' using errcode = 'P0001';
	end if;

	insert into public.inventory_lots (id, workspace_id, item_id, lot_code, lot_status)
	values (v_lot, v_workspace_id, v_order.output_item_id, v_order.document_number, 'available');

	insert into public.inventory_movements (
		workspace_id, item_id, location_id, lot_id, movement_type, quantity_delta,
		reference_type, reference_id, idempotency_key, recorded_by
	) values (
		v_workspace_id, v_order.output_item_id, v_location, v_lot, 'production_output', p_actual_quantity,
		'production_order', p_order_id, gen_random_uuid(), v_user_id
	);

	update public.erp_production_orders
	set status = 'completed', actual_quantity = p_actual_quantity, completed_at = now(), updated_at = now()
	where id = p_order_id;
end;
$$;

create or replace function public.erp_cancel_production_order(p_order_id uuid)
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
	from erp_private.erp_require_workspace_role(array['manager', 'purchasing']) r;

	select o.status into v_status from public.erp_production_orders o
	where o.id = p_order_id and o.workspace_id = v_workspace_id for update;
	if not found then
		raise exception 'production_order_not_found' using errcode = 'P0002';
	end if;
	if v_status <> 'planned' then
		raise exception 'production_order_not_cancellable' using errcode = 'P0001';
	end if;
	update public.erp_production_orders set status = 'cancelled', updated_at = now() where id = p_order_id;
end;
$$;

revoke all on function public.erp_create_production_order(uuid, numeric, uuid) from public, anon, authenticated;
revoke all on function public.erp_start_production_order(uuid) from public, anon, authenticated;
revoke all on function public.erp_complete_production_order(uuid, numeric) from public, anon, authenticated;
revoke all on function public.erp_cancel_production_order(uuid) from public, anon, authenticated;
grant execute on function public.erp_create_production_order(uuid, numeric, uuid) to authenticated;
grant execute on function public.erp_start_production_order(uuid) to authenticated;
grant execute on function public.erp_complete_production_order(uuid, numeric) to authenticated;
grant execute on function public.erp_cancel_production_order(uuid) to authenticated;
