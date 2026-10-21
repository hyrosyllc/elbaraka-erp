do $$
declare
  target_workspace_id constant uuid := 'd0000000-0000-4000-8000-000000000001';
  manager_email constant text := 'replace-with-confirmed-manager-email@example.com';
  manager_user_id uuid;
begin
  if exists (
    select 1
    from public.erp_workspace_memberships
    where erp_workspace_memberships.workspace_id = target_workspace_id
      and role_code = 'manager'
      and is_active
  ) then
    raise exception 'An active manager already exists for this workspace';
  end if;

  select id into manager_user_id
  from auth.users
  where lower(email) = lower(manager_email)
    and email_confirmed_at is not null;

  if manager_user_id is null then
    raise exception 'Create and confirm the manager Auth user before running this script';
  end if;

  insert into public.erp_workspace_memberships (
    workspace_id,
    user_id,
    role_code,
    full_name,
    is_active
  ) values (
    target_workspace_id,
    manager_user_id,
    'manager',
    'Elbaraka Manager',
    true
  );
end;
$$;