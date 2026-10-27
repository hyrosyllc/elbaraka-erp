create table public.erp_workspace_memberships (
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	user_id uuid not null references auth.users(id) on delete restrict,
	role_code text not null check (role_code in ('manager', 'purchasing', 'delivery')),
	full_name text not null check (length(btrim(full_name)) > 0),
	is_active boolean not null default true,
	invited_by uuid references auth.users(id) on delete restrict,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	primary key (workspace_id, user_id)
);

create index erp_workspace_memberships_user_active_idx
	on public.erp_workspace_memberships (user_id, is_active, workspace_id);

alter table public.erp_workspace_memberships enable row level security;
revoke all privileges on table public.erp_workspace_memberships from anon, authenticated;
grant select on table public.erp_workspace_memberships to authenticated;

create policy "members can read their active membership"
	on public.erp_workspace_memberships
	for select to authenticated
	using (user_id = (select auth.uid()) and is_active);

create policy "workspace members can read their workspace"
	on public.erp_workspaces
	for select to authenticated
	using (
		id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid()) and is_active
		)
	);

do $$
declare
	table_name text;
	role_predicate text;
	table_names text[] := array[
		'erp_clients', 'erp_suppliers', 'erp_sales_orders', 'erp_sales_order_lines',
		'erp_purchase_orders', 'erp_purchase_order_lines', 'erp_production_orders',
		'erp_delivery_notes', 'erp_delivery_note_lines', 'erp_invoices', 'erp_payments',
		'erp_customer_returns', 'erp_customer_return_lines', 'erp_role_dashboard_sections',
		'inventory_items', 'inventory_locations', 'inventory_lots', 'inventory_recipes',
		'inventory_recipe_components', 'inventory_reservations', 'inventory_movements'
	];
begin
	foreach table_name in array table_names loop
		execute format('drop policy if exists "demo workspace read" on public.%I', table_name);
		execute format('drop policy if exists "authenticated workspace member read" on public.%I', table_name);
		execute format(
			'create policy "demo workspace read" on public.%I for select to anon using (workspace_id = %L::uuid)',
			table_name, 'd0000000-0000-4000-8000-000000000001'
		);

		role_predicate := case
			when table_name in ('erp_suppliers', 'erp_purchase_orders', 'erp_purchase_order_lines', 'erp_production_orders', 'inventory_recipes', 'inventory_recipe_components')
				then 'role_code in (''manager'', ''purchasing'')'
			when table_name in ('erp_invoices', 'erp_payments', 'erp_role_dashboard_sections')
				then 'role_code = ''manager'''
			when table_name in ('erp_customer_returns', 'erp_customer_return_lines', 'erp_delivery_notes', 'erp_delivery_note_lines')
				then 'role_code in (''manager'', ''delivery'')'
			else 'role_code in (''manager'', ''purchasing'', ''delivery'')'
		end;

		if table_name = 'inventory_items' then
			execute format(
				'create policy "authenticated workspace member read" on public.%I for select to authenticated using (workspace_id in (select workspace_id from public.erp_workspace_memberships where user_id = (select auth.uid()) and is_active and role_code in (''manager'', ''purchasing'')) or (item_type = ''finished_good'' and workspace_id in (select workspace_id from public.erp_workspace_memberships where user_id = (select auth.uid()) and is_active and role_code = ''delivery'')))',
				table_name
			);
		elsif table_name in ('inventory_lots', 'inventory_reservations') then
			execute format(
				'create policy "authenticated workspace member read" on public.%I for select to authenticated using (workspace_id in (select workspace_id from public.erp_workspace_memberships where user_id = (select auth.uid()) and is_active and role_code in (''manager'', ''purchasing'')) or (item_id in (select id from public.inventory_items where item_type = ''finished_good'') and workspace_id in (select workspace_id from public.erp_workspace_memberships where user_id = (select auth.uid()) and is_active and role_code = ''delivery'')))',
				table_name
			);
		elsif table_name = 'inventory_movements' then
			execute format(
				'create policy "authenticated workspace member read" on public.%I for select to authenticated using (workspace_id in (select workspace_id from public.erp_workspace_memberships where user_id = (select auth.uid()) and is_active and role_code in (''manager'', ''purchasing'')) or (movement_type in (''shipment'', ''customer_return'', ''return_release'') and item_id in (select id from public.inventory_items where item_type = ''finished_good'') and workspace_id in (select workspace_id from public.erp_workspace_memberships where user_id = (select auth.uid()) and is_active and role_code = ''delivery'')))',
				table_name
			);
		else
			execute format(
				'create policy "authenticated workspace member read" on public.%I for select to authenticated using (workspace_id in (select workspace_id from public.erp_workspace_memberships where user_id = (select auth.uid()) and is_active and %s))',
				table_name, role_predicate
			);
		end if;
	end loop;

	execute 'drop policy if exists "demo workspace read" on public.erp_workspaces';
	execute 'drop policy if exists "workspace members can read their workspace" on public.erp_workspaces';
	execute 'create policy "demo workspace read" on public.erp_workspaces for select to anon using (id = ''d0000000-0000-4000-8000-000000000001''::uuid and is_demo)';
	execute 'create policy "workspace members can read their workspace" on public.erp_workspaces for select to authenticated using (id in (select workspace_id from public.erp_workspace_memberships where user_id = (select auth.uid()) and is_active))';
end;
$$;
