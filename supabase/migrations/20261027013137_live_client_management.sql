revoke all privileges on table public.erp_clients from anon, authenticated;
grant select, insert, update on table public.erp_clients to authenticated;

create policy "workspace managers can create clients"
	on public.erp_clients
	for insert to authenticated
	with check (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid())
				and is_active
				and role_code = 'manager'
		)
	);

create policy "workspace managers can update clients"
	on public.erp_clients
	for update to authenticated
	using (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid())
				and is_active
				and role_code = 'manager'
		)
	)
	with check (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid())
				and is_active
				and role_code = 'manager'
		)
	);