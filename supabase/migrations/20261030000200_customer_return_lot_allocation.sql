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
	v_remaining numeric;
	v_take numeric;
	v_note text := left(coalesce(btrim(p_note), ''), 300);
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager']) r;

	if p_decision is null or p_decision not in ('release', 'reject') then
		raise exception 'invalid_return_decision' using errcode = 'P0001';
	end if;

	select c.status, c.delivery_note_id into v_status, v_note_id
	from public.erp_customer_returns c
	where c.id = p_return_id and c.workspace_id = v_workspace_id
	for update;
	if not found then
		raise exception 'return_not_found' using errcode = 'P0002';
	end if;
	if v_status <> 'inspection' then
		raise exception 'return_not_in_inspection' using errcode = 'P0001';
	end if;

	perform 1
	from public.erp_delivery_notes n
	where n.id = v_note_id and n.workspace_id = v_workspace_id
	for update;
	if not found then
		raise exception 'delivery_note_not_found' using errcode = 'P0002';
	end if;

	for v_line in
		select rl.item_id, rl.quantity
		from public.erp_customer_return_lines rl
		where rl.return_id = p_return_id
		order by rl.item_id, rl.delivery_line_id
	loop
		if p_decision = 'release' then
			v_remaining := v_line.quantity;

			for v_ship in
				select shipped.location_id, shipped.lot_id,
					shipped.quantity - coalesce(returned.quantity, 0) as available
				from (
					select m.location_id, m.lot_id, sum(-m.quantity_delta) as quantity,
						min(m.recorded_at) as first_shipped_at
					from public.inventory_movements m
					where m.workspace_id = v_workspace_id
						and m.reference_type = 'delivery_note'
						and m.reference_id = v_note_id
						and m.movement_type = 'shipment'
						and m.item_id = v_line.item_id
					group by m.location_id, m.lot_id
				) shipped
				left join lateral (
					select sum(rm.quantity_delta) as quantity
					from public.inventory_movements rm
					join public.erp_customer_returns cr
						on cr.id = rm.reference_id
						and cr.workspace_id = v_workspace_id
						and cr.delivery_note_id = v_note_id
					where rm.workspace_id = v_workspace_id
						and rm.reference_type = 'customer_return'
						and rm.movement_type = 'customer_return'
						and rm.item_id = v_line.item_id
						and rm.lot_id is not distinct from shipped.lot_id
						and (cr.status = 'released' or cr.id = p_return_id)
				) returned on true
				where shipped.quantity > coalesce(returned.quantity, 0)
				order by shipped.first_shipped_at, shipped.location_id, shipped.lot_id nulls first
			loop
				exit when v_remaining <= 0;
				v_take := least(v_remaining, v_ship.available);

				insert into public.inventory_movements (
					workspace_id, item_id, location_id, lot_id, movement_type, quantity_delta,
					reference_type, reference_id, idempotency_key, recorded_by
				) values (
					v_workspace_id, v_line.item_id, v_ship.location_id, v_ship.lot_id,
					'customer_return', v_take, 'customer_return', p_return_id, gen_random_uuid(), v_user_id
				);

				v_remaining := v_remaining - v_take;
			end loop;

			if v_remaining > 0 then
				raise exception 'shipment_record_missing' using errcode = 'P0001';
			end if;
		end if;

		insert into public.erp_return_dispositions (
			workspace_id, return_id, item_id, quantity, disposition, note, created_by
		) values (
			v_workspace_id, p_return_id, v_line.item_id, v_line.quantity,
			case when p_decision = 'release' then 'restocked' else 'rejected' end,
			v_note, v_user_id
		);
	end loop;

	update public.erp_customer_returns
	set status = case when p_decision = 'release' then 'released' else 'rejected' end,
		resolution_note = v_note,
		updated_at = now()
	where id = p_return_id;
end;
$$;

revoke all on function public.erp_resolve_customer_return(uuid, text, text) from public, anon, authenticated;
grant execute on function public.erp_resolve_customer_return(uuid, text, text) to authenticated;