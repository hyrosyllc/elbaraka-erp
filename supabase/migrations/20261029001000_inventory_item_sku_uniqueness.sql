create unique index if not exists inventory_items_workspace_sku_idx
    on public.inventory_items (workspace_id, sku);
