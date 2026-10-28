-- Direct, audited stock additions for the roles that handle stock
-- (manager, purchasing). Increases only; decreases still need the
-- two-person adjustment workflow.
create function public.erp_receive_stock(
	p_item_id uuid,
	p_location_id uuid,
	p_quantity numeric,
	p_source text,
	p_reason text,
	p_lot_code text,
	p_expires_on date,
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
	v_item record;
	v_location_type text;
	v_lot_id uuid;
	v_lot_code text := nullif(btrim(coalesce(p_lot_code, '')), '');
	v_reason text := btrim(coalesce(p_reason, ''));
	v_movement_type text;
	v_existing uuid;
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager', 'purchasing']);

	v_movement_type := case p_source
		when 'opening' then 'opening_balance'
		when 'purchase' then 'purchase_receipt'
		when 'production' then 'production_output'
		else null
	end;
	if p_idempotency_key is null or v_movement_type is null
		or p_quantity is null or p_quantity <= 0
		or round(p_quantity, 3) <> p_quantity
		or length(v_reason) not between 3 and 500 then
		raise exception using errcode = 'P0001', message = 'invalid_stock_receipt';
	end if;

	select m.id into v_existing
	from public.inventory_movements m
	where m.workspace_id = v_workspace_id and m.idempotency_key = p_idempotency_key;
	if found then
		return jsonb_build_object('id', v_existing, 'duplicate', true);
	end if;

	select i.id, i.base_unit, i.track_lots into v_item
	from public.inventory_items i
	where i.id = p_item_id and i.workspace_id = v_workspace_id and i.is_active;
	if not found then
		raise exception using errcode = 'P0002', message = 'item_not_found';
	end if;
	if v_item.base_unit = 'each' and p_quantity <> trunc(p_quantity) then
		raise exception using errcode = 'P0001', message = 'whole_quantity_required';
	end if;

	select l.location_type into v_location_type
	from public.inventory_locations l
	where l.id = p_location_id and l.workspace_id = v_workspace_id and l.is_active;
	if not found or v_location_type in ('customer', 'transit', 'quarantine') then
		raise exception using errcode = 'P0001', message = 'invalid_receipt_location';
	end if;

	if v_item.track_lots then
		if v_lot_code is null or length(v_lot_code) > 64 then
			raise exception using errcode = 'P0001', message = 'lot_code_required';
		end if;
		insert into public.inventory_lots (workspace_id, item_id, lot_code, expires_on, lot_status)
		values (v_workspace_id, p_item_id, v_lot_code, p_expires_on, 'available')
		on conflict (item_id, lot_code) do nothing;
		select l.id into v_lot_id
		from public.inventory_lots l
		where l.workspace_id = v_workspace_id and l.item_id = p_item_id
			and l.lot_code = v_lot_code and l.lot_status = 'available';
		if v_lot_id is null then
			raise exception using errcode = 'P0001', message = 'invalid_receipt_lot';
		end if;
	end if;

	insert into public.inventory_movements (
		workspace_id, item_id, location_id, lot_id, movement_type,
		quantity_delta, reference_type, reference_id, idempotency_key, recorded_by
	)
	values (
		v_workspace_id, p_item_id, p_location_id, v_lot_id, v_movement_type,
		p_quantity, 'manual_stock_receipt', gen_random_uuid(), p_idempotency_key, v_user_id
	)
	returning id into v_existing;

	return jsonb_build_object('id', v_existing, 'duplicate', false);
end;
$$;

revoke all on function public.erp_receive_stock(uuid, uuid, numeric, text, text, text, date, uuid) from public, anon, authenticated;
grant execute on function public.erp_receive_stock(uuid, uuid, numeric, text, text, text, date, uuid) to authenticated;
