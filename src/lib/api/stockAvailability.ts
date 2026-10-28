import type { getSupabaseServerClient } from '@/lib/supabase/server';

type Db = Awaited<ReturnType<typeof getSupabaseServerClient>>;

export type RawGap = { itemId: string; sku: string; name: string; required: number; available: number; missing: number };
export type ProductionState = 'none' | 'producible' | 'no_recipe' | 'raw_short';
export type ItemAvailability = {
  available: number;
  outputQuantity: number | null;
  components: { itemId: string; sku: string; name: string; perBatch: number; available: number }[];
};

export type OrderProduct = {
  sizeId: string;
  itemId: string | null;
  sku: string;
  name: string;
  priceMad: number;
  available: number;
  stock: 'in_stock' | 'out_of_stock' | 'not_linked';
  production: ProductionState;
  rawGaps: RawGap[];
};

const num = (value: unknown) => Number(value ?? 0) || 0;

// Free stock per item: on hand minus reservations and quarantine, summed over locations.
async function availableByItem(supabase: Db, workspaceId: string, itemIds: string[]) {
  const result = new Map<string, number>();
  if (itemIds.length === 0) return result;
  const { data, error } = await supabase
    .from('inventory_location_stock_balances')
    .select('item_id, location_type, available')
    .eq('workspace_id', workspaceId)
    .in('item_id', itemIds);
  if (error) throw new Error('stock_balances_unavailable');
  for (const row of data ?? []) {
    if (row.location_type === 'customer' || row.location_type === 'transit') continue;
    result.set(row.item_id, (result.get(row.item_id) ?? 0) + num(row.available));
  }
  return result;
}

export async function loadItemAvailability(supabase: Db, workspaceId: string, finishedItemIds: string[]) {
  const ids = [...new Set(finishedItemIds)];
  const finished = await availableByItem(supabase, workspaceId, ids);
  const map = new Map<string, ItemAvailability>();
  for (const id of ids) map.set(id, { available: finished.get(id) ?? 0, outputQuantity: null, components: [] });
  if (ids.length === 0) return map;

  const recipes = await supabase
    .from('inventory_recipes')
    .select('id, output_item_id, version, output_quantity')
    .eq('workspace_id', workspaceId)
    .eq('status', 'approved')
    .in('output_item_id', ids)
    .order('version', { ascending: false });
  if (recipes.error) throw new Error('recipes_unavailable');
  const latest = new Map<string, { id: string; output_quantity: number | string }>();
  for (const recipe of recipes.data ?? []) if (!latest.has(recipe.output_item_id)) latest.set(recipe.output_item_id, recipe);
  if (latest.size === 0) return map;

  const components = await supabase
    .from('inventory_recipe_components')
    .select('recipe_id, input_item_id, quantity')
    .in('recipe_id', [...latest.values()].map((recipe) => recipe.id));
  if (components.error) throw new Error('recipes_unavailable');
  const inputIds = [...new Set((components.data ?? []).map((component) => component.input_item_id))];
  const [rawAvailable, items] = await Promise.all([
    availableByItem(supabase, workspaceId, inputIds),
    inputIds.length
      ? supabase.from('inventory_items').select('id, sku, name').eq('workspace_id', workspaceId).in('id', inputIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (items.error) throw new Error('recipes_unavailable');
  const itemById = new Map((items.data ?? []).map((item) => [item.id, item]));

  for (const [outputId, recipe] of latest) {
    const entry = map.get(outputId);
    if (!entry) continue;
    entry.outputQuantity = num(recipe.output_quantity);
    entry.components = (components.data ?? [])
      .filter((component) => component.recipe_id === recipe.id)
      .map((component) => ({
        itemId: component.input_item_id,
        sku: itemById.get(component.input_item_id)?.sku ?? '',
        name: itemById.get(component.input_item_id)?.name ?? '',
        perBatch: num(component.quantity),
        available: rawAvailable.get(component.input_item_id) ?? 0,
      }));
  }
  return map;
}

// Raw materials still missing to make `units` more of a finished item.
export function rawGapsFor(entry: ItemAvailability | undefined, units: number): { state: ProductionState; gaps: RawGap[] } {
  if (!entry || !entry.outputQuantity || entry.components.length === 0) return { state: 'no_recipe', gaps: [] };
  const batches = Math.max(1, Math.ceil(units / entry.outputQuantity));
  const gaps = entry.components
    .map((component) => {
      const required = component.perBatch * batches;
      return {
        itemId: component.itemId, sku: component.sku, name: component.name,
        required, available: component.available, missing: Math.max(0, Math.round((required - component.available) * 1000) / 1000),
      };
    })
    .filter((gap) => gap.missing > 0);
  return { state: gaps.length > 0 ? 'raw_short' : 'producible', gaps };
}

export async function loadOrderProducts(supabase: Db, workspaceId: string): Promise<OrderProduct[]> {
  const sizes = await supabase
    .from('erp_product_sizes')
    .select('id, product_id, size_g, sku, sale_price_mad, inventory_item_id')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .not('sale_price_mad', 'is', null);
  if (sizes.error) throw new Error('sizes_unavailable');
  const rows = sizes.data ?? [];
  if (rows.length === 0) return [];

  const [products, items] = await Promise.all([
    supabase.from('erp_products').select('id, name, name_ar, is_active').eq('workspace_id', workspaceId).in('id', [...new Set(rows.map((row) => row.product_id))]),
    supabase.from('inventory_items').select('id, sku, name').eq('workspace_id', workspaceId).in('id', rows.map((row) => row.inventory_item_id).filter((id): id is string => Boolean(id))),
  ]);
  if (products.error || items.error) throw new Error('sizes_unavailable');
  const productById = new Map((products.data ?? []).map((product) => [product.id, product]));
  const itemById = new Map((items.data ?? []).map((item) => [item.id, item]));

  const linkedIds = rows.map((row) => row.inventory_item_id).filter((id): id is string => Boolean(id));
  const availability = await loadItemAvailability(supabase, workspaceId, linkedIds);

  const result: OrderProduct[] = [];
  for (const row of rows) {
    const product = productById.get(row.product_id);
    if (!product || !product.is_active) continue;
    const grams = Number(row.size_g);
    const label = grams >= 1000 && grams % 1000 === 0 ? `${grams / 1000} kg` : `${grams} g`;
    const item = row.inventory_item_id ? itemById.get(row.inventory_item_id) : undefined;
    const entry = row.inventory_item_id ? availability.get(row.inventory_item_id) : undefined;
    const available = Math.max(0, entry?.available ?? 0);
    const stock = !row.inventory_item_id ? 'not_linked' : available > 0 ? 'in_stock' : 'out_of_stock';
    const gap = stock === 'in_stock' ? { state: 'none' as ProductionState, gaps: [] } : rawGapsFor(entry, 1);
    result.push({
      sizeId: row.id,
      itemId: row.inventory_item_id,
      sku: row.sku ?? item?.sku ?? '',
      name: `${product.name || product.name_ar} · ${label}`,
      priceMad: Number(row.sale_price_mad),
      available,
      stock,
      production: stock === 'not_linked' ? 'no_recipe' : gap.state,
      rawGaps: gap.gaps,
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}
