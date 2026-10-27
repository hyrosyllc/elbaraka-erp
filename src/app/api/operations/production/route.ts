import { NextRequest, NextResponse } from 'next/server';
import { isRecord, isUuid, readJsonBody } from '@/lib/api/operations';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function fail(message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status });
}

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return fail('Sign-in required.', 401);
  if (error instanceof WorkspaceAccessError) return fail('Workspace access is not active.', 403);
  return fail('Production service is unavailable.', 503);
}

const RPC_MESSAGES: Record<string, string> = {
  invalid_target_quantity: 'Enter a target quantity greater than zero with at most three decimals.',
  invalid_actual_quantity: 'Enter the quantity actually produced.',
  output_item_not_found: 'Choose a blend or finished good.',
  no_approved_recipe: 'This product has no approved recipe yet.',
  recipe_has_no_components: 'The recipe has no components.',
  production_order_not_planned: 'Only planned batches can be started.',
  production_order_not_in_progress: 'Only batches in progress can be completed.',
  production_order_not_cancellable: 'Only planned batches can be cancelled.',
  insufficient_components: 'Not enough free stock of some components.',
  no_warehouse_location: 'No active warehouse location is set up.',
};

function rpcErrorResponse(error: { code?: string; message?: string; details?: string } | null) {
  if (error?.code === '42501') return fail('You do not have permission for this action.', 403);
  if (error?.code === 'P0002') return fail('The requested record was not found.', 404);
  if (error?.code === '23505') return fail('A record with the same identifier already exists.', 409);
  if (error?.code === 'P0001' || error?.code?.startsWith('22')) {
    let shortages: unknown;
    if (error.message === 'insufficient_components' && error.details) {
      try { shortages = JSON.parse(error.details); } catch { shortages = undefined; }
    }
    return fail(RPC_MESSAGES[error.message ?? ''] ?? 'The production details are invalid.', 400, shortages);
  }
  if (error?.code) console.error('Production transaction failed', { code: error.code });
  return fail('The production transaction could not be completed.', 503);
}

export async function GET() {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager' && identity.role !== 'purchasing') return fail('Production access required.', 403);
    const supabase = await getSupabaseServerClient();

    const [ordersResult, recipesResult] = await Promise.all([
      supabase
        .from('erp_production_orders')
        .select('id, document_number, output_item_id, recipe_version, target_quantity, actual_quantity, status, created_at, started_at, completed_at')
        .eq('workspace_id', identity.workspaceId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('inventory_recipes')
        .select('output_item_id, version')
        .eq('workspace_id', identity.workspaceId)
        .eq('status', 'approved'),
    ]);
    if (ordersResult.error || recipesResult.error) return fail('Could not load production orders.', 503);

    const itemIds = [...new Set([...(ordersResult.data ?? []).map((order) => order.output_item_id), ...(recipesResult.data ?? []).map((recipe) => recipe.output_item_id)])];
    const items = new Map<string, { sku: string; name: string; unit: string }>();
    if (itemIds.length > 0) {
      const itemsResult = await supabase
        .from('inventory_items')
        .select('id, sku, name, base_unit, is_active')
        .eq('workspace_id', identity.workspaceId)
        .in('id', itemIds);
      if (itemsResult.error) return fail('Could not load production orders.', 503);
      for (const item of itemsResult.data ?? []) {
        if (item.is_active) items.set(item.id, { sku: item.sku, name: item.name, unit: item.base_unit });
      }
    }

    const orders = (ordersResult.data ?? []).map((order) => ({
      id: order.id,
      documentNumber: order.document_number,
      itemName: items.get(order.output_item_id)?.name ?? '',
      unit: items.get(order.output_item_id)?.unit ?? '',
      recipeVersion: order.recipe_version,
      targetQuantity: Number(order.target_quantity),
      actualQuantity: order.actual_quantity === null ? null : Number(order.actual_quantity),
      status: order.status,
      createdAt: order.created_at,
      startedAt: order.started_at,
      completedAt: order.completed_at,
    }));
    const producible = [...new Set((recipesResult.data ?? []).map((recipe) => recipe.output_item_id))]
      .filter((id) => items.has(id))
      .map((id) => ({ itemId: id, sku: items.get(id)!.sku, name: items.get(id)!.name, unit: items.get(id)!.unit }));

    return NextResponse.json({ orders, producible }, { headers: NO_STORE });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager' && identity.role !== 'purchasing') return fail('Production access required.', 403);

    const parsed = await readJsonBody(request);
    if (parsed.error) return fail(parsed.error, parsed.status ?? 400);
    const body = parsed.body;
    if (!isRecord(body) || typeof body.action !== 'string') return fail('Invalid request.', 400);
    const supabase = await getSupabaseServerClient();

    if (body.action === 'create') {
      if (!isUuid(body.itemId) || !isUuid(body.idempotencyKey) || typeof body.targetQuantity !== 'number') return fail('Invalid production request.', 400);
      const { data, error } = await supabase.rpc('erp_create_production_order', {
        p_output_item_id: body.itemId,
        p_target_quantity: body.targetQuantity,
        p_idempotency_key: body.idempotencyKey,
      });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ orderId: data }, { status: 201, headers: NO_STORE });
    }

    if (!isUuid(body.orderId)) return fail('Invalid production order.', 400);

    if (body.action === 'start') {
      const { error } = await supabase.rpc('erp_start_production_order', { p_order_id: body.orderId });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }
    if (body.action === 'complete') {
      if (typeof body.actualQuantity !== 'number') return fail('Enter the quantity actually produced.', 400);
      const { error } = await supabase.rpc('erp_complete_production_order', { p_order_id: body.orderId, p_actual_quantity: body.actualQuantity });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }
    if (body.action === 'cancel') {
      const { error } = await supabase.rpc('erp_cancel_production_order', { p_order_id: body.orderId });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }

    return fail('Unknown production action.', 400);
  } catch (error) {
    return authErrorResponse(error);
  }
}
