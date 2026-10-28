import type { getSupabaseServerClient } from '@/lib/supabase/server';

type Db = Awaited<ReturnType<typeof getSupabaseServerClient>>;

// Returns the stock item for a package size, creating and linking one when the
// size has none yet, so a product can be ordered before stock is set up.
export async function ensureSizeStockItem(
  supabase: Db,
  workspaceId: string,
  sizeId: string,
): Promise<{ itemId: string } | { error: string; status: number }> {
  const { data: size, error } = await supabase
    .from('erp_product_sizes')
    .select('id, product_id, size_g, sku, inventory_item_id, is_active')
    .eq('id', sizeId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) return { error: 'Could not load the product size.', status: 503 };
  if (!size || !size.is_active) return { error: 'A selected product was not found.', status: 404 };
  if (size.inventory_item_id) return { itemId: size.inventory_item_id };
  if (!size.sku) return { error: 'Add a SKU to this product size before ordering it.', status: 400 };

  const { data: product } = await supabase
    .from('erp_products')
    .select('name, name_ar')
    .eq('id', size.product_id)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!product) return { error: 'Could not load the product.', status: 503 };

  const grams = Number(size.size_g);
  const label = grams >= 1000 && grams % 1000 === 0 ? `${grams / 1000} kg` : `${grams} g`;
  const created = await supabase.rpc('erp_create_inventory_item', {
    p_sku: size.sku,
    p_name: `${product.name || product.name_ar} ${label}`.slice(0, 160),
    p_item_type: 'finished_good',
    p_base_unit: 'each',
    p_track_lots: false,
    p_reorder_point: 0,
    p_net_weight_g: grams,
  });
  let itemId = (created.data as { id?: string } | null)?.id;
  if (!itemId) {
    // A concurrent order may have created it already.
    const existing = await supabase.from('inventory_items').select('id').eq('workspace_id', workspaceId).eq('sku', size.sku).eq('item_type', 'finished_good').maybeSingle();
    itemId = existing.data?.id;
  }
  if (!itemId) return { error: 'Could not create the stock item for this product.', status: 503 };

  const linked = await supabase
    .from('erp_product_sizes')
    .update({ inventory_item_id: itemId, updated_at: new Date().toISOString() })
    .eq('id', size.id)
    .eq('workspace_id', workspaceId)
    .is('inventory_item_id', null);
  if (linked.error) return { error: 'The stock item could not be linked to this size.', status: 409 };
  return { itemId };
}
