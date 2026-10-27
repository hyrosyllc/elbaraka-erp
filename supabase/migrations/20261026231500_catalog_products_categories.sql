insert into public.erp_workspaces (
	id, code, name, name_ar, country_code, currency_code,
	default_locale, supported_locales, is_demo
)
values (
	'e0000000-0000-4000-8000-000000000001',
	'elbaraka-main',
	'Elbaraka Epices',
	'البركة للتوابل',
	'MA',
	'MAD',
	'ar',
	array['en', 'ar'],
	false
)
on conflict (id) do nothing;

create table public.erp_product_categories (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	name_ar text not null check (length(btrim(name_ar)) between 1 and 120),
	name text not null default '' check (length(name) <= 120),
	is_active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (workspace_id, id),
	unique (workspace_id, name_ar)
);

create table public.erp_products (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	category_id uuid,
	name_ar text not null check (length(btrim(name_ar)) between 1 and 160),
	name text not null default '' check (length(name) <= 160),
	stock_unit text not null default 'g' check (stock_unit in ('g', 'kg')),
	is_active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (workspace_id, id),
	unique (workspace_id, name_ar),
	foreign key (workspace_id, category_id)
		references public.erp_product_categories(workspace_id, id) on delete restrict
);

create table public.erp_product_sizes (
	id uuid primary key default gen_random_uuid(),
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	product_id uuid not null,
	size_g numeric(18, 3) not null check (size_g > 0 and size_g <= 1000000000),
	sku text check (sku is null or (length(btrim(sku)) between 1 and 40 and sku = upper(btrim(sku)))),
	sale_price_mad numeric(14, 2) check (sale_price_mad is null or sale_price_mad >= 0),
	is_active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	foreign key (workspace_id, product_id)
		references public.erp_products(workspace_id, id) on delete restrict,
	unique (product_id, size_g)
);

create unique index erp_product_sizes_workspace_sku_idx
	on public.erp_product_sizes (workspace_id, sku)
	where sku is not null;

create index erp_products_workspace_category_active_name_idx
	on public.erp_products (workspace_id, category_id, is_active, name_ar);

create index erp_product_sizes_workspace_product_active_idx
	on public.erp_product_sizes (workspace_id, product_id, is_active, size_g);

alter table public.erp_product_categories enable row level security;
alter table public.erp_products enable row level security;
alter table public.erp_product_sizes enable row level security;

revoke all privileges on table
	public.erp_product_categories,
	public.erp_products,
	public.erp_product_sizes
from anon, authenticated;

grant select, insert, update on table
	public.erp_product_categories,
	public.erp_products,
	public.erp_product_sizes
to authenticated;

create policy "workspace members read product categories"
	on public.erp_product_categories
	for select to authenticated
	using (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid()) and is_active
		)
	);

create policy "managers insert product categories"
	on public.erp_product_categories
	for insert to authenticated
	with check (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid()) and is_active and role_code = 'manager'
		)
	);

create policy "managers update product categories"
	on public.erp_product_categories
	for update to authenticated
	using (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid()) and is_active and role_code = 'manager'
		)
	)
	with check (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid()) and is_active and role_code = 'manager'
		)
	);

create policy "workspace members read products"
	on public.erp_products
	for select to authenticated
	using (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid()) and is_active
		)
	);

create policy "managers insert products"
	on public.erp_products
	for insert to authenticated
	with check (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid()) and is_active and role_code = 'manager'
		)
	);

create policy "managers update products"
	on public.erp_products
	for update to authenticated
	using (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid()) and is_active and role_code = 'manager'
		)
	)
	with check (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid()) and is_active and role_code = 'manager'
		)
	);

create policy "workspace members read product sizes"
	on public.erp_product_sizes
	for select to authenticated
	using (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid()) and is_active
		)
	);

create policy "managers insert product sizes"
	on public.erp_product_sizes
	for insert to authenticated
	with check (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid()) and is_active and role_code = 'manager'
		)
	);

create policy "managers update product sizes"
	on public.erp_product_sizes
	for update to authenticated
	using (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid()) and is_active and role_code = 'manager'
		)
	)
	with check (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid()) and is_active and role_code = 'manager'
		)
	);
