import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedCustomerUser } from '@/lib/auth/customer';
import { isUuid } from '@/lib/api/operations';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getVerifiedCustomerUser();
  if (!user) return NextResponse.json({ error: 'Customer sign-in required.' }, { status: 401 });

  const rateLimit = await checkRateLimit('customer_catalog', user.id, 30, 60_000);
  if ('error' in rateLimit) {
    return NextResponse.json({ error: 'Customer catalog service is unavailable.' }, { status: 503 });
  }
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment and try again.' }, { status: 429 });
  }

  const clientId = request.nextUrl.searchParams.get('clientId');
  if (!isUuid(clientId)) return NextResponse.json({ error: 'Choose a store account.' }, { status: 400 });

  try {
    const admin = getSupabaseAdminClient();
    const { data: membership, error: membershipError } = await admin
      .from('erp_customer_memberships')
      .select('workspace_id, client_id')
      .eq('user_id', user.id)
      .eq('client_id', clientId)
      .eq('is_active', true)
      .maybeSingle();
    if (membershipError) return NextResponse.json({ error: 'Could not verify store access.' }, { status: 503 });
    if (!membership) return NextResponse.json({ error: 'Store account is not available.' }, { status: 403 });

    const [categoriesResult, productsResult, sizesResult] = await Promise.all([
      admin.from('erp_product_categories')
        .select('id, name_ar, name')
        .eq('workspace_id', membership.workspace_id)
        .eq('is_active', true)
        .order('name_ar'),
      admin.from('erp_products')
        .select('id, category_id, name_ar, name')
        .eq('workspace_id', membership.workspace_id)
        .eq('is_active', true)
        .order('name_ar'),
      admin.from('erp_product_sizes')
        .select('id, product_id, size_g, sku, sale_price_mad, inventory_item_id')
        .eq('workspace_id', membership.workspace_id)
        .eq('is_active', true)
        .not('sale_price_mad', 'is', null)
        .order('size_g'),
    ]);

    if (categoriesResult.error || productsResult.error || sizesResult.error) {
      return NextResponse.json({ error: 'Could not load the product catalog.' }, { status: 503 });
    }

    const productById = new Map((productsResult.data ?? []).map((product) => [product.id, product]));
    const candidateSizes = (sizesResult.data ?? []).filter((size) => productById.has(size.product_id));
    const itemIds = [...new Set(candidateSizes.flatMap((size) => size.inventory_item_id ? [size.inventory_item_id] : []))];
    const { data: inventoryItems, error: itemsError } = itemIds.length
      ? await admin.from('inventory_items')
        .select('id, sku, item_type, is_active, workspace_id')
        .in('id', itemIds)
        .eq('workspace_id', membership.workspace_id)
        .eq('item_type', 'finished_good')
        .eq('is_active', true)
      : { data: [], error: null };
    if (itemsError) return NextResponse.json({ error: 'Could not verify sellable products.' }, { status: 503 });

    const itemsById = new Map((inventoryItems ?? []).map((item) => [item.id, item]));
    const products = candidateSizes.flatMap((size) => {
      const product = productById.get(size.product_id);
      const item = size.inventory_item_id ? itemsById.get(size.inventory_item_id) : null;
      // Sizes without a stock item yet stay orderable; the item is created on first order.
      if (!product || (size.inventory_item_id && !item) || size.sale_price_mad === null || (!item && !size.sku)) return [];
      return [{
        sizeId: size.id,
        categoryId: product.category_id,
        name: product.name,
        nameAr: product.name_ar,
        sizeG: Number(size.size_g),
        sku: size.sku ?? item?.sku ?? '',
        priceMad: Number(size.sale_price_mad),
      }];
    });

    return NextResponse.json(
      { categories: categoriesResult.data ?? [], products },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Product catalog service is unavailable.' }, { status: 503 });
  }
}
