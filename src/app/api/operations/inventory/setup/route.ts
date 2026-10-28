import { NextResponse } from 'next/server';
import { AuthRequiredError, getWorkspaceIdentity, WorkspaceAccessError } from '@/lib/auth/identity';
import { isDateString, isNonNegativeAmount, isPositiveQuantity, isRecord, isUuid, readJsonBody } from '@/lib/api/operations';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return NextResponse.json({ error: 'Sign-in required.' }, { status: 401 });
  if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: 'Workspace access is not active.' }, { status: 403 });
  return NextResponse.json({ error: 'Inventory setup service is unavailable.' }, { status: 503 });
}

function rpcErrorResponse(error: { code?: string } | null) {
  if (error?.code === '42501') return NextResponse.json({ error: 'You do not have permission for this action.' }, { status: 403 });
  if (error?.code === 'P0002') return NextResponse.json({ error: 'A required inventory record was not found.' }, { status: 404 });
  if (error?.code === '23505') return NextResponse.json({ error: 'A record with the same identifier already exists.' }, { status: 409 });
  if (error?.code === 'P0001' || error?.code?.startsWith('22')) {
    return NextResponse.json({ error: 'The inventory transaction details are invalid or the requested stock is unavailable.' }, { status: 400 });
  }
  if (error?.code) console.error('Inventory transaction failed', { code: error.code });
  return NextResponse.json({ error: 'The inventory transaction could not be completed.' }, { status: 503 });
}

const RECEIPT_MESSAGES: Record<string, string> = {
  whole_quantity_required: 'This item is counted in whole units.',
  invalid_receipt_location: 'Choose a warehouse or production location.',
  lot_code_required: 'This item is lot-tracked. Enter a lot code.',
  invalid_receipt_lot: 'That lot code is closed, expired or quarantined. Use another code.',
  invalid_stock_receipt: 'Check the quantity, source and reason.',
};

function canManageInventory(role: string) {
  return role === 'manager' || role === 'purchasing';
}

export async function GET() {
  try {
    const identity = await getWorkspaceIdentity();
    if (!canManageInventory(identity.role)) {
      return NextResponse.json({ error: 'Inventory management access required.' }, { status: 403 });
    }

    const supabase = await getSupabaseServerClient();
    const [itemsResult, locationsResult, lotsResult, adjustmentsResult, transfersResult] = await Promise.all([
      supabase
        .from('inventory_items')
        .select('id, sku, name, item_type, base_unit, net_weight_g, track_lots, reorder_point, is_active')
        .eq('workspace_id', identity.workspaceId)
        .order('sku')
        .limit(500),
      supabase
        .from('inventory_locations')
        .select('id, code, name, location_type, is_active')
        .eq('workspace_id', identity.workspaceId)
        .order('name')
        .limit(200),
      supabase
        .from('inventory_lots')
        .select('id, item_id, lot_code, supplier_lot_code, expires_on, lot_status')
        .eq('workspace_id', identity.workspaceId)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('inventory_adjustment_requests')
        .select('id, item_id, location_id, lot_id, quantity_delta, reason, status, requested_by, reviewed_by, review_note, created_at, reviewed_at')
        .eq('workspace_id', identity.workspaceId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('inventory_transfers')
        .select('id, document_number, item_id, lot_id, from_location_id, to_location_id, quantity, reason, created_by, created_at')
        .eq('workspace_id', identity.workspaceId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const results = [itemsResult, locationsResult, lotsResult, adjustmentsResult, transfersResult];
    if (results.some((result) => result.error)) {
      console.error('Could not load live inventory setup', {
        codes: results.map((result) => result.error?.code),
      });
      return NextResponse.json({ error: 'Could not load live inventory setup.' }, { status: 503 });
    }

    return NextResponse.json(
      {
        items: itemsResult.data ?? [],
        locations: locationsResult.data ?? [],
        lots: lotsResult.data ?? [],
        adjustments: adjustmentsResult.data ?? [],
        transfers: transfersResult.data ?? [],
        canConfigure: identity.role === 'manager',
        canReview: identity.role === 'manager',
        currentUserId: identity.userId,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getWorkspaceIdentity();
    if (!canManageInventory(identity.role)) {
      return NextResponse.json({ error: 'Inventory management access required.' }, { status: 403 });
    }

    const parsed = await readJsonBody(request);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: parsed.status ?? 400 });
    if (!isRecord(parsed.body) || typeof parsed.body.action !== 'string') {
      return NextResponse.json({ error: 'Invalid inventory request.' }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    if (parsed.body.action === 'create-item') {
      if (identity.role !== 'manager') {
        return NextResponse.json({ error: 'Manager access required to configure inventory items.' }, { status: 403 });
      }
      const { sku, name, itemType, baseUnit, trackLots, reorderPoint, netWeightG } = parsed.body;
      if (
        typeof sku !== 'string' || sku.trim().length < 1 || sku.trim().length > 64
        || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 160
        || !['raw_material', 'packaging', 'blend', 'finished_good'].includes(String(itemType))
        || !['g', 'each'].includes(String(baseUnit))
        || typeof trackLots !== 'boolean'
        || !isNonNegativeAmount(reorderPoint, 3)
        || (netWeightG !== null && netWeightG !== undefined && !isPositiveQuantity(netWeightG))
      ) {
        return NextResponse.json({ error: 'Check the item code, name, type, unit, and reorder point.' }, { status: 400 });
      }
      const { data, error } = await supabase.rpc('erp_create_inventory_item', {
        p_sku: sku.trim(),
        p_name: name.trim(),
        p_item_type: itemType,
        p_base_unit: baseUnit,
        p_track_lots: trackLots,
        p_reorder_point: reorderPoint,
        p_net_weight_g: netWeightG ?? null,
      });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ item: data }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (parsed.body.action === 'create-location') {
      if (identity.role !== 'manager') {
        return NextResponse.json({ error: 'Manager access required to configure inventory locations.' }, { status: 403 });
      }
      const { code, name, locationType } = parsed.body;
      if (
        typeof code !== 'string' || code.trim().length < 1 || code.trim().length > 40
        || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 160
        || !['warehouse', 'production', 'quarantine', 'transit', 'customer'].includes(String(locationType))
      ) {
        return NextResponse.json({ error: 'Check the location code, name, and type.' }, { status: 400 });
      }
      const { data, error } = await supabase.rpc('erp_create_inventory_location', {
        p_code: code.trim(),
        p_name: name.trim(),
        p_location_type: locationType,
      });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ location: data }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (parsed.body.action === 'transfer') {
      const { itemId, lotId, fromLocationId, toLocationId, quantity, reason, idempotencyKey } = parsed.body;
      if (
        !isUuid(itemId)
        || (lotId !== null && lotId !== undefined && !isUuid(lotId))
        || !isUuid(fromLocationId)
        || !isUuid(toLocationId)
        || !isPositiveQuantity(quantity)
        || typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 500
        || !isUuid(idempotencyKey)
      ) {
        return NextResponse.json({ error: 'Check the item, locations, quantity, and transfer reason.' }, { status: 400 });
      }
      const { data, error } = await supabase.rpc('erp_create_inventory_transfer', {
        p_item_id: itemId,
        p_lot_id: lotId ?? null,
        p_from_location_id: fromLocationId,
        p_to_location_id: toLocationId,
        p_quantity: quantity,
        p_reason: reason.trim(),
        p_idempotency_key: idempotencyKey,
      });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ transfer: data }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (parsed.body.action === 'request-adjustment') {
      const { itemId, locationId, lotId, quantityDelta, reason, idempotencyKey } = parsed.body;
      if (
        !isUuid(itemId)
        || !isUuid(locationId)
        || (lotId !== null && lotId !== undefined && !isUuid(lotId))
        || typeof quantityDelta !== 'number'
        || !Number.isFinite(quantityDelta)
        || quantityDelta === 0
        || Math.round(quantityDelta * 1000) / 1000 !== quantityDelta
        || typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 500
        || !isUuid(idempotencyKey)
      ) {
        return NextResponse.json({ error: 'Check the item, location, quantity change, and adjustment reason.' }, { status: 400 });
      }
      const { data, error } = await supabase.rpc('erp_request_inventory_adjustment', {
        p_item_id: itemId,
        p_location_id: locationId,
        p_lot_id: lotId ?? null,
        p_quantity_delta: quantityDelta,
        p_reason: reason.trim(),
        p_idempotency_key: idempotencyKey,
      });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ adjustment: data }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (parsed.body.action === 'receive-stock') {
      const { itemId, locationId, quantity, source, reason, lotCode, expiresOn, idempotencyKey } = parsed.body;
      if (
        !isUuid(itemId)
        || !isUuid(locationId)
        || !isPositiveQuantity(quantity)
        || (source !== 'opening' && source !== 'purchase' && source !== 'production')
        || typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 500
        || (lotCode !== undefined && lotCode !== null && (typeof lotCode !== 'string' || lotCode.trim().length > 64))
        || (expiresOn !== undefined && expiresOn !== null && expiresOn !== '' && !isDateString(expiresOn))
        || !isUuid(idempotencyKey)
      ) {
        return NextResponse.json({ error: 'Check the item, location, quantity and reason.' }, { status: 400 });
      }
      const { data, error } = await supabase.rpc('erp_receive_stock', {
        p_item_id: itemId,
        p_location_id: locationId,
        p_quantity: quantity,
        p_source: source,
        p_reason: reason.trim(),
        p_lot_code: typeof lotCode === 'string' ? lotCode.trim() : null,
        p_expires_on: typeof expiresOn === 'string' && expiresOn !== '' ? expiresOn : null,
        p_idempotency_key: idempotencyKey,
      });
      if (error) {
        const message = RECEIPT_MESSAGES[error.message ?? ''];
        if (message && error.code === 'P0001') return NextResponse.json({ error: message }, { status: 400 });
        return rpcErrorResponse(error);
      }
      return NextResponse.json({ receipt: data }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (parsed.body.action === 'review-adjustment') {
      if (identity.role !== 'manager') {
        return NextResponse.json({ error: 'Manager access required to review stock adjustments.' }, { status: 403 });
      }
      const { requestId, approve, reviewNote } = parsed.body;
      if (
        !isUuid(requestId)
        || typeof approve !== 'boolean'
        || (reviewNote !== undefined && (typeof reviewNote !== 'string' || reviewNote.trim().length > 500))
        || (!approve && (typeof reviewNote !== 'string' || reviewNote.trim().length < 5))
      ) {
        return NextResponse.json({ error: 'A review decision and valid review note are required.' }, { status: 400 });
      }
      const { data, error } = await supabase.rpc('erp_review_inventory_adjustment', {
        p_request_id: requestId,
        p_approve: approve,
        p_review_note: typeof reviewNote === 'string' ? reviewNote.trim() : '',
      });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ adjustment: data }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    return NextResponse.json({ error: 'Unknown inventory action.' }, { status: 400 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
