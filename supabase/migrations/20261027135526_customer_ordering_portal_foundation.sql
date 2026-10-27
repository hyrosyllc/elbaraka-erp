alter table public.erp_clients
	add constraint erp_clients_workspace_id_id_key unique (workspace_id, id);

alter table public.inventory_items
	add constraint inventory_items_workspace_id_id_key unique (workspace_id, id);

alter table public.erp_product_sizes
	add column inventory_item_id uuid,
	add constraint erp_product_sizes_workspace_inventory_item_fkey
		foreign key (workspace_id, inventory_item_id)
		references public.inventory_items(workspace_id, id) on delete restrict;

create unique index erp_product_sizes_workspace_inventory_item_idx
	on public.erp_product_sizes (workspace_id, inventory_item_id)
	where inventory_item_id is not null;

alter table public.erp_sales_orders
	add column idempotency_key uuid;

create unique index erp_sales_orders_workspace_idempotency_idx
	on public.erp_sales_orders (workspace_id, idempotency_key)
	where idempotency_key is not null;

create table public.erp_customer_memberships (
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	client_id uuid not null,
	user_id uuid not null references auth.users(id) on delete restrict,
	full_name text not null check (length(btrim(full_name)) between 1 and 120),
	is_active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	primary key (workspace_id, client_id, user_id),
	foreign key (workspace_id, client_id)
		references public.erp_clients(workspace_id, id) on delete restrict
);

create index erp_customer_memberships_user_active_idx
	on public.erp_customer_memberships (user_id, is_active, workspace_id);

create table public.erp_customer_invites (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null,
	client_id uuid not null,
	email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
	token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
	expires_at timestamptz not null,
	revoked_at timestamptz,
	redeemed_at timestamptz,
	redeemed_by uuid references auth.users(id) on delete restrict,
	created_by uuid not null references auth.users(id) on delete restrict,
	created_at timestamptz not null default now(),
	foreign key (workspace_id, client_id)
		references public.erp_clients(workspace_id, id) on delete restrict,
	check (
		(redeemed_at is null and redeemed_by is null)
		or (redeemed_at is not null and redeemed_by is not null)
	)
);

create index erp_customer_invites_client_created_idx
	on public.erp_customer_invites (workspace_id, client_id, created_at desc);

alter table public.erp_customer_memberships enable row level security;
alter table public.erp_customer_invites enable row level security;

revoke all privileges on table public.erp_customer_memberships from public, anon, authenticated;
revoke all privileges on table public.erp_customer_invites from public, anon, authenticated;
grant select, insert, update on table public.erp_customer_invites to service_role;
grant select, insert, update on table public.erp_customer_memberships to service_role;

create function public.erp_customer_invite_is_valid(p_token_hash text, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1
		from public.erp_customer_invites i
		join public.erp_clients c
			on c.workspace_id = i.workspace_id and c.id = i.client_id
		where i.token_hash = p_token_hash
			and i.email = lower(btrim(p_email))
			and i.expires_at > pg_catalog.now()
			and i.revoked_at is null
			and i.redeemed_at is null
			and c.is_active
	)
$$;

revoke all on function public.erp_customer_invite_is_valid(text, text) from public;
grant execute on function public.erp_customer_invite_is_valid(text, text) to service_role;

create function public.erp_redeem_customer_invite(
	p_token_hash text,
	p_user_id uuid,
	p_email text,
	p_full_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_invite public.erp_customer_invites%rowtype;
	v_auth_email text;
	v_email_confirmed_at timestamptz;
	v_client_name text;
begin
	if p_user_id is null or p_email is null or p_full_name is null
		or length(btrim(p_full_name)) not between 1 and 120
	then
		raise exception 'Invalid customer enrollment.';
	end if;

	select u.email, u.email_confirmed_at
	into v_auth_email, v_email_confirmed_at
	from auth.users u
	where u.id = p_user_id;

	if not found or v_email_confirmed_at is null
		or lower(btrim(v_auth_email)) <> lower(btrim(p_email))
	then
		raise exception 'Verified customer email is required.';
	end if;

	select i.*
	into v_invite
	from public.erp_customer_invites i
	where i.token_hash = p_token_hash
		and i.email = lower(btrim(p_email))
		and i.expires_at > pg_catalog.now()
		and i.revoked_at is null
		and i.redeemed_at is null
	for update;

	if not found then
		raise exception 'Invitation is invalid or expired.';
	end if;

	select c.name
	into v_client_name
	from public.erp_clients c
	where c.workspace_id = v_invite.workspace_id
		and c.id = v_invite.client_id
		and c.is_active;

	if not found then
		raise exception 'Store account is inactive.';
	end if;

	insert into public.erp_customer_memberships (
		workspace_id, client_id, user_id, full_name
	)
	values (
		v_invite.workspace_id, v_invite.client_id, p_user_id, btrim(p_full_name)
	);

	update public.erp_customer_invites
	set redeemed_at = pg_catalog.now(),
		redeemed_by = p_user_id
	where id = v_invite.id;

	return pg_catalog.jsonb_build_object(
		'workspaceId', v_invite.workspace_id,
		'clientId', v_invite.client_id,
		'clientName', v_client_name,
		'fullName', btrim(p_full_name)
	);
end;
$$;

revoke all on function public.erp_redeem_customer_invite(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.erp_redeem_customer_invite(text, uuid, text, text) to service_role;

create function public.erp_submit_customer_order(
	p_user_id uuid,
	p_workspace_id uuid,
	p_client_id uuid,
	p_idempotency_key uuid,
	p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_order_id uuid;
	v_document_number text;
	v_existing public.erp_sales_orders%rowtype;
	v_line jsonb;
	v_size_id uuid;
	v_quantity integer;
	v_item_id uuid;
	v_sku text;
	v_name text;
	v_price numeric(14, 2);
	v_line_count integer := 0;
begin
	if p_lines is null or pg_catalog.jsonb_typeof(p_lines) is distinct from 'array' then
		raise exception 'Invalid order request.';
	end if;

	if p_user_id is null or p_workspace_id is null or p_client_id is null
		or p_idempotency_key is null
		or pg_catalog.jsonb_array_length(p_lines) < 1
		or pg_catalog.jsonb_array_length(p_lines) > 50
	then
		raise exception 'Invalid order request.';
	end if;

	if not exists (
		select 1
		from public.erp_customer_memberships m
		join public.erp_clients c
			on c.workspace_id = m.workspace_id and c.id = m.client_id
		where m.workspace_id = p_workspace_id
			and m.client_id = p_client_id
			and m.user_id = p_user_id
			and m.is_active
			and c.is_active
	) then
		raise exception 'Customer store access is not active.';
	end if;

	perform pg_catalog.pg_advisory_xact_lock(
		pg_catalog.hashtextextended(p_workspace_id::text || p_idempotency_key::text, 0)
	);

	select o.*
	into v_existing
	from public.erp_sales_orders o
	where o.workspace_id = p_workspace_id
		and o.idempotency_key = p_idempotency_key;

	if found then
		if v_existing.client_id is distinct from p_client_id
			or v_existing.created_by is distinct from p_user_id
		then
			raise exception 'Order request could not be verified.';
		end if;
		return pg_catalog.jsonb_build_object(
			'id', v_existing.id,
			'documentNumber', v_existing.document_number,
			'status', v_existing.status,
			'duplicate', true
		);
	end if;

	v_order_id := pg_catalog.gen_random_uuid();
	v_document_number := 'SO-' || pg_catalog.to_char(pg_catalog.now(), 'YYYYMMDD')
		|| '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_order_id::text, '-', ''), 1, 8));

	insert into public.erp_sales_orders (
		id, workspace_id, document_number, client_id, client_name_snapshot,
		status, created_by, idempotency_key
	)
	select
		v_order_id, p_workspace_id, v_document_number, c.id, c.name,
		'draft', p_user_id, p_idempotency_key
	from public.erp_clients c
	where c.workspace_id = p_workspace_id
		and c.id = p_client_id
		and c.is_active;

	if not found then
		raise exception 'Store account is inactive.';
	end if;

	for v_line in select value from pg_catalog.jsonb_array_elements(p_lines)
	loop
		if pg_catalog.jsonb_typeof(v_line) <> 'object'
			or coalesce(v_line->>'sizeId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
			or coalesce(v_line->>'quantity', '') !~ '^[1-9][0-9]{0,4}$'
		then
			raise exception 'Invalid order line.';
		end if;

		v_size_id := (v_line->>'sizeId')::uuid;
		v_quantity := (v_line->>'quantity')::integer;
		if v_quantity > 10000 then
			raise exception 'Order quantity exceeds the allowed limit.';
		end if;

		select i.id, coalesce(s.sku, i.sku),
			p.name_ar || ' (' || pg_catalog.trim_scale(s.size_g)::text || ' g)',
			s.sale_price_mad
		into v_item_id, v_sku, v_name, v_price
		from public.erp_product_sizes s
		join public.erp_products p
			on p.workspace_id = s.workspace_id and p.id = s.product_id
		left join public.erp_product_categories c
			on c.workspace_id = p.workspace_id and c.id = p.category_id
		join public.inventory_items i
			on i.id = s.inventory_item_id
			and i.workspace_id = s.workspace_id
			and i.item_type = 'finished_good'
			and i.is_active
		where s.workspace_id = p_workspace_id
			and s.id = v_size_id
			and s.is_active
			and s.sale_price_mad is not null
			and p.is_active
			and (p.category_id is null or c.is_active);

		if not found then
			raise exception 'A selected product is no longer available.';
		end if;

		if exists (
			select 1 from public.erp_sales_order_lines l
			where l.order_id = v_order_id and l.item_id = v_item_id
		) then
			raise exception 'Each sellable item can only appear once per order.';
		end if;

		insert into public.erp_sales_order_lines (
			id, workspace_id, order_id, item_id, sku_snapshot, name_snapshot,
			quantity, unit_price_mad
		)
		values (
			pg_catalog.gen_random_uuid(), p_workspace_id, v_order_id, v_item_id, v_sku,
			v_name, v_quantity, v_price
		);
		v_line_count := v_line_count + 1;
	end loop;

	if v_line_count <> pg_catalog.jsonb_array_length(p_lines) then
		raise exception 'Invalid order request.';
	end if;

	return pg_catalog.jsonb_build_object(
		'id', v_order_id,
		'documentNumber', v_document_number,
		'status', 'draft',
		'duplicate', false
	);
end;
$$;

revoke all on function public.erp_submit_customer_order(uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.erp_submit_customer_order(uuid, uuid, uuid, uuid, jsonb) to service_role;