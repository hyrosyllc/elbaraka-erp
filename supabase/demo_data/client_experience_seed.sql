-- Opt-in client-management demo data. Run only after replacing the workspace
-- UUID below with the real workspace you intend to use. This is not a migration
-- or part of the automatic Supabase seed.
-- Find the target with: select id, code, name from public.erp_workspaces where not is_demo;
--
-- Creates 32 tagged clients, six catalog items, 128 sales orders, multiple
-- delivery states, invoices spanning payment/credit states, follow-up notes,
-- return states, and invitation lifecycle examples. Active customer memberships
-- are not fabricated because they require real auth.users accounts. No auth
-- users or stock movements are created; demo inventory therefore has zero
-- on-hand stock. Delivery and return states are display fixtures, not stock
-- ledger transactions; do not use them to validate inventory reconciliation
-- or to exercise stock-mutating lifecycle RPCs.
--
-- Remove this dataset with supabase/demo_data/client_experience_cleanup.sql.

begin;

create temporary table _ux_demo_context on commit drop as
select
	w.id as workspace_id,
	w.is_demo,
	(
		select m.user_id
		from public.erp_workspace_memberships m
		where m.workspace_id = w.id
			and m.is_active
			and m.role_code = 'manager'
		order by m.created_at, m.user_id
		limit 1
	) as manager_id
from public.erp_workspaces w
where w.id = 'e0000000-0000-4000-8000-000000000001'::uuid;

do $$
begin
	if not exists (select 1 from _ux_demo_context) then
		raise exception 'Workspace not found. Replace the UUID in this script with an existing workspace UUID.';
	end if;
	if exists (select 1 from _ux_demo_context where is_demo) then
		raise exception 'Refusing to seed the prebuilt demo workspace. Choose the real workspace explicitly.';
	end if;
	if exists (select 1 from _ux_demo_context where manager_id is null) then
		raise exception 'The selected workspace has no active manager membership; cannot safely attribute demo records.';
	end if;
	if exists (
		select 1 from public.erp_clients c
		join _ux_demo_context x on x.workspace_id = c.workspace_id
		where c.code like 'UXDEMO-C-%'
	) then
		raise exception 'UXDEMO client records already exist in this workspace. Run the matching cleanup script before reseeding.';
	end if;
end;
$$;

create temporary table _ux_demo_clients (
	n integer primary key,
	id uuid not null unique,
	code text not null,
	name text not null,
	name_ar text not null,
	contact_name text not null,
	phone text not null,
	address text not null,
	city text not null,
	latitude numeric(9, 6) not null,
	longitude numeric(9, 6) not null,
	is_active boolean not null,
	created_at timestamptz not null
) on commit drop;

insert into _ux_demo_clients
select
	s.n,
	md5(x.workspace_id::text || ':uxdemo:client:' || s.n)::uuid,
	'UXDEMO-C-' || lpad(s.n::text, 3, '0'),
	s.store_name,
	'متجر تجريبي ' || lpad(s.n::text, 3, '0'),
	'Demo Contact ' || lpad(s.n::text, 2, '0'),
	'+212000' || lpad(s.n::text, 6, '0'),
	'Demo Boulevard ' || s.n || ', ' || s.city,
	s.city,
	round((s.base_lat + ((s.n % 5) - 2) * 0.002)::numeric, 6),
	round((s.base_lon + ((s.n % 7) - 3) * 0.002)::numeric, 6),
	s.n % 8 <> 0,
	now() - (180 + ((s.n * 11) % 240)) * interval '1 day'
from _ux_demo_context x
cross join (
	select
		names.n::integer,
		names.store_name,
		cities.city,
		cities.base_lat,
		cities.base_lon
	from unnest(array[
		'Atlas Corner Market', 'Medina Pantry', 'Olive & Spice Shop', 'Blue Gate Grocers',
		'Golden Saffron Foods', 'Palm Route Market', 'Cedar Basket', 'Riad Family Store',
		'Coastal Kitchen Supply', 'Red City Provisions', 'Kasbah Essentials', 'North Star Foods',
		'Garden Gate Grocers', 'Souk Select', 'Mint Leaf Pantry', 'Mountain Table',
		'Harbor House Foods', 'Amber Jar Market', 'Sunrise Provisions', 'Old Town Grocer',
		'Argan Valley Shop', 'Market Square Pantry', 'Desert Bloom Foods', 'Caravan Kitchen',
		'Royal Crescent Grocers', 'Spice Trail Market', 'Terrace Pantry', 'Blue Atlas Foods',
		'Date Palm Provisions', 'Citrus Grove Market', 'Lantern House Grocers', 'Kasbah Corner Shop'
	]::text[]) with ordinality as names(store_name, n)
	join lateral (
		select cities.city, cities.base_lat, cities.base_lon
		from (values
			(1, 'Casablanca', 33.5731::numeric, -7.5898::numeric),
			(2, 'Rabat', 34.0209::numeric, -6.8416::numeric),
			(3, 'Marrakech', 31.6295::numeric, -7.9811::numeric),
			(4, 'Fes', 34.0331::numeric, -5.0003::numeric),
			(5, 'Tangier', 35.7595::numeric, -5.8340::numeric),
			(6, 'Agadir', 30.4278::numeric, -9.5981::numeric),
			(7, 'Meknes', 33.8935::numeric, -5.5473::numeric),
			(8, 'Oujda', 34.6814::numeric, -1.9086::numeric)
		) as cities(city_n, city, base_lat, base_lon)
		where cities.city_n = ((names.n - 1) % 8) + 1
	) cities on true
) s;

insert into public.erp_clients (
	id, workspace_id, code, name, name_ar, contact_name, phone, address, city,
	latitude, longitude, is_active, created_at
)
select
	c.id, x.workspace_id, c.code, c.name, c.name_ar, c.contact_name, c.phone, c.address,
	c.city, c.latitude, c.longitude, c.is_active, c.created_at
from _ux_demo_clients c
cross join _ux_demo_context x;

create temporary table _ux_demo_categories (
	category_key text primary key,
	id uuid not null unique,
	name text not null,
	name_ar text not null
) on commit drop;

insert into _ux_demo_categories
select v.category_key,
	md5(x.workspace_id::text || ':uxdemo:category:' || v.category_key)::uuid,
	v.name, v.name_ar
from _ux_demo_context x
cross join (values
	('spices', 'UXDEMO Spices', 'تجريبي - توابل'),
	('herbs', 'UXDEMO Herbs', 'تجريبي - أعشاب'),
	('blends', 'UXDEMO Blends', 'تجريبي - خلطات'),
	('pantry', 'UXDEMO Pantry', 'تجريبي - مؤونة')
) as v(category_key, name, name_ar);

insert into public.erp_product_categories (id, workspace_id, name, name_ar)
select c.id, x.workspace_id, c.name, c.name_ar
from _ux_demo_categories c
cross join _ux_demo_context x;

create temporary table _ux_demo_items (
	n integer primary key,
	category_id uuid not null,
	product_id uuid not null unique,
	item_id uuid not null unique,
	size_id uuid not null unique,
	product_name text not null,
	product_name_ar text not null,
	item_name text not null,
	sku text not null,
	size_g numeric(18, 3) not null,
	price numeric(14, 2) not null
) on commit drop;

insert into _ux_demo_items
select v.n, c.id,
	md5(x.workspace_id::text || ':uxdemo:product:' || v.n)::uuid,
	md5(x.workspace_id::text || ':uxdemo:item:' || v.n)::uuid,
	md5(x.workspace_id::text || ':uxdemo:size:' || v.n)::uuid,
	v.product_name, v.product_name_ar,
	v.item_name,
	'UXDEMO-FG-' || upper(substr(md5(x.workspace_id::text), 1, 8)) || '-' || lpad(v.n::text, 3, '0'),
	v.size_g, v.price
from _ux_demo_context x
cross join (values
	(1, 'spices', 'UXDEMO Saffron', 'منتج تجريبي 01', 'UXDEMO Saffron 10g', 10::numeric, 39.00::numeric),
	(2, 'spices', 'UXDEMO Paprika', 'منتج تجريبي 02', 'UXDEMO Paprika 100g', 100::numeric, 24.00::numeric),
	(3, 'herbs', 'UXDEMO Mint', 'منتج تجريبي 03', 'UXDEMO Mint 50g', 50::numeric, 18.00::numeric),
	(4, 'herbs', 'UXDEMO Thyme', 'منتج تجريبي 04', 'UXDEMO Thyme 100g', 100::numeric, 22.00::numeric),
	(5, 'blends', 'UXDEMO Ras el Hanout', 'منتج تجريبي 05', 'UXDEMO Ras el Hanout 100g', 100::numeric, 29.00::numeric),
	(6, 'pantry', 'UXDEMO Cumin', 'منتج تجريبي 06', 'UXDEMO Cumin 250g', 250::numeric, 32.00::numeric)
) as v(n, category_key, product_name, product_name_ar, item_name, size_g, price)
join _ux_demo_categories c on c.category_key = v.category_key;

insert into public.erp_products (id, workspace_id, category_id, name, name_ar)
select i.product_id, x.workspace_id, i.category_id, i.product_name, i.product_name_ar
from _ux_demo_items i
cross join _ux_demo_context x;

insert into public.inventory_items (
	id, workspace_id, sku, name, name_ar, item_type, base_unit, net_weight_g,
	reorder_point, sale_price_mad, track_lots
)
select i.item_id, x.workspace_id, i.sku, i.item_name, i.product_name_ar,
	'finished_good', 'each', i.size_g, 10, i.price, false
from _ux_demo_items i
cross join _ux_demo_context x;

insert into public.erp_product_sizes (
	id, workspace_id, product_id, inventory_item_id, size_g, sku, sale_price_mad
)
select i.size_id, x.workspace_id, i.product_id, i.item_id, i.size_g, i.sku, i.price
from _ux_demo_items i
cross join _ux_demo_context x;

create temporary table _ux_demo_orders (
	client_n integer not null,
	order_n integer not null,
	id uuid not null unique,
	document_number text not null,
	client_id uuid not null,
	status text not null,
	created_at timestamptz not null,
	primary key (client_n, order_n)
) on commit drop;

insert into _ux_demo_orders
select
	c.n, seq.order_n,
	md5(x.workspace_id::text || ':uxdemo:order:' || c.n || ':' || seq.order_n)::uuid,
	'UXDEMO-SO-' || lpad(c.n::text, 3, '0') || '-' || seq.order_n,
	c.id,
	case
		when seq.order_n <= 2 then 'delivered'
		when seq.order_n = 3 then case c.n % 6
			when 0 then 'part_delivered'
			when 1 then 'confirmed'
			when 2 then 'draft'
			when 3 then 'cancelled'
			when 4 then 'confirmed'
			else 'draft'
		end
		else case c.n % 4
			when 0 then 'confirmed'
			when 1 then 'part_delivered'
			when 2 then 'draft'
			else 'cancelled'
		end
	end,
	now() - case
		when c.n % 4 in (0, 1)
			then (60 + ((c.n * 5 + seq.order_n * 20) % 90)) * interval '1 day'
		else (5 + ((c.n * 5 + seq.order_n * 20) % 20)) * interval '1 day'
	end
from _ux_demo_clients c
cross join generate_series(1, 4) as seq(order_n)
cross join _ux_demo_context x;

insert into public.erp_sales_orders (
	id, workspace_id, document_number, client_id, client_name_snapshot, status,
	created_at, created_by, requested_delivery_date, priority, notes,
	confirmed_at, confirmed_by
)
select
	o.id, x.workspace_id, o.document_number, o.client_id, c.name, o.status,
	o.created_at, x.manager_id, (o.created_at + interval '2 days')::date,
	case when o.client_n % 7 = 0 then 'urgent' else 'normal' end,
	'UXDEMO: generated scenario for client-management testing.',
	case when o.status in ('confirmed', 'part_delivered', 'delivered')
		then o.created_at + interval '1 hour' else null end,
	case when o.status in ('confirmed', 'part_delivered', 'delivered')
		then x.manager_id else null end
from _ux_demo_orders o
join _ux_demo_clients c on c.n = o.client_n
cross join _ux_demo_context x;

create temporary table _ux_demo_order_lines (
	id uuid not null unique,
	order_id uuid not null,
	client_n integer not null,
	order_n integer not null,
	item_n integer not null,
	item_id uuid not null,
	sku text not null,
	item_name text not null,
	quantity integer not null,
	unit_price numeric(14, 2) not null,
	primary key (order_id, item_id)
) on commit drop;

insert into _ux_demo_order_lines
select
	md5(x.workspace_id::text || ':uxdemo:order-line:' || o.client_n || ':' || o.order_n || ':' || line_n)::uuid,
	o.id, o.client_n, o.order_n, i.n, i.item_id, i.sku, i.item_name,
	6 + ((o.client_n * o.order_n * line_n) % 13), i.price
from _ux_demo_orders o
cross join generate_series(1, 3) as lines(line_n)
cross join _ux_demo_context x
join _ux_demo_items i on i.n = ((o.client_n + o.order_n + line_n - 2) % 6) + 1;

insert into public.erp_sales_order_lines (
	id, workspace_id, order_id, item_id, sku_snapshot, name_snapshot, quantity, unit_price_mad
)
select l.id, x.workspace_id, l.order_id, l.item_id, l.sku, l.item_name, l.quantity, l.unit_price
from _ux_demo_order_lines l
cross join _ux_demo_context x;

create temporary table _ux_demo_deliveries (
	client_n integer not null,
	order_n integer not null,
	id uuid not null unique,
	document_number text not null,
	order_id uuid not null,
	client_id uuid not null,
	status text not null,
	created_at timestamptz not null,
	failure_reason text,
	primary key (client_n, order_n)
) on commit drop;

insert into _ux_demo_deliveries (
	client_n, order_n, id, document_number, order_id, client_id,
	status, created_at, failure_reason
)
select
	o.client_n, o.order_n,
	md5(x.workspace_id::text || ':uxdemo:delivery:' || o.client_n || ':' || o.order_n)::uuid,
	'UXDEMO-DN-' || lpad(o.client_n::text, 3, '0') || '-' || o.order_n,
	o.id, o.client_id, 'delivered', o.created_at + interval '1 day', null
from _ux_demo_orders o
cross join _ux_demo_context x
where o.status in ('delivered', 'part_delivered');

insert into _ux_demo_deliveries (
	client_n, order_n, id, document_number, order_id, client_id,
	status, created_at, failure_reason
)
select
	o.client_n, o.order_n,
	md5(x.workspace_id::text || ':uxdemo:delivery:' || o.client_n || ':' || o.order_n)::uuid,
	'UXDEMO-DN-' || lpad(o.client_n::text, 3, '0') || '-' || o.order_n,
	o.id, o.client_id,
	case o.client_n % 3
		when 0 then 'dispatched'
		when 1 then 'ready'
		else 'failed'
	end,
	o.created_at + interval '1 day',
	case when o.client_n % 3 = 2 then 'UXDEMO: delivery attempt failed; retry required.' end
from _ux_demo_orders o
cross join _ux_demo_context x
where o.order_n = 4 and o.status = 'confirmed';

insert into public.erp_delivery_notes (
	id, workspace_id, document_number, order_id, client_id, client_name_snapshot,
	status, dispatched_at, delivered_at, created_at, created_by, failure_reason
)
select
	d.id, x.workspace_id, d.document_number, d.order_id, d.client_id, c.name,
	d.status,
	case when d.status = 'ready' then null else d.created_at end,
	case when d.status = 'delivered' then d.created_at + interval '1 day' end,
	d.created_at, x.manager_id, d.failure_reason
from _ux_demo_deliveries d
join _ux_demo_clients c on c.n = d.client_n
cross join _ux_demo_context x;

create temporary table _ux_demo_delivery_lines (
	id uuid not null unique,
	delivery_id uuid not null,
	client_n integer not null,
	order_n integer not null,
	item_n integer not null,
	order_line_id uuid not null,
	item_id uuid not null,
	sku text not null,
	item_name text not null,
	quantity integer not null,
	unit_price numeric(14, 2) not null,
	primary key (delivery_id, order_line_id)
) on commit drop;

insert into _ux_demo_delivery_lines
select
	md5(x.workspace_id::text || ':uxdemo:delivery-line:' || l.client_n || ':' || l.order_n || ':' || l.item_n)::uuid,
	d.id, l.client_n, l.order_n, l.item_n, l.id, l.item_id, l.sku, l.item_name,
	case when o.status = 'part_delivered' then greatest(1, ceil(l.quantity / 2.0)::integer) else l.quantity end,
	l.unit_price
from _ux_demo_deliveries d
join _ux_demo_orders o using (client_n, order_n)
join _ux_demo_order_lines l using (client_n, order_n)
cross join _ux_demo_context x
where d.status = 'delivered'
	or l.item_n = (
		select min(first_line.item_n)
		from _ux_demo_order_lines first_line
		where first_line.client_n = d.client_n and first_line.order_n = d.order_n
	);

insert into public.erp_delivery_note_lines (
	id, workspace_id, delivery_note_id, order_line_id, item_id,
	sku_snapshot, name_snapshot, quantity, unit_price_mad
)
select l.id, x.workspace_id, l.delivery_id, l.order_line_id, l.item_id,
	l.sku, l.item_name, l.quantity, l.unit_price
from _ux_demo_delivery_lines l
cross join _ux_demo_context x;

create temporary table _ux_demo_invoices (
	client_n integer not null,
	order_n integer not null,
	id uuid not null unique,
	document_number text not null,
	delivery_id uuid not null unique,
	client_id uuid not null,
	total numeric(14, 2) not null,
	issued_at timestamptz not null,
	due_date date not null,
	primary key (client_n, order_n)
) on commit drop;

insert into _ux_demo_invoices
select
	d.client_n, d.order_n,
	md5(x.workspace_id::text || ':uxdemo:invoice:' || d.client_n || ':' || d.order_n)::uuid,
	'UXDEMO-INV-' || lpad(d.client_n::text, 3, '0') || '-' || d.order_n,
	d.id, d.client_id,
	sum(l.quantity * l.unit_price)::numeric(14, 2),
	d.created_at + interval '1 day',
	((d.created_at + interval '1 day') + interval '30 days')::date
from _ux_demo_deliveries d
join _ux_demo_delivery_lines l using (client_n, order_n)
cross join _ux_demo_context x
where d.status = 'delivered'
group by x.workspace_id, d.client_n, d.order_n, d.id, d.client_id, d.created_at;

insert into public.erp_invoices (
	id, workspace_id, document_number, delivery_note_id, client_id,
	client_name_snapshot, subtotal_mad, tax_mad, total_mad, issued_at, created_at,
	created_by, idempotency_key, due_date, tax_rate_percent
)
select
	i.id, x.workspace_id, i.document_number, i.delivery_id, i.client_id,
	c.name, i.total, 0, i.total, i.issued_at, i.issued_at, x.manager_id,
	md5(x.workspace_id::text || ':uxdemo:invoice-key:' || i.client_n || ':' || i.order_n)::uuid,
	i.due_date, 0
from _ux_demo_invoices i
join _ux_demo_clients c on c.n = i.client_n
cross join _ux_demo_context x;

insert into public.erp_invoice_adjustments (
	id, workspace_id, invoice_id, client_id, kind, amount_mad,
	description, idempotency_key, created_by
)
select
	md5(x.workspace_id::text || ':uxdemo:discount:' || i.client_n)::uuid,
	x.workspace_id, i.id, i.client_id, 'discount', -15.00,
	'UXDEMO: sample account discount.',
	md5(x.workspace_id::text || ':uxdemo:discount-key:' || i.client_n)::uuid,
	x.manager_id
from _ux_demo_invoices i
cross join _ux_demo_context x
where i.order_n = 1 and i.client_n % 7 = 0;

insert into public.erp_invoice_adjustments (
	id, workspace_id, invoice_id, client_id, kind, amount_mad,
	description, idempotency_key, created_by
)
select
	md5(x.workspace_id::text || ':uxdemo:return-credit:' || i.client_n)::uuid,
	x.workspace_id, i.id, i.client_id, 'return_credit', -15.00,
	'UXDEMO: credit for returned items; sample account credit.',
	md5(x.workspace_id::text || ':uxdemo:return-credit-key:' || i.client_n)::uuid,
	x.manager_id
from _ux_demo_invoices i
cross join _ux_demo_context x
where i.order_n = 1 and i.client_n % 10 = 5;

insert into public.erp_external_returns (
	id, workspace_id, client_id, invoice_id, item_id, description,
	quantity, unit_value_mad, credit_mad, restocked, adjustment_id,
	idempotency_key, created_by
)
select
	md5(x.workspace_id::text || ':uxdemo:external-return:' || i.client_n)::uuid,
	x.workspace_id, i.client_id, i.id, l.item_id,
	'UXDEMO: sample external packaging return; not restocked.',
	1, 15.00, 15.00, false,
	md5(x.workspace_id::text || ':uxdemo:return-credit:' || i.client_n)::uuid,
	md5(x.workspace_id::text || ':uxdemo:external-return-key:' || i.client_n)::uuid,
	x.manager_id
from _ux_demo_invoices i
join _ux_demo_order_lines l
	on l.client_n = i.client_n and l.order_n = i.order_n
cross join _ux_demo_context x
where i.order_n = 1 and i.client_n % 10 = 5
	and l.item_n = (
		select min(first_line.item_n)
		from _ux_demo_order_lines first_line
		where first_line.client_n = i.client_n and first_line.order_n = i.order_n
	);

insert into public.erp_invoice_adjustments (
	id, workspace_id, invoice_id, client_id, kind, amount_mad,
	description, idempotency_key, created_by
)
select
	md5(x.workspace_id::text || ':uxdemo:correction:' || i.client_n)::uuid,
	x.workspace_id, i.id, i.client_id, 'correction', -7.50,
	'UXDEMO: sample invoice correction.',
	md5(x.workspace_id::text || ':uxdemo:correction-key:' || i.client_n)::uuid,
	x.manager_id
from _ux_demo_invoices i
cross join _ux_demo_context x
where i.order_n = 2 and i.client_n % 11 = 0;

insert into public.erp_invoice_adjustments (
	id, workspace_id, invoice_id, client_id, kind, amount_mad,
	description, idempotency_key, created_by
)
select
	md5(x.workspace_id::text || ':uxdemo:refund:' || i.client_n)::uuid,
	x.workspace_id, i.id, i.client_id, 'refund', 10.00,
	'UXDEMO: partial refund against a historical overpayment scenario.',
	md5(x.workspace_id::text || ':uxdemo:refund-key:' || i.client_n)::uuid,
	x.manager_id
from _ux_demo_invoices i
cross join _ux_demo_context x
where i.client_n = 10 and i.order_n = 1;

insert into public.erp_payments (
	id, workspace_id, invoice_id, amount_mad, payment_method, paid_at,
	reference, created_by, idempotency_key
)
select
	md5(x.workspace_id::text || ':uxdemo:payment:' || i.client_n || ':' || i.order_n)::uuid,
	x.workspace_id, i.id,
	case
		when i.client_n = 10 and i.order_n = 1 then i.total + 25.00
		else round(i.total * case i.client_n % 5
			when 0 then 1.00
			when 1 then 0.50
			when 2 then 0.00
			when 3 then 0.75
			else 0.25
		end, 2)
	end,
	case i.client_n % 4
		when 0 then 'cash'
		when 1 then 'bank_transfer'
		when 2 then 'card'
		else 'cheque'
	end,
	i.issued_at + interval '5 days',
	'UXDEMO payment ' || i.client_n || '-' || i.order_n,
	x.manager_id,
	md5(x.workspace_id::text || ':uxdemo:payment-key:' || i.client_n || ':' || i.order_n)::uuid
from _ux_demo_invoices i
cross join _ux_demo_context x
where i.total > 0 and i.client_n % 5 <> 2;

insert into public.erp_client_notes (
	id, workspace_id, client_id, invoice_id, kind, note, promised_date,
	is_resolved, resolved_at, idempotency_key, created_at, created_by
)
select
	md5(x.workspace_id::text || ':uxdemo:note:' || c.n || ':' || note_n)::uuid,
	x.workspace_id, c.id,
	case when note_n = 2 then (
		select i.id from _ux_demo_invoices i
		where i.client_n = c.n and i.order_n = 1
	) else null end,
	case
		when note_n = 1 then 'note'
		when note_n = 2 and c.n % 4 in (0, 1, 2) then 'promise_to_pay'
		when note_n = 2 then 'call'
		else 'visit'
	end,
	case
		when note_n = 1 then 'UXDEMO: preferred delivery window and storefront access details.'
		when note_n = 2 and c.n % 4 in (0, 1, 2) then 'UXDEMO: client discussed settling the outstanding balance.'
		when note_n = 2 then 'UXDEMO: follow-up call about the latest order.'
		else 'UXDEMO: routine storefront visit and assortment review.'
	end,
	case
		when note_n = 2 and c.n % 4 = 0 then current_date - 2
		when note_n = 2 and c.n % 4 = 1 then current_date - 5
		when note_n = 2 and c.n % 4 = 2 then current_date + 7
	end,
	note_n = 2 and c.n % 4 = 0,
	case when note_n = 2 and c.n % 4 = 0 then now() - interval '2 days' end,
	md5(x.workspace_id::text || ':uxdemo:note-key:' || c.n || ':' || note_n)::uuid,
	now() - ((c.n * 7 + note_n * 13) % 150) * interval '1 day',
	x.manager_id
from _ux_demo_clients c
cross join generate_series(1, 3) as notes(note_n)
cross join _ux_demo_context x
where note_n < 3 or c.n % 4 = 3;

insert into public.erp_customer_returns (
	id, workspace_id, document_number, delivery_note_id, client_id,
	client_name_snapshot, reason, status, created_at, created_by,
	idempotency_key, resolution_note
)
select
	md5(x.workspace_id::text || ':uxdemo:return:' || d.client_n)::uuid,
	x.workspace_id,
	'UXDEMO-RET-' || lpad(d.client_n::text, 3, '0'),
	d.id, d.client_id, c.name,
	'UXDEMO: sample packaging-condition return; no stock is credited.',
	case d.client_n % 3
		when 0 then 'rejected'
		when 1 then 'inspection'
		else 'requested'
	end,
	d.created_at + interval '3 days', x.manager_id,
	md5(x.workspace_id::text || ':uxdemo:return-key:' || d.client_n)::uuid,
	''
from _ux_demo_deliveries d
join _ux_demo_clients c on c.n = d.client_n
cross join _ux_demo_context x
where d.order_n = 1 and d.client_n % 5 = 0;

insert into public.erp_customer_return_lines (
	id, workspace_id, return_id, delivery_line_id, item_id, quantity
)
select
	md5(x.workspace_id::text || ':uxdemo:return-line:' || l.client_n)::uuid,
	x.workspace_id,
	md5(x.workspace_id::text || ':uxdemo:return:' || l.client_n)::uuid,
	l.id, l.item_id, 1
from _ux_demo_delivery_lines l
cross join _ux_demo_context x
where l.order_n = 1 and l.client_n % 5 = 0
	and l.item_n = (
		select min(first_line.item_n)
		from _ux_demo_delivery_lines first_line
		where first_line.client_n = l.client_n and first_line.order_n = l.order_n
	);

insert into public.erp_return_dispositions (
	workspace_id, return_id, item_id, quantity, disposition, note, created_by
)
select
	x.workspace_id, r.id, rl.item_id, rl.quantity,
	'rejected', 'UXDEMO: sample return rejected after inspection.', x.manager_id
from public.erp_customer_returns r
join public.erp_customer_return_lines rl on rl.return_id = r.id
cross join _ux_demo_context x
where r.workspace_id = x.workspace_id
	and r.document_number like 'UXDEMO-RET-%'
	and r.status = 'rejected';

insert into public.erp_customer_invites (
	workspace_id, client_id, email, token_hash, expires_at, revoked_at, created_by
)
select
	x.workspace_id, c.id,
	'uxdemo.client.' || lpad(c.n::text, 3, '0') || '@example.invalid',
	md5(x.workspace_id::text || ':uxdemo:invite:' || c.n)
		|| md5(x.workspace_id::text || ':uxdemo:invite:' || c.n || ':second-half'),
	case when c.n = 20 then now() - interval '1 day' else now() + interval '90 days' end,
	case when c.n = 28 then now() - interval '1 day' end,
	x.manager_id
from _ux_demo_clients c
cross join _ux_demo_context x
where c.n in (4, 12, 20, 28);

do $$
declare
	v_workspace_id uuid;
begin
	select workspace_id into v_workspace_id from _ux_demo_context;

	if (select count(*) from public.erp_clients
		where workspace_id = v_workspace_id and code like 'UXDEMO-C-%') <> 32
		or (select count(*) from public.erp_sales_orders
			where workspace_id = v_workspace_id and document_number like 'UXDEMO-SO-%') <> 128
		or (select count(distinct status) from public.erp_sales_orders
			where workspace_id = v_workspace_id and document_number like 'UXDEMO-SO-%') <> 5
		or (select count(*) from public.erp_sales_order_lines
			where workspace_id = v_workspace_id
				and order_id in (select id from public.erp_sales_orders
					where workspace_id = v_workspace_id and document_number like 'UXDEMO-SO-%')) <> 384
		or (select count(*) from public.erp_delivery_notes
			where workspace_id = v_workspace_id and document_number like 'UXDEMO-DN-%') <> 85
		or (select count(*) from public.erp_delivery_notes
			where workspace_id = v_workspace_id and document_number like 'UXDEMO-DN-%'
				and status = 'ready') <> 3
		or (select count(*) from public.erp_delivery_notes
			where workspace_id = v_workspace_id and document_number like 'UXDEMO-DN-%'
				and status = 'dispatched') <> 2
		or (select count(*) from public.erp_delivery_notes
			where workspace_id = v_workspace_id and document_number like 'UXDEMO-DN-%'
				and status = 'failed') <> 3
		or (select count(*) from public.erp_delivery_notes
			where workspace_id = v_workspace_id and document_number like 'UXDEMO-DN-%'
				and status = 'delivered') <> 77
		or (select count(*) from public.erp_invoices
			where workspace_id = v_workspace_id and document_number like 'UXDEMO-INV-%') <> 77
		or (select count(*) from public.erp_client_notes
			where workspace_id = v_workspace_id
				and client_id in (select id from public.erp_clients
					where workspace_id = v_workspace_id and code like 'UXDEMO-C-%')) <> 72
		or (select count(*) from public.erp_client_notes
			where workspace_id = v_workspace_id and kind = 'promise_to_pay'
				and promised_date < current_date and not is_resolved
				and note like 'UXDEMO:%') <> 8
		or (select count(*) from public.erp_client_notes
			where workspace_id = v_workspace_id and kind = 'promise_to_pay'
				and promised_date > current_date and not is_resolved
				and note like 'UXDEMO:%') <> 8
		or (select count(*) from public.erp_client_notes
			where workspace_id = v_workspace_id and kind = 'promise_to_pay'
				and is_resolved and note like 'UXDEMO:%') <> 8
		or (select count(*) from public.erp_client_notes
			where workspace_id = v_workspace_id and kind = 'call'
				and note like 'UXDEMO:%') <> 8
		or (select count(*) from public.erp_client_notes
			where workspace_id = v_workspace_id and kind = 'visit'
				and note like 'UXDEMO:%') <> 8
		or (select count(*) from public.erp_client_notes
			where workspace_id = v_workspace_id and kind = 'note'
				and note like 'UXDEMO:%') <> 32
		or (select count(*) from public.erp_customer_returns
			where workspace_id = v_workspace_id and document_number like 'UXDEMO-RET-%') <> 6
		or (select count(*) from public.erp_customer_returns
			where workspace_id = v_workspace_id and document_number like 'UXDEMO-RET-%'
				and status = 'requested') <> 2
		or (select count(*) from public.erp_customer_returns
			where workspace_id = v_workspace_id and document_number like 'UXDEMO-RET-%'
				and status = 'inspection') <> 2
		or (select count(*) from public.erp_customer_returns
			where workspace_id = v_workspace_id and document_number like 'UXDEMO-RET-%'
				and status = 'rejected') <> 2
		or (select count(*) from public.erp_customer_invites
			where workspace_id = v_workspace_id
				and email like 'uxdemo.client.%@example.invalid') <> 4
		or (select count(*) from public.erp_customer_invites
			where workspace_id = v_workspace_id
				and email like 'uxdemo.client.%@example.invalid'
				and revoked_at is null and expires_at > now()) <> 2
		or (select count(*) from public.erp_customer_invites
			where workspace_id = v_workspace_id
				and email like 'uxdemo.client.%@example.invalid'
				and revoked_at is null and expires_at <= now()) <> 1
		or (select count(*) from public.erp_customer_invites
			where workspace_id = v_workspace_id
				and email like 'uxdemo.client.%@example.invalid'
				and revoked_at is not null) <> 1
		or not exists (
			select 1
			from public.erp_invoices i
			left join lateral (
				select coalesce(sum(p.amount_mad), 0) as paid
				from public.erp_payments p where p.invoice_id = i.id
			) p on true
			left join lateral (
				select coalesce(sum(a.amount_mad), 0) as adjusted
				from public.erp_invoice_adjustments a where a.invoice_id = i.id
			) a on true
			where i.workspace_id = v_workspace_id
				and i.document_number like 'UXDEMO-INV-%'
				and p.paid > 0 and i.total_mad + a.adjusted - p.paid > 0
		)
		or not exists (
			select 1
			from public.erp_invoices i
			left join lateral (
				select coalesce(sum(p.amount_mad), 0) as paid
				from public.erp_payments p where p.invoice_id = i.id
			) p on true
			left join lateral (
				select coalesce(sum(a.amount_mad), 0) as adjusted
				from public.erp_invoice_adjustments a where a.invoice_id = i.id
			) a on true
			where i.workspace_id = v_workspace_id
				and i.document_number like 'UXDEMO-INV-%'
				and p.paid = 0
		)
		or not exists (
			select 1
			from public.erp_invoices i
			left join lateral (
				select coalesce(sum(p.amount_mad), 0) as paid
				from public.erp_payments p where p.invoice_id = i.id
			) p on true
			left join lateral (
				select coalesce(sum(a.amount_mad), 0) as adjusted
				from public.erp_invoice_adjustments a where a.invoice_id = i.id
			) a on true
			where i.workspace_id = v_workspace_id
				and i.document_number like 'UXDEMO-INV-%'
				and p.paid > i.total_mad + a.adjusted
		)
		or (select count(*) from public.erp_invoice_adjustments
			where workspace_id = v_workspace_id and kind = 'return_credit'
				and description like 'UXDEMO:%') <> 3
		or (select count(*) from public.erp_invoice_adjustments
			where workspace_id = v_workspace_id and kind = 'discount'
				and description like 'UXDEMO:%') <> 4
		or (select count(*) from public.erp_invoice_adjustments
			where workspace_id = v_workspace_id and kind = 'correction'
				and description like 'UXDEMO:%') <> 2
		or (select count(*) from public.erp_invoice_adjustments
			where workspace_id = v_workspace_id and kind = 'refund'
				and description like 'UXDEMO:%') <> 1
		or (select count(*) from public.erp_external_returns
			where workspace_id = v_workspace_id
				and description like 'UXDEMO:%' and not restocked) <> 3
	then
		raise exception 'Demo seed verification failed; transaction will be rolled back.';
	end if;
end;
$$;

commit;
