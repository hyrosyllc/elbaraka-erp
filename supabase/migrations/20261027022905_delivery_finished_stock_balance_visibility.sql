drop policy "authenticated workspace member read" on public.inventory_movements;

create policy "authenticated workspace member read"
	on public.inventory_movements
	for select to authenticated
	using (
		workspace_id in (
			select workspace_id
			from public.erp_workspace_memberships
			where user_id = (select auth.uid())
				and is_active
				and role_code in ('manager', 'purchasing')
		)
		or (
			item_id in (
				select id
				from public.inventory_items
				where item_type = 'finished_good'
			)
			and workspace_id in (
				select workspace_id
				from public.erp_workspace_memberships
				where user_id = (select auth.uid())
					and is_active
					and role_code = 'delivery'
			)
		)
	);

create view public.inventory_location_stock_balances
with (security_invoker = true)
as
with movement_balances as (
	select workspace_id, item_id, location_id, sum(quantity_delta)::numeric(18, 3) as on_hand
	from public.inventory_movements
	group by workspace_id, item_id, location_id
),
reservation_balances as (
	select workspace_id, item_id, location_id, sum(quantity)::numeric(18, 3) as reserved
	from public.inventory_reservations
	where status = 'active'
	group by workspace_id, item_id, location_id
),
quarantined_balances as (
	select m.workspace_id, m.item_id, m.location_id, sum(m.quantity_delta)::numeric(18, 3) as quarantined
	from public.inventory_movements m
	join public.inventory_lots l
		on l.workspace_id = m.workspace_id
		and l.item_id = m.item_id
		and l.id = m.lot_id
	where l.lot_status = 'quarantined'
	group by m.workspace_id, m.item_id, m.location_id
),
balance_keys as (
	select workspace_id, item_id, location_id from movement_balances
	union
	select workspace_id, item_id, location_id from reservation_balances
),
item_without_balance as (
	select i.workspace_id, i.id as item_id, null::uuid as location_id
	from public.inventory_items i
	where not exists (
		select 1
		from balance_keys b
		where b.workspace_id = i.workspace_id
			and b.item_id = i.id
	)
),
all_balance_keys as (
	select workspace_id, item_id, location_id from balance_keys
	union
	select workspace_id, item_id, location_id from item_without_balance
)
select
	i.workspace_id,
	i.id as item_id,
	i.sku,
	i.name,
	i.item_type,
	i.base_unit,
	i.reorder_point,
	i.is_active,
	k.location_id,
	l.name as location_name,
	l.location_type,
	coalesce(m.on_hand, 0)::numeric(18, 3) as on_hand,
	coalesce(r.reserved, 0)::numeric(18, 3) as reserved,
	coalesce(q.quarantined, 0)::numeric(18, 3) as quarantined,
	(
		coalesce(m.on_hand, 0)
		- coalesce(r.reserved, 0)
		- coalesce(q.quarantined, 0)
	)::numeric(18, 3) as available
from all_balance_keys k
join public.inventory_items i
	on i.workspace_id = k.workspace_id
	and i.id = k.item_id
left join movement_balances m
	on m.workspace_id = k.workspace_id
	and m.item_id = k.item_id
	and m.location_id is not distinct from k.location_id
left join reservation_balances r
	on r.workspace_id = k.workspace_id
	and r.item_id = k.item_id
	and r.location_id is not distinct from k.location_id
left join quarantined_balances q
	on q.workspace_id = k.workspace_id
	and q.item_id = k.item_id
	and q.location_id is not distinct from k.location_id
left join public.inventory_locations l
	on l.workspace_id = k.workspace_id
	and l.id = k.location_id;

revoke all privileges on table public.inventory_location_stock_balances from public, anon, authenticated;
grant select on table public.inventory_location_stock_balances to authenticated;