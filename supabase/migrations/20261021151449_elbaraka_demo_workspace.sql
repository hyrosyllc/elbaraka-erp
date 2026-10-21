create table public.erp_workspaces (
	id uuid primary key,
	code text not null unique,
	name text not null,
	name_ar text not null,
	country_code char(2) not null check (country_code = 'MA'),
	currency_code char(3) not null check (currency_code = 'MAD'),
	default_locale text not null check (default_locale in ('en', 'ar')),
	supported_locales text[] not null check (supported_locales @> array['en', 'ar']::text[]),
	is_demo boolean not null default false,
	created_at timestamptz not null default now()
);

create table public.erp_clients (
	id uuid primary key,
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	code text not null,
	name text not null,
	name_ar text not null default '',
	contact_name text not null default '',
	phone text not null default '',
	address text not null default '',
	city text not null default '',
	is_active boolean not null default true,
	created_at timestamptz not null default now(),
	unique (workspace_id, code)
);

create table public.erp_suppliers (
	id uuid primary key,
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	code text not null,
	name text not null,
	name_ar text not null default '',
	contact_name text not null default '',
	phone text not null default '',
	lead_time_days integer not null default 7 check (lead_time_days >= 0),
	is_active boolean not null default true,
	created_at timestamptz not null default now(),
	unique (workspace_id, code)
);

create table public.erp_sales_orders (
	id uuid primary key,
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	document_number text not null,
	client_id uuid not null references public.erp_clients(id) on delete restrict,
	client_name_snapshot text not null,
	status text not null check (status in ('draft', 'confirmed', 'part_delivered', 'delivered', 'cancelled')),
	created_at timestamptz not null default now(),
	created_by uuid references auth.users(id) on delete restrict,
	unique (workspace_id, document_number)
);

create table public.erp_sales_order_lines (
	id uuid primary key,
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	order_id uuid not null references public.erp_sales_orders(id) on delete restrict,
	item_id uuid not null references public.inventory_items(id) on delete restrict,
	sku_snapshot text not null,
	name_snapshot text not null,
	quantity integer not null check (quantity > 0),
	unit_price_mad numeric(14, 2) not null check (unit_price_mad >= 0),
	created_at timestamptz not null default now(),
	unique (order_id, item_id)
);

create table public.erp_purchase_orders (
	id uuid primary key,
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	document_number text not null,
	supplier_id uuid not null references public.erp_suppliers(id) on delete restrict,
	supplier_name_snapshot text not null,
	status text not null check (status in ('draft', 'ordered', 'part_received', 'received', 'cancelled')),
	ordered_at timestamptz,
	expected_at date,
	created_at timestamptz not null default now(),
	created_by uuid references auth.users(id) on delete restrict,
	unique (workspace_id, document_number)
);

create table public.erp_purchase_order_lines (
	id uuid primary key,
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	purchase_order_id uuid not null references public.erp_purchase_orders(id) on delete restrict,
	item_id uuid not null references public.inventory_items(id) on delete restrict,
	sku_snapshot text not null,
	name_snapshot text not null,
	quantity_ordered numeric(18, 3) not null check (quantity_ordered > 0),
	quantity_received numeric(18, 3) not null default 0 check (quantity_received >= 0 and quantity_received <= quantity_ordered),
	unit_cost_mad numeric(14, 5) not null check (unit_cost_mad >= 0),
	created_at timestamptz not null default now(),
	unique (purchase_order_id, item_id)
);

create table public.erp_production_orders (
	id uuid primary key,
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	document_number text not null,
	output_item_id uuid not null references public.inventory_items(id) on delete restrict,
	recipe_id uuid references public.inventory_recipes(id) on delete restrict,
	recipe_version integer,
	target_quantity numeric(18, 3) not null check (target_quantity > 0),
	actual_quantity numeric(18, 3) check (actual_quantity >= 0),
	status text not null check (status in ('planned', 'in_progress', 'completed', 'cancelled')),
	created_at timestamptz not null default now(),
	created_by uuid references auth.users(id) on delete restrict,
	unique (workspace_id, document_number)
);

create table public.erp_delivery_notes (
	id uuid primary key,
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	document_number text not null,
	order_id uuid not null references public.erp_sales_orders(id) on delete restrict,
	client_id uuid not null references public.erp_clients(id) on delete restrict,
	client_name_snapshot text not null,
	status text not null check (status in ('ready', 'dispatched', 'delivered', 'failed')),
	dispatched_at timestamptz,
	delivered_at timestamptz,
	created_at timestamptz not null default now(),
	created_by uuid references auth.users(id) on delete restrict,
	unique (workspace_id, document_number)
);

create table public.erp_delivery_note_lines (
	id uuid primary key,
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	delivery_note_id uuid not null references public.erp_delivery_notes(id) on delete restrict,
	order_line_id uuid references public.erp_sales_order_lines(id) on delete restrict,
	item_id uuid not null references public.inventory_items(id) on delete restrict,
	sku_snapshot text not null,
	name_snapshot text not null,
	quantity integer not null check (quantity > 0),
	unit_price_mad numeric(14, 2) not null check (unit_price_mad >= 0),
	created_at timestamptz not null default now()
);

create table public.erp_invoices (
	id uuid primary key,
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	document_number text not null,
	delivery_note_id uuid not null unique references public.erp_delivery_notes(id) on delete restrict,
	client_id uuid not null references public.erp_clients(id) on delete restrict,
	client_name_snapshot text not null,
	currency_code char(3) not null default 'MAD' check (currency_code = 'MAD'),
	subtotal_mad numeric(14, 2) not null check (subtotal_mad >= 0),
	tax_mad numeric(14, 2) not null default 0 check (tax_mad >= 0),
	total_mad numeric(14, 2) not null check (total_mad >= 0),
	issued_at timestamptz not null,
	created_at timestamptz not null default now(),
	created_by uuid references auth.users(id) on delete restrict,
	unique (workspace_id, document_number)
);

create table public.erp_payments (
	id uuid primary key,
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	invoice_id uuid not null references public.erp_invoices(id) on delete restrict,
	amount_mad numeric(14, 2) not null check (amount_mad > 0),
	payment_method text not null check (payment_method in ('cash', 'bank_transfer', 'card', 'cheque', 'other')),
	paid_at timestamptz not null,
	reference text not null default '',
	created_at timestamptz not null default now(),
	created_by uuid references auth.users(id) on delete restrict
);

create table public.erp_customer_returns (
	id uuid primary key,
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	document_number text not null,
	delivery_note_id uuid not null references public.erp_delivery_notes(id) on delete restrict,
	client_id uuid not null references public.erp_clients(id) on delete restrict,
	client_name_snapshot text not null,
	reason text not null check (length(btrim(reason)) > 0),
	status text not null check (status in ('requested', 'inspection', 'released', 'rejected')),
	created_at timestamptz not null default now(),
	created_by uuid references auth.users(id) on delete restrict,
	unique (workspace_id, document_number)
);

create table public.erp_customer_return_lines (
	id uuid primary key,
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	return_id uuid not null references public.erp_customer_returns(id) on delete restrict,
	delivery_line_id uuid references public.erp_delivery_note_lines(id) on delete restrict,
	item_id uuid not null references public.inventory_items(id) on delete restrict,
	quantity integer not null check (quantity > 0),
	created_at timestamptz not null default now()
);

create table public.erp_role_dashboard_sections (
	workspace_id uuid not null references public.erp_workspaces(id) on delete restrict,
	role_code text not null check (role_code in ('manager', 'purchasing', 'delivery')),
	section_code text not null,
	is_visible boolean not null default true,
	created_at timestamptz not null default now(),
	primary key (workspace_id, role_code, section_code)
);

alter table public.inventory_items
	add column if not exists workspace_id uuid references public.erp_workspaces(id) on delete restrict,
	add column if not exists name_ar text not null default '',
	add column if not exists reorder_point numeric(18, 3) not null default 0 check (reorder_point >= 0),
	add column if not exists sale_price_mad numeric(14, 2) not null default 0 check (sale_price_mad >= 0);

alter table public.inventory_locations
	add column if not exists workspace_id uuid references public.erp_workspaces(id) on delete restrict;

alter table public.inventory_lots
	add column if not exists workspace_id uuid references public.erp_workspaces(id) on delete restrict;

alter table public.inventory_recipes
	add column if not exists workspace_id uuid references public.erp_workspaces(id) on delete restrict;

alter table public.inventory_recipe_components
	add column if not exists workspace_id uuid references public.erp_workspaces(id) on delete restrict;

alter table public.inventory_reservations
	add column if not exists workspace_id uuid references public.erp_workspaces(id) on delete restrict;

alter table public.inventory_movements
	add column if not exists workspace_id uuid references public.erp_workspaces(id) on delete restrict;

create index erp_clients_workspace_active_idx on public.erp_clients (workspace_id, is_active, name);
create index erp_suppliers_workspace_active_idx on public.erp_suppliers (workspace_id, is_active, name);
create index erp_sales_orders_workspace_status_idx on public.erp_sales_orders (workspace_id, status, created_at desc);
create index erp_purchase_orders_workspace_status_idx on public.erp_purchase_orders (workspace_id, status, created_at desc);
create index erp_production_orders_workspace_status_idx on public.erp_production_orders (workspace_id, status, created_at desc);
create index erp_delivery_notes_workspace_status_idx on public.erp_delivery_notes (workspace_id, status, created_at desc);
create index erp_invoices_workspace_client_idx on public.erp_invoices (workspace_id, client_id, issued_at desc);
create index erp_returns_workspace_status_idx on public.erp_customer_returns (workspace_id, status, created_at desc);
create index inventory_items_workspace_type_idx on public.inventory_items (workspace_id, item_type, is_active, name);
create index inventory_movements_workspace_item_idx on public.inventory_movements (workspace_id, item_id, recorded_at desc);

insert into public.erp_workspaces (
	id, code, name, name_ar, country_code, currency_code, default_locale, supported_locales, is_demo
) values (
	'd0000000-0000-4000-8000-000000000001', 'elbaraka-preview', 'Elbaraka Epices Demo', 'معاينة البركة للتوابل', 'MA', 'MAD', 'en', array['en', 'ar'], true
) on conflict (id) do nothing;

insert into public.inventory_items (
	id, workspace_id, sku, name, name_ar, item_type, base_unit, net_weight_g, reorder_point,
	track_lots, is_active, sale_price_mad
) values
	('d1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'RM-CUM-001', 'Cumin seeds', 'بذور الكمون', 'raw_material', 'g', null, 80000, true, true, 0),
	('d1000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'RM-TUR-002', 'Turmeric powder', 'مسحوق الكركم', 'raw_material', 'g', null, 50000, true, true, 0),
	('d1000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'RM-BPE-003', 'Black pepper', 'الفلفل الأسود', 'raw_material', 'g', null, 90000, true, true, 0),
	('d1000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'RM-PAP-004', 'Sweet paprika', 'بابريكا حلوة', 'raw_material', 'g', null, 70000, true, true, 0),
	('d1000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001', 'BL-BAH-001', 'House baharat', 'بهارات الدار', 'blend', 'g', null, 12000, true, true, 0),
	('d1000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000001', 'BL-REH-002', 'Ras el hanout', 'رأس الحانوت', 'blend', 'g', null, 8000, true, true, 0),
	('d1000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000001', 'PK-JAR-050', 'Glass jar, 50 g', 'مرطبان زجاجي 50 غ', 'packaging', 'each', null, 500, false, true, 0),
	('d1000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000001', 'PK-LBL-050', 'Front label, 50 g', 'ملصق أمامي 50 غ', 'packaging', 'each', null, 600, false, true, 0),
	('d1000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000001', 'FG-BAH-050', 'House baharat, 50 g jar', 'بهارات الدار، مرطبان 50 غ', 'finished_good', 'each', 50, 36, true, true, 18),
	('d1000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000001', 'FG-CUM-100', 'Ground cumin, 100 g pouch', 'كمون مطحون، كيس 100 غ', 'finished_good', 'each', 100, 30, true, true, 22),
	('d1000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000001', 'FG-PAP-050', 'Sweet paprika, 50 g jar', 'بابريكا حلوة، مرطبان 50 غ', 'finished_good', 'each', 50, 36, true, true, 16),
	('d1000000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-000000000001', 'FG-TUR-050', 'Turmeric, 50 g jar', 'كركم، مرطبان 50 غ', 'finished_good', 'each', 50, 36, true, true, 15)
on conflict (id) do nothing;

insert into public.inventory_locations (id, workspace_id, code, name, location_type)
values ('d2000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'MAIN-WH', 'Demo main warehouse', 'warehouse')
on conflict (id) do nothing;

insert into public.inventory_recipes (id, workspace_id, output_item_id, version, output_quantity, status)
values
	('d3000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000005', 1, 1000, 'draft'),
	('d3000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000006', 1, 1000, 'draft'),
	('d3000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000009', 1, 1, 'draft'),
	('d3000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000010', 1, 1, 'draft'),
	('d3000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000011', 1, 1, 'draft'),
	('d3000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000012', 1, 1, 'draft')
on conflict (id) do nothing;

insert into public.inventory_recipe_components (id, workspace_id, recipe_id, input_item_id, quantity)
values
	('d3100000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 400),
	('d3100000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000003', 200),
	('d3100000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000004', 400),
	('d3100000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 300),
	('d3100000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 250),
	('d3100000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000004', 450),
	('d3100000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000005', 50),
	('d3100000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000007', 1),
	('d3100000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000008', 1),
	('d3100000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000001', 100),
	('d3100000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000004', 50),
	('d3100000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000007', 1),
	('d3100000-0000-4000-8000-000000000013', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000008', 1),
	('d3100000-0000-4000-8000-000000000014', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000006', 'd1000000-0000-4000-8000-000000000002', 50),
	('d3100000-0000-4000-8000-000000000015', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000006', 'd1000000-0000-4000-8000-000000000007', 1),
	('d3100000-0000-4000-8000-000000000016', 'd0000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000006', 'd1000000-0000-4000-8000-000000000008', 1)
on conflict (id) do nothing;

insert into public.inventory_locations (id, workspace_id, code, name, location_type)
values ('d2000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'MAIN-WH', 'Demo main warehouse', 'warehouse')
on conflict (id) do nothing;

insert into public.erp_clients (id, workspace_id, code, name, name_ar, contact_name, phone, address, city)
values
	('d4000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'DEMO-CLIENT-01', 'Demo Atlas Market', 'متجر أطلس التجريبي', 'Demo contact A', '+212 6 00 00 00 01', 'Demo address, Hassan II Avenue', 'Casablanca'),
	('d4000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'DEMO-CLIENT-02', 'Demo Corner Shop', 'متجر الزاوية التجريبي', 'Demo contact B', '+212 6 00 00 00 02', 'Demo address, Flower Street', 'Rabat'),
	('d4000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'DEMO-CLIENT-03', 'Demo Medina Store', 'متجر المدينة التجريبي', 'Demo contact C', '+212 6 00 00 00 03', 'Demo address, Old Medina', 'Marrakech')
on conflict (id) do nothing;

insert into public.erp_suppliers (id, workspace_id, code, name, name_ar, contact_name, phone, lead_time_days)
values
	('d5000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'DEMO-SUP-01', 'Demo Spice Supplier', 'مورد توابل تجريبي', 'Demo supplier contact A', '+212 5 00 00 00 01', 7),
	('d5000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'DEMO-SUP-02', 'Demo Pack Supplier', 'مورد تغليف تجريبي', 'Demo supplier contact B', '+212 5 00 00 00 02', 5)
on conflict (id) do nothing;

insert into public.erp_sales_orders (id, workspace_id, document_number, client_id, client_name_snapshot, status, created_at)
values
	('d6000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'SO-DEMO-1048', 'd4000000-0000-4000-8000-000000000001', 'Demo Atlas Market', 'confirmed', '2026-10-21T09:12:00Z'),
	('d6000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'SO-DEMO-1047', 'd4000000-0000-4000-8000-000000000002', 'Demo Corner Shop', 'delivered', '2026-10-20T14:40:00Z')
on conflict (id) do nothing;

insert into public.erp_sales_order_lines (id, workspace_id, order_id, item_id, sku_snapshot, name_snapshot, quantity, unit_price_mad)
values
	('d6100000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000009', 'FG-BAH-050', 'House baharat, 50 g jar', 24, 18),
	('d6100000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000011', 'FG-PAP-050', 'Sweet paprika, 50 g jar', 12, 16),
	('d6100000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000010', 'FG-CUM-100', 'Ground cumin, 100 g pouch', 10, 22)
on conflict (id) do nothing;

insert into public.erp_delivery_notes (id, workspace_id, document_number, order_id, client_id, client_name_snapshot, status, dispatched_at, delivered_at, created_at)
values ('d7000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'DN-DEMO-1047', 'd6000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000002', 'Demo Corner Shop', 'delivered', '2026-10-20T15:45:00Z', '2026-10-20T16:00:00Z', '2026-10-20T15:30:00Z')
on conflict (id) do nothing;

insert into public.erp_delivery_note_lines (id, workspace_id, delivery_note_id, order_line_id, item_id, sku_snapshot, name_snapshot, quantity, unit_price_mad)
values ('d7100000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 'd6100000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000010', 'FG-CUM-100', 'Ground cumin, 100 g pouch', 10, 22)
on conflict (id) do nothing;

insert into public.erp_purchase_orders (id, workspace_id, document_number, supplier_id, supplier_name_snapshot, status, ordered_at, expected_at, created_at)
values ('d8000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'PO-DEMO-0203', 'd5000000-0000-4000-8000-000000000001', 'Demo Spice Supplier', 'ordered', '2026-10-20T10:00:00Z', '2026-10-27', '2026-10-20T09:30:00Z')
on conflict (id) do nothing;

insert into public.erp_purchase_order_lines (id, workspace_id, purchase_order_id, item_id, sku_snapshot, name_snapshot, quantity_ordered, quantity_received, unit_cost_mad)
values ('d8100000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000003', 'RM-BPE-003', 'Black pepper', 100000, 0, 0.08)
on conflict (id) do nothing;

insert into public.erp_production_orders (id, workspace_id, document_number, output_item_id, recipe_id, recipe_version, target_quantity, status, created_at)
values ('d9000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'MO-DEMO-0057', 'd1000000-0000-4000-8000-000000000009', 'd3000000-0000-4000-8000-000000000003', 1, 48, 'planned', '2026-10-21T08:30:00Z')
on conflict (id) do nothing;

insert into public.erp_invoices (id, workspace_id, document_number, delivery_note_id, client_id, client_name_snapshot, subtotal_mad, tax_mad, total_mad, issued_at)
values ('da000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'FAC-DEMO-2026-0047', 'd7000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002', 'Demo Corner Shop', 220, 0, 220, '2026-10-20T16:15:00Z')
on conflict (id) do nothing;

insert into public.erp_customer_returns (id, workspace_id, document_number, delivery_note_id, client_id, client_name_snapshot, reason, status, created_at)
values ('db000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'RET-DEMO-0001', 'd7000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002', 'Demo Corner Shop', 'Demo return for inspection', 'requested', '2026-10-21T10:00:00Z')
on conflict (id) do nothing;

insert into public.erp_customer_return_lines (id, workspace_id, return_id, delivery_line_id, item_id, quantity)
values ('db100000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000010', 1)
on conflict (id) do nothing;

insert into public.inventory_lots (id, workspace_id, item_id, lot_code, supplier_lot_code, expires_on, lot_status)
values
	('dc000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'DEMO-CUM-2026-01', 'DEMO-SUP-CUM-01', '2027-12-31', 'available'),
	('dc000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'DEMO-TUR-2026-01', 'DEMO-SUP-TUR-01', '2027-10-31', 'available'),
	('dc000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000003', 'DEMO-BPE-2026-01', 'DEMO-SUP-BPE-01', '2027-08-31', 'available'),
	('dc000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000004', 'DEMO-PAP-2026-01', 'DEMO-SUP-PAP-01', '2027-11-30', 'available'),
	('dc000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000005', 'DEMO-BAH-2026-01', null, '2027-10-31', 'available'),
	('dc000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000006', 'DEMO-REH-2026-01', null, '2027-10-31', 'available'),
	('dc000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000009', 'DEMO-FG-BAH-2026-01', null, '2027-10-31', 'available'),
	('dc000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000010', 'DEMO-FG-CUM-2026-01', null, '2027-08-31', 'available'),
	('dc000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000011', 'DEMO-FG-PAP-2026-01', null, '2027-11-30', 'available'),
	('dc000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000012', 'DEMO-FG-TUR-2026-01', null, '2027-10-31', 'available')
on conflict (id) do nothing;

insert into public.inventory_movements (id, workspace_id, item_id, location_id, lot_id, movement_type, quantity_delta, reference_type, reference_id, idempotency_key)
values
	('dd000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000000001', 'opening_balance', 428000, 'demo_opening', 'd0000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000001'),
	('dd000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000000002', 'opening_balance', 186000, 'demo_opening', 'd0000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000002'),
	('dd000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000000003', 'opening_balance', 74000, 'demo_opening', 'd0000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000003'),
	('dd000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000000004', 'opening_balance', 255000, 'demo_opening', 'd0000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000004'),
	('dd000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000005', 'd2000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000000005', 'opening_balance', 38200, 'demo_opening', 'd0000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000005'),
	('dd000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000006', 'd2000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000000006', 'opening_balance', 17600, 'demo_opening', 'd0000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000006'),
	('dd000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000007', 'd2000000-0000-4000-8000-000000000001', null, 'opening_balance', 1640, 'demo_opening', 'd0000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000007'),
	('dd000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000008', 'd2000000-0000-4000-8000-000000000001', null, 'opening_balance', 380, 'demo_opening', 'd0000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000008'),
	('dd000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000009', 'd2000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000000007', 'opening_balance', 94, 'demo_opening', 'd0000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000009'),
	('dd000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000010', 'd2000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000000008', 'opening_balance', 37, 'demo_opening', 'd0000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000010'),
	('dd000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000010', 'd2000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000000008', 'shipment', -10, 'erp_delivery_note', 'd7000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000011'),
	('dd000000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000011', 'd2000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000000009', 'opening_balance', 128, 'demo_opening', 'd0000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000012'),
	('dd000000-0000-4000-8000-000000000013', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000012', 'd2000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000000010', 'opening_balance', 73, 'demo_opening', 'd0000000-0000-4000-8000-000000000001', 'de000000-0000-4000-8000-000000000013')
on conflict (id) do nothing;

insert into public.inventory_reservations (id, workspace_id, item_id, location_id, quantity, source_type, source_id, status, idempotency_key)
values
	('df000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000009', 'd2000000-0000-4000-8000-000000000001', 24, 'erp_sales_order', 'd6000000-0000-4000-8000-000000000001', 'active', 'df100000-0000-4000-8000-000000000001'),
	('df000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000011', 'd2000000-0000-4000-8000-000000000001', 12, 'erp_sales_order', 'd6000000-0000-4000-8000-000000000001', 'active', 'df100000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.erp_role_dashboard_sections (workspace_id, role_code, section_code, is_visible)
select 'd0000000-0000-4000-8000-000000000001', role_code, section_code, is_visible
from (values
	('manager', 'overview', true), ('manager', 'catalog', true), ('manager', 'inventory', true), ('manager', 'recipes', true), ('manager', 'purchasing', true), ('manager', 'production', true), ('manager', 'clients', true), ('manager', 'orders', true), ('manager', 'deliveries', true), ('manager', 'invoices', true), ('manager', 'returns', true), ('manager', 'access', true),
	('purchasing', 'overview', true), ('purchasing', 'catalog', true), ('purchasing', 'inventory', true), ('purchasing', 'recipes', true), ('purchasing', 'purchasing', true), ('purchasing', 'production', true), ('purchasing', 'clients', true), ('purchasing', 'orders', false), ('purchasing', 'deliveries', false), ('purchasing', 'invoices', false), ('purchasing', 'returns', false), ('purchasing', 'access', false),
	('delivery', 'overview', true), ('delivery', 'catalog', false), ('delivery', 'inventory', true), ('delivery', 'recipes', false), ('delivery', 'purchasing', false), ('delivery', 'production', false), ('delivery', 'clients', true), ('delivery', 'orders', true), ('delivery', 'deliveries', true), ('delivery', 'invoices', false), ('delivery', 'returns', true), ('delivery', 'access', false)
) as sections(role_code, section_code, is_visible)
on conflict (workspace_id, role_code, section_code) do nothing;

do $$
declare
	table_name text;
	table_names text[] := array[
		'erp_workspaces', 'erp_clients', 'erp_suppliers', 'erp_sales_orders', 'erp_sales_order_lines',
		'erp_purchase_orders', 'erp_purchase_order_lines', 'erp_production_orders', 'erp_delivery_notes',
		'erp_delivery_note_lines', 'erp_invoices', 'erp_payments', 'erp_customer_returns',
		'erp_customer_return_lines', 'erp_role_dashboard_sections', 'inventory_items', 'inventory_locations',
		'inventory_lots', 'inventory_recipes', 'inventory_recipe_components', 'inventory_reservations',
		'inventory_movements'
	];
begin
	foreach table_name in array table_names loop
		execute format('alter table public.%I enable row level security', table_name);
		execute format('revoke all privileges on table public.%I from anon, authenticated', table_name);
		execute format('grant select on table public.%I to anon, authenticated', table_name);
		execute format('drop policy if exists "demo workspace read" on public.%I', table_name);
		if table_name = 'erp_workspaces' then
			execute format(
				'create policy "demo workspace read" on public.%I for select to anon, authenticated using (id = %L::uuid and is_demo)',
				table_name, 'd0000000-0000-4000-8000-000000000001'
			);
		else
			execute format(
				'create policy "demo workspace read" on public.%I for select to anon, authenticated using (workspace_id = %L::uuid)',
				table_name, 'd0000000-0000-4000-8000-000000000001'
			);
		end if;
	end loop;
end;
$$;
