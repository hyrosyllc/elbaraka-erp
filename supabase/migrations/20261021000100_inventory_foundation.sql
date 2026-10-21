create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (sku = upper(btrim(sku)) and length(sku) > 0),
  name text not null check (length(btrim(name)) > 0),
  item_type text not null check (item_type in ('raw_material', 'packaging', 'blend', 'finished_good')),
  base_unit text not null check (base_unit in ('g', 'each')),
  net_weight_g numeric(18, 3),
  track_lots boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_items_type_unit_check check (
    (item_type in ('raw_material', 'blend') and base_unit = 'g' and net_weight_g is null)
    or (item_type = 'packaging' and base_unit = 'each' and net_weight_g is null)
    or (item_type = 'finished_good' and base_unit = 'each' and net_weight_g > 0)
  )
);

create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(btrim(code)) and length(code) > 0),
  name text not null check (length(btrim(name)) > 0),
  location_type text not null check (
    location_type in ('warehouse', 'production', 'quarantine', 'transit', 'customer')
  ),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  lot_code text not null check (length(btrim(lot_code)) > 0),
  supplier_lot_code text,
  expires_on date,
  lot_status text not null default 'available' check (
    lot_status in ('available', 'quarantined', 'expired', 'closed')
  ),
  created_at timestamptz not null default now(),
  unique (item_id, lot_code),
  unique (item_id, id)
);

create table public.inventory_recipes (
  id uuid primary key default gen_random_uuid(),
  output_item_id uuid not null references public.inventory_items(id) on delete restrict,
  version integer not null check (version > 0),
  output_quantity numeric(18, 3) not null check (output_quantity > 0),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (output_item_id, version),
  constraint inventory_recipes_approval_check check (
    (status = 'approved' and approved_by is not null and approved_at is not null)
    or (status = 'draft' and approved_by is null and approved_at is null)
  )
);

create table public.inventory_recipe_components (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.inventory_recipes(id) on delete restrict,
  input_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity numeric(18, 3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (recipe_id, input_item_id)
);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  lot_id uuid,
  quantity numeric(18, 3) not null check (quantity > 0),
  source_type text not null check (length(btrim(source_type)) > 0),
  source_id uuid not null,
  status text not null default 'active' check (status in ('active', 'released', 'consumed')),
  idempotency_key uuid not null unique,
  reserved_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  foreign key (item_id, lot_id)
    references public.inventory_lots(item_id, id) on delete restrict,
  constraint inventory_reservations_status_check check (
    (status = 'active' and closed_at is null)
    or (status in ('released', 'consumed') and closed_at is not null)
  )
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  lot_id uuid,
  movement_type text not null check (
    movement_type in (
      'opening_balance',
      'purchase_receipt',
      'production_output',
      'production_consumption',
      'shipment',
      'customer_return',
      'supplier_return',
      'adjustment',
      'transfer_in',
      'transfer_out'
    )
  ),
  quantity_delta numeric(18, 3) not null check (quantity_delta <> 0),
  reference_type text not null check (length(btrim(reference_type)) > 0),
  reference_id uuid not null,
  idempotency_key uuid not null unique,
  recorded_by uuid references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  foreign key (item_id, lot_id)
    references public.inventory_lots(item_id, id) on delete restrict,
  constraint inventory_movements_direction_check check (
    (movement_type in ('opening_balance', 'purchase_receipt', 'production_output', 'customer_return', 'transfer_in') and quantity_delta > 0)
    or (movement_type in ('production_consumption', 'shipment', 'supplier_return', 'transfer_out') and quantity_delta < 0)
    or movement_type = 'adjustment'
  )
);

create index inventory_items_type_active_idx
  on public.inventory_items (item_type, is_active, name);

create index inventory_lots_item_status_idx
  on public.inventory_lots (item_id, lot_status, expires_on);

create index inventory_recipes_output_status_idx
  on public.inventory_recipes (output_item_id, status, version desc);

create index inventory_recipe_components_item_idx
  on public.inventory_recipe_components (input_item_id);

create index inventory_reservations_available_idx
  on public.inventory_reservations (item_id, location_id, status)
  where status = 'active';

create index inventory_reservations_source_idx
  on public.inventory_reservations (source_type, source_id);

create index inventory_movements_item_location_time_idx
  on public.inventory_movements (item_id, location_id, recorded_at desc);

create index inventory_movements_lot_idx
  on public.inventory_movements (lot_id) where lot_id is not null;

create function public.prevent_inventory_movement_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Inventory movements cannot be changed or deleted';
end;
$$;

create trigger inventory_movements_immutable
  before update or delete on public.inventory_movements
  for each row execute function public.prevent_inventory_movement_mutation();

create function public.prevent_approved_recipe_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'approved' then
    raise exception 'Approved recipes cannot be changed or deleted';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger inventory_recipes_immutable_when_approved
  before update or delete on public.inventory_recipes
  for each row execute function public.prevent_approved_recipe_mutation();

create function public.prevent_approved_recipe_component_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_recipe_ids uuid[];
  recipe_row record;
begin
  if tg_op = 'DELETE' then
    affected_recipe_ids := array[old.recipe_id];
  elsif tg_op = 'UPDATE' then
    affected_recipe_ids := array[old.recipe_id, new.recipe_id];
  else
    affected_recipe_ids := array[new.recipe_id];
  end if;

  for recipe_row in
    select id, status
    from public.inventory_recipes
    where id = any(affected_recipe_ids)
    order by id
    for update
  loop
    if recipe_row.status = 'approved' then
      raise exception 'Components of approved recipes cannot be changed or deleted';
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger inventory_recipe_components_immutable_when_approved
  before insert or update or delete on public.inventory_recipe_components
  for each row execute function public.prevent_approved_recipe_component_mutation();

alter table public.inventory_items enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.inventory_recipes enable row level security;
alter table public.inventory_recipe_components enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.inventory_movements enable row level security;
