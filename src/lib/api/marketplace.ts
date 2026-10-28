import type { getSupabaseServerClient } from '@/lib/supabase/server';

type Db = Awaited<ReturnType<typeof getSupabaseServerClient>>;

export type Tick = { itemId: string; supplierId: string | null; price: number; at: number; source: string };
export type MaterialRow = {
  id: string; sku: string; name: string; type: 'raw_material' | 'packaging'; unit: 'kg' | 'each';
  price: number | null; lastAt: string | null; change24h: number | null; change7d: number | null; change30d: number | null;
  high30: number | null; low30: number | null; avg30: number | null; spark: number[];
  bestPrice: number | null; bestSupplierId: string | null;
  suppliers: { supplierId: string | null; name: string; price: number; at: string; source: string; deltaToBest: number | null }[];
};
export type MarginRow = {
  sizeId: string; name: string; sizeG: number; sku: string; priceMad: number; costMad: number | null;
  marginMad: number | null; marginPct: number | null; missing: { sku: string; name: string }[];
};
export type ItemInfo = { id: string; sku: string; name: string; type: string; baseUnit: string };

const DAY = 86_400_000;
const num = (value: unknown) => Number(value ?? 0) || 0;
export const unitFactor = (baseUnit: string) => (baseUnit === 'g' ? 1000 : 1);
const pct = (now: number, then: number | null) => (then && then > 0 ? Math.round(((now - then) / then) * 10_000) / 100 : null);
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

function priceAt(ticks: Tick[], time: number): number | null {
  let found: number | null = null;
  for (const tick of ticks) {
    if (tick.at <= time) found = tick.price; else break;
  }
  return found;
}

export async function loadTicks(supabase: Db, workspaceId: string, itemId?: string): Promise<Tick[]> {
  let query = supabase
    .from('erp_material_prices')
    .select('item_id, supplier_id, price_mad, source, recorded_at')
    .eq('workspace_id', workspaceId)
    .order('recorded_at', { ascending: true })
    .limit(20_000);
  if (itemId) query = query.eq('item_id', itemId);
  const { data, error } = await query;
  if (error) throw new Error('prices_unavailable');
  return (data ?? []).map((row) => ({ itemId: row.item_id, supplierId: row.supplier_id, price: num(row.price_mad), at: Date.parse(row.recorded_at), source: row.source }));
}

export async function loadItems(supabase: Db, workspaceId: string): Promise<ItemInfo[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('id, sku, name, item_type, base_unit')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .limit(2000);
  if (error) throw new Error('items_unavailable');
  return (data ?? []).map((item) => ({ id: item.id, sku: item.sku, name: item.name, type: item.item_type, baseUnit: item.base_unit }));
}

export function buildMaterialRows(items: ItemInfo[], ticks: Tick[], suppliers: Map<string, string>, now = Date.now()): MaterialRow[] {
  const byItem = new Map<string, Tick[]>();
  for (const tick of ticks) byItem.set(tick.itemId, [...(byItem.get(tick.itemId) ?? []), tick]);

  return items
    .filter((item) => item.type === 'raw_material' || item.type === 'packaging')
    .map((item) => {
      const factor = unitFactor(item.baseUnit);
      const series = byItem.get(item.id) ?? [];
      const last = series.at(-1);
      const price = last ? round(last.price * factor, 4) : null;
      const change = (days: number) => (last ? pct(last.price, priceAt(series, now - days * DAY)) : null);

      const window = series.filter((tick) => tick.at >= now - 30 * DAY).map((tick) => tick.price);
      const opening = priceAt(series, now - 30 * DAY);
      const values = opening === null ? window : [opening, ...window];
      const spark: number[] = [];
      for (let day = 29; day >= 0; day -= 1) {
        const value = priceAt(series, now - day * DAY);
        if (value !== null) spark.push(round(value * factor, 4));
      }

      const latestBySupplier = new Map<string, Tick>();
      for (const tick of series) latestBySupplier.set(tick.supplierId ?? '', tick);
      const quotes = [...latestBySupplier.values()];
      const named = quotes.filter((quote) => quote.supplierId);
      const best = named.length ? named.reduce((min, quote) => (quote.price < min.price ? quote : min)) : null;

      return {
        id: item.id, sku: item.sku, name: item.name, type: item.type as 'raw_material' | 'packaging', unit: (factor === 1000 ? 'kg' : 'each') as 'kg' | 'each',
        price, lastAt: last ? new Date(last.at).toISOString() : null,
        change24h: change(1), change7d: change(7), change30d: change(30),
        high30: values.length ? round(Math.max(...values) * factor, 4) : null,
        low30: values.length ? round(Math.min(...values) * factor, 4) : null,
        avg30: values.length ? round((values.reduce((sum, value) => sum + value, 0) / values.length) * factor, 4) : null,
        spark,
        bestPrice: best ? round(best.price * factor, 4) : null, bestSupplierId: best?.supplierId ?? null,
        suppliers: quotes.map((quote) => ({
          supplierId: quote.supplierId,
          name: quote.supplierId ? suppliers.get(quote.supplierId) ?? '—' : '',
          price: round(quote.price * factor, 4),
          at: new Date(quote.at).toISOString(),
          source: quote.source,
          deltaToBest: best && quote.supplierId ? pct(quote.price, best.price) : null,
        })).sort((a, b) => a.price - b.price),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

type RecipeRow = { id: string; outputItemId: string; outputQuantity: number; components: { itemId: string; quantity: number }[] };

export async function loadRecipes(supabase: Db, workspaceId: string): Promise<Map<string, RecipeRow>> {
  const { data: recipes, error } = await supabase
    .from('inventory_recipes')
    .select('id, output_item_id, version, output_quantity')
    .eq('workspace_id', workspaceId)
    .eq('status', 'approved')
    .limit(2000);
  if (error) throw new Error('recipes_unavailable');
  const latest = new Map<string, { id: string; version: number; outputQuantity: number }>();
  for (const recipe of recipes ?? []) {
    const current = latest.get(recipe.output_item_id);
    if (!current || recipe.version > current.version) latest.set(recipe.output_item_id, { id: recipe.id, version: recipe.version, outputQuantity: num(recipe.output_quantity) });
  }
  const ids = [...latest.values()].map((recipe) => recipe.id);
  const result = new Map<string, RecipeRow>();
  if (ids.length === 0) return result;
  const { data: components, error: componentError } = await supabase
    .from('inventory_recipe_components')
    .select('recipe_id, input_item_id, quantity')
    .in('recipe_id', ids)
    .limit(10_000);
  if (componentError) throw new Error('recipes_unavailable');
  for (const [outputItemId, recipe] of latest) {
    result.set(outputItemId, {
      id: recipe.id, outputItemId, outputQuantity: recipe.outputQuantity,
      components: (components ?? []).filter((component) => component.recipe_id === recipe.id).map((component) => ({ itemId: component.input_item_id, quantity: num(component.quantity) })),
    });
  }
  return result;
}

export type ItemCost = { unitCost: number | null; missing: { sku: string; name: string }[] };

// Unit cost per base unit: materials use their latest marketplace price; items with an approved recipe
// (finished goods, blends) are costed from their components, recursively.
export function costItems(items: ItemInfo[], ticks: Tick[], recipes: Map<string, RecipeRow>) {
  const info = new Map(items.map((item) => [item.id, item]));
  const lastPrice = new Map<string, number>();
  for (const tick of ticks) lastPrice.set(tick.itemId, tick.price);
  const memo = new Map<string, ItemCost>();

  function cost(itemId: string, depth: number): ItemCost {
    const known = memo.get(itemId);
    if (known) return known;
    const item = info.get(itemId);
    const recipe = recipes.get(itemId);
    let result: ItemCost;
    if (recipe && depth < 4 && recipe.components.length > 0) {
      let total = 0;
      const missing: { sku: string; name: string }[] = [];
      for (const component of recipe.components) {
        const part = cost(component.itemId, depth + 1);
        if (part.unitCost === null) {
          const source = info.get(component.itemId);
          if (part.missing.length) missing.push(...part.missing); else missing.push({ sku: source?.sku ?? '', name: source?.name ?? '' });
        } else total += part.unitCost * component.quantity;
      }
      result = { unitCost: missing.length ? null : total / recipe.outputQuantity, missing };
    } else if (lastPrice.has(itemId)) {
      result = { unitCost: lastPrice.get(itemId) ?? null, missing: [] };
    } else {
      result = { unitCost: null, missing: item ? [{ sku: item.sku, name: item.name }] : [] };
    }
    memo.set(itemId, result);
    return result;
  }
  return (itemId: string) => cost(itemId, 0);
}

export async function loadMargins(supabase: Db, workspaceId: string, itemCost: (id: string) => ItemCost): Promise<MarginRow[]> {
  const [sizes, products] = await Promise.all([
    supabase.from('erp_product_sizes').select('id, product_id, size_g, sku, sale_price_mad, inventory_item_id').eq('workspace_id', workspaceId).eq('is_active', true).not('sale_price_mad', 'is', null).limit(3000),
    supabase.from('erp_products').select('id, name, name_ar').eq('workspace_id', workspaceId).eq('is_active', true).limit(3000),
  ]);
  if (sizes.error || products.error) throw new Error('catalog_unavailable');
  const productById = new Map((products.data ?? []).map((product) => [product.id, product]));
  return (sizes.data ?? []).flatMap((size) => {
    const product = productById.get(size.product_id);
    if (!product) return [];
    const priceMad = num(size.sale_price_mad);
    const cost = size.inventory_item_id ? itemCost(size.inventory_item_id) : { unitCost: null, missing: [] };
    const marginMad = cost.unitCost === null ? null : round(priceMad - cost.unitCost);
    return [{
      sizeId: size.id, name: product.name || product.name_ar, sizeG: num(size.size_g), sku: size.sku ?? '', priceMad,
      costMad: cost.unitCost === null ? null : round(cost.unitCost),
      marginMad, marginPct: marginMad === null || priceMad <= 0 ? null : round((marginMad / priceMad) * 100, 1),
      missing: cost.missing,
    }];
  }).sort((a, b) => a.name.localeCompare(b.name) || a.sizeG - b.sizeG);
}

export async function loadRealized(supabase: Db, workspaceId: string, itemCost: (id: string) => ItemCost, days = 30) {
  const since = new Date(Date.now() - days * DAY).toISOString();
  const [lines, adjustments] = await Promise.all([
    supabase.from('erp_delivery_note_lines')
      .select('item_id, quantity, unit_price_mad, erp_delivery_notes!inner(status, delivered_at)')
      .eq('workspace_id', workspaceId).eq('erp_delivery_notes.status', 'delivered').gte('erp_delivery_notes.delivered_at', since).limit(5000),
    supabase.from('erp_invoice_adjustments').select('amount_mad, kind').eq('workspace_id', workspaceId).neq('kind', 'refund').gte('created_at', since).limit(5000),
  ]);
  if (lines.error || adjustments.error) throw new Error('sales_unavailable');
  let revenue = 0; let cost = 0; let uncostedRevenue = 0;
  for (const line of lines.data ?? []) {
    const lineRevenue = num(line.quantity) * num(line.unit_price_mad);
    revenue += lineRevenue;
    const unit = itemCost(line.item_id).unitCost;
    if (unit === null) uncostedRevenue += lineRevenue; else cost += unit * num(line.quantity);
  }
  const credits = (adjustments.data ?? []).reduce((sum, row) => sum + num(row.amount_mad), 0);
  const netRevenue = revenue + credits;
  return {
    days, revenueMad: round(revenue), creditsMad: round(credits), netRevenueMad: round(netRevenue),
    costMad: round(cost), uncostedRevenueMad: round(uncostedRevenue),
    profitMad: round(netRevenue - uncostedRevenue - cost),
  };
}
