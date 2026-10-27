revoke all privileges on table public.erp_suppliers from anon, authenticated;
grant select, insert, update on table public.erp_suppliers to authenticated;

create policy "workspace purchasing roles can create suppliers"
	on public.erp_suppliers
	for insert to authenticated
	with check (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid())
				and is_active
				and role_code in ('manager', 'purchasing')
		)
	);

create policy "workspace purchasing roles can update suppliers"
	on public.erp_suppliers
	for update to authenticated
	using (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid())
				and is_active
				and role_code in ('manager', 'purchasing')
		)
	)
	with check (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid())
				and is_active
				and role_code in ('manager', 'purchasing')
		)
	);