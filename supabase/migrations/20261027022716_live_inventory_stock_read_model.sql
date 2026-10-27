create view public.inventory_stock_balances
with (security_invoker = true)
as
with movement_balances as (
	select workspace_id, item_id, sum(quantity_delta)::numeric(18, 3) as on_hand
	from public.inventory_movements
	group by workspace_id, item_id
),
reservation_balances as (
	select workspace_id, item_id, sum(quantity)::numeric(18, 3) as reserved
	from public.inventory_reservations
	where status = 'active'
	group by workspace_id, item_id
),
quarantined_balances as (
	select m.workspace_id, m.item_id, sum(m.quantity_delta)::numeric(18, 3) as quarantined
	from public.inventory_movements m
	join public.inventory_lots l
		on l.workspace_id = m.workspace_id
		and l.item_id = m.item_id
		and l.id = m.lot_id
	where l.lot_status = 'quarantined'
	group by m.workspace_id, m.item_id
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
	coalesce(m.on_hand, 0)::numeric(18, 3) as on_hand,
	coalesce(r.reserved, 0)::numeric(18, 3) as reserved,
	coalesce(q.quarantined, 0)::numeric(18, 3) as quarantined,
	(
		coalesce(m.on_hand, 0)
		- coalesce(r.reserved, 0)
		- coalesce(q.quarantined, 0)
	)::numeric(18, 3) as available
from public.inventory_items i
left join movement_balances m
	on m.workspace_id = i.workspace_id
	and m.item_id = i.id
left join reservation_balances r
	on r.workspace_id = i.workspace_id
	and r.item_id = i.id
left join quarantined_balances q
	on q.workspace_id = i.workspace_id
	and q.item_id = i.id;

revoke all privileges on table public.inventory_stock_balances from public, anon, authenticated;
grant select on table public.inventory_stock_balances to authenticated;