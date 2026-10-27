-- Recipes: save a draft version (one open draft per product), approve it
-- (manager only; approved recipes are immutable by trigger), or delete a draft.
-- Production always uses the latest approved version.

create or replace function public.erp_save_recipe_draft(
	p_recipe_id uuid,
	p_output_item_id uuid,
	p_output_quantity numeric,
	p_components jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_workspace_id uuid;
	v_user_id uuid;
	v_id uuid;
	v_status text;
	v_output_item uuid;
	v_component jsonb;
	v_input uuid;
	v_qty numeric;
	v_seen uuid[] := array[]::uuid[];
begin
	select r.workspace_id, r.user_id into v_workspace_id, v_user_id
	from erp_private.erp_require_workspace_role(array['manager', 'purchasing']) r;

	if p_output_quantity is null or p_output_quantity <= 0 or p_output_quantity > 1000000 or p_output_quantity <> round(p_output_quantity, 3) then
		raise exception 'invalid_output_quantity' using errcode = 'P0001';
	end if;
	if p_components is null or jsonb_typeof(p_components) <> 'array' or jsonb_array_length(p_components) = 0 or jsonb_array_length(p_components) > 50 then
		raise exception 'invalid_recipe_components' using errcode = 'P0001';
	end if;

	if p_recipe_id is null then
		if not exists (
			select 1 from public.inventory_items i
			where i.id = p_output_item_id and i.workspace_id = v_workspace_id and i.is_active
				and i.item_type in ('blend', 'finished_good')
		) then
			raise exception 'output_item_not_found' using errcode = 'P0002';
		end if;
		perform 1 from public.inventory_items i where i.id = p_output_item_id for update;
		if exists (
			select 1 from public.inventory_recipes rc
			where rc.workspace_id = v_workspace_id and rc.output_item_id = p_output_item_id and rc.status = 'draft'
		) then
			raise exception 'draft_already_exists' using errcode = 'P0001';
		end if;
		v_id := gen_random_uuid();
		v_output_item := p_output_item_id;
		insert into public.inventory_recipes (id, workspace_id, output_item_id, version, output_quantity, status, created_by)
		select v_id, v_workspace_id, p_output_item_id, coalesce(max(rc.version), 0) + 1, p_output_quantity, 'draft', v_user_id
		from public.inventory_recipes rc where rc.output_item_id = p_output_item_id;
	else
		select rc.id, rc.status, rc.output_item_id into v_id, v_status, v_output_item
		from public.inventory_recipes rc
		where rc.id = p_recipe_id and rc.workspace_id = v_workspace_id for update;
		if not found then
			raise exception 'recipe_not_found' using errcode = 'P0002';
		end if;
		if v_status <> 'draft' then
			raise exception 'recipe_not_draft' using errcode = 'P0001';
		end if;
		update public.inventory_recipes set output_quantity = p_output_quantity where id = v_id;
		delete from public.inventory_recipe_components where recipe_id = v_id;
	end if;

	for v_component in select * from jsonb_array_elements(p_components) loop
		if jsonb_typeof(v_component) <> 'object'
			or (v_component->>'itemId') is null
			or (v_component->>'itemId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
			or (v_component->>'quantity') is null
			or (v_component->>'quantity') !~ '^[0-9]{1,9}(\.[0-9]{1,3})?$' then
			raise exception 'invalid_recipe_components' using errcode = 'P0001';
		end if;
		v_input := (v_component->>'itemId')::uuid;
		v_qty := (v_component->>'quantity')::numeric;
		if v_qty <= 0 or v_input = v_output_item or v_input = any(v_seen) then
			raise exception 'invalid_recipe_components' using errcode = 'P0001';
		end if;
		if not exists (
			select 1 from public.inventory_items i
			where i.id = v_input and i.workspace_id = v_workspace_id and i.is_active
				and i.item_type in ('raw_material', 'packaging', 'blend')
		) then
			raise exception 'component_item_not_found' using errcode = 'P0002';
		end if;
		v_seen := v_seen || v_input;
		insert into public.inventory_recipe_components (recipe_id, workspace_id, input_item_id, quantity)
		values (v_id, v_workspace_id, v_input, v_qty);
	end loop;

	return v_id;
end;
$$;

create or replace function public.erp_approve_recipe(p_recipe_id uuid)
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

	select rc.status into v_status from public.inventory_recipes rc
	where rc.id = p_recipe_id and rc.workspace_id = v_workspace_id for update;
	if not found then
		raise exception 'recipe_not_found' using errcode = 'P0002';
	end if;
	if v_status <> 'draft' then
		raise exception 'recipe_not_draft' using errcode = 'P0001';
	end if;
	if not exists (select 1 from public.inventory_recipe_components c where c.recipe_id = p_recipe_id) then
		raise exception 'invalid_recipe_components' using errcode = 'P0001';
	end if;
	update public.inventory_recipes
	set status = 'approved', approved_by = v_user_id, approved_at = now()
	where id = p_recipe_id;
end;
$$;

create or replace function public.erp_delete_recipe_draft(p_recipe_id uuid)
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

	select rc.status into v_status from public.inventory_recipes rc
	where rc.id = p_recipe_id and rc.workspace_id = v_workspace_id for update;
	if not found then
		raise exception 'recipe_not_found' using errcode = 'P0002';
	end if;
	if v_status <> 'draft' then
		raise exception 'recipe_not_draft' using errcode = 'P0001';
	end if;
	delete from public.inventory_recipe_components where recipe_id = p_recipe_id;
	delete from public.inventory_recipes where id = p_recipe_id;
end;
$$;

revoke all on function public.erp_save_recipe_draft(uuid, uuid, numeric, jsonb) from public, anon, authenticated;
revoke all on function public.erp_approve_recipe(uuid) from public, anon, authenticated;
revoke all on function public.erp_delete_recipe_draft(uuid) from public, anon, authenticated;
grant execute on function public.erp_save_recipe_draft(uuid, uuid, numeric, jsonb) to authenticated;
grant execute on function public.erp_approve_recipe(uuid) to authenticated;
grant execute on function public.erp_delete_recipe_draft(uuid) to authenticated;
