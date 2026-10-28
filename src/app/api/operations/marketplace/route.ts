import { NextRequest, NextResponse } from 'next/server';
import { isRecord, isUuid, readJsonBody } from '@/lib/api/operations';
import { buildMaterialRows, costItems, loadItems, loadMargins, loadRealized, loadRecipes, loadTicks, unitFactor } from '@/lib/api/marketplace';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'private, no-store' };

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return fail('Sign-in required.', 401);
  if (error instanceof WorkspaceAccessError) return fail('Workspace access is not active.', 403);
  return fail('Marketplace service is unavailable.', 503);
}

const RPC_MESSAGES: Record<string, string> = {
  invalid_price: 'Enter a price above zero.',
  price_item_not_material: 'Only raw materials and packaging have a market price.',
  item_not_found: 'The material was not found.',
  supplier_not_found: 'The supplier was not found.',
};

export async function GET(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager' && identity.role !== 'purchasing') return fail('Purchasing access required.', 403);
    const supabase = await getSupabaseServerClient();
    const itemId = request.nextUrl.searchParams.get('itemId');

    if (itemId) {
      if (!isUuid(itemId)) return fail('Invalid material.', 400);
      const [ticks, items] = await Promise.all([loadTicks(supabase, identity.workspaceId, itemId), loadItems(supabase, identity.workspaceId)]);
      const factor = unitFactor(items.find((item) => item.id === itemId)?.baseUnit ?? 'each');
      return NextResponse.json({
        history: ticks.map((tick) => ({ at: new Date(tick.at).toISOString(), price: Math.round(tick.price * factor * 10_000) / 10_000, supplierId: tick.supplierId, source: tick.source })),
      }, { headers: NO_STORE });
    }

    const [items, ticks, recipes, suppliers] = await Promise.all([
      loadItems(supabase, identity.workspaceId),
      loadTicks(supabase, identity.workspaceId),
      loadRecipes(supabase, identity.workspaceId),
      supabase.from('erp_suppliers').select('id, name').eq('workspace_id', identity.workspaceId).eq('is_active', true).order('name').limit(500),
    ]);
    if (suppliers.error) return fail('Could not load suppliers.', 503);
    const supplierNames = new Map((suppliers.data ?? []).map((supplier) => [supplier.id, supplier.name]));
    const materials = buildMaterialRows(items, ticks, supplierNames);
    const body: Record<string, unknown> = { materials, suppliers: suppliers.data ?? [], canEdit: true };

    // Margins and realized profit are financial data: managers only.
    if (identity.role === 'manager') {
      const itemCost = costItems(items, ticks, recipes);
      const [margins, realized] = await Promise.all([loadMargins(supabase, identity.workspaceId, itemCost), loadRealized(supabase, identity.workspaceId, itemCost)]);
      body.margins = margins;
      body.realized = realized;
    }
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager' && identity.role !== 'purchasing') return fail('Purchasing access required.', 403);
    const parsed = await readJsonBody(request);
    if (parsed.error) return fail(parsed.error, parsed.status ?? 400);
    const body = parsed.body;
    if (!isRecord(body) || body.action !== 'price' || !isUuid(body.itemId) || !isUuid(body.idempotencyKey)
      || typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price <= 0
      || (body.supplierId !== null && body.supplierId !== undefined && !isUuid(body.supplierId))) {
      return fail('Invalid price update.', 400);
    }
    const supabase = await getSupabaseServerClient();
    const item = await supabase.from('inventory_items').select('base_unit').eq('id', body.itemId).eq('workspace_id', identity.workspaceId).maybeSingle();
    if (!item.data) return fail('The material was not found.', 404);
    // The marketplace shows kilograms; stock and purchase orders are in grams.
    const perBaseUnit = Math.round((body.price / unitFactor(item.data.base_unit)) * 100_000) / 100_000;
    const { data, error } = await supabase.rpc('erp_record_material_price', {
      p_item_id: body.itemId,
      p_supplier_id: body.supplierId ?? null,
      p_price_mad: perBaseUnit,
      p_note: typeof body.note === 'string' ? body.note.slice(0, 200) : '',
      p_idempotency_key: body.idempotencyKey,
    });
    if (error) {
      if (error.code === '42501') return fail('You do not have permission for this action.', 403);
      if (error.code === 'P0002') return fail(RPC_MESSAGES[error.message] ?? 'The requested record was not found.', 404);
      if (error.code === 'P0001') return fail(RPC_MESSAGES[error.message] ?? 'The price is invalid.', 400);
      return fail('The price could not be saved.', 503);
    }
    return NextResponse.json({ priceId: data }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return authErrorResponse(error);
  }
}
