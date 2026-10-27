import { NextResponse } from 'next/server';
import { AuthRequiredError, getWorkspaceIdentity, WorkspaceAccessError } from '@/lib/auth/identity';
import { isDateString, isNonNegativeAmount, isPositiveQuantity, isRecord, isUuid, readJsonBody } from '@/lib/api/operations';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return NextResponse.json({ error: 'Sign-in required.' }, { status: 401 });
  if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: 'Workspace access is not active.' }, { status: 403 });
  return NextResponse.json({ error: 'Purchasing service is unavailable.' }, { status: 503 });
}

function rpcErrorResponse(error: { code?: string } | null) {
  if (error?.code === '42501') return NextResponse.json({ error: 'You do not have permission for this action.' }, { status: 403 });
  if (error?.code === 'P0002') return NextResponse.json({ error: 'A required purchasing record was not found.' }, { status: 404 });
  if (error?.code === '23505') return NextResponse.json({ error: 'A record with the same identifier already exists.' }, { status: 409 });
  if (error?.code === 'P0001' || error?.code?.startsWith('22')) {
    return NextResponse.json({ error: 'The transaction details are invalid or the requested stock is unavailable.' }, { status: 400 });
  }
  if (error?.code) console.error('Purchasing transaction failed', { code: error.code });
  return NextResponse.json({ error: 'The purchasing transaction could not be completed.' }, { status: 503 });
}

function hasPurchasingRole(role: string) {
  return role === 'manager' || role === 'purchasing';
}

export async function GET() {
  try {
    const identity = await getWorkspaceIdentity();
    if (!hasPurchasingRole(identity.role)) {
      return NextResponse.json({ error: 'Purchasing access required.' }, { status: 403 });
    }

    const supabase = await getSupabaseServerClient();
    const [ordersResult, suppliersResult, itemsResult, locationsResult] = await Promise.all([
      supabase
        .from('erp_purchase_orders')
        .select('id, document_number, supplier_id, supplier_name_snapshot, status, expected_at, created_at')
        .eq('workspace_id', identity.workspaceId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('erp_suppliers')
        .select('id, name')
        .eq('workspace_id', identity.workspaceId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('inventory_items')
        .select('id, sku, name, item_type, base_unit, track_lots')
        .eq('workspace_id', identity.workspaceId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('inventory_locations')
        .select('id, code, name, location_type')
        .eq('workspace_id', identity.workspaceId)
        .eq('is_active', true)
        .in('location_type', ['warehouse', 'production', 'quarantine'])
        .order('name'),
    ]);

    if (ordersResult.error || suppliersResult.error || itemsResult.error || locationsResult.error) {
      console.error('Could not load live purchasing data', {
        codes: [ordersResult.error?.code, suppliersResult.error?.code, itemsResult.error?.code, locationsResult.error?.code],
      });
      return NextResponse.json({ error: 'Could not load live purchasing records.' }, { status: 503 });
    }

    const orderIds = (ordersResult.data ?? []).map((order) => order.id);
    const linesResult = orderIds.length
      ? await supabase
        .from('erp_purchase_order_lines')
        .select('id, purchase_order_id, item_id, sku_snapshot, name_snapshot, quantity_ordered, quantity_received, unit_cost_mad')
        .eq('workspace_id', identity.workspaceId)
        .in('purchase_order_id', orderIds)
        .order('created_at')
      : { data: [], error: null };
    if (linesResult.error) {
      console.error('Could not load purchase order lines', { code: linesResult.error.code });
      return NextResponse.json({ error: 'Could not load live purchasing records.' }, { status: 503 });
    }

    return NextResponse.json(
      {
        orders: ordersResult.data ?? [],
        lines: linesResult.data ?? [],
        suppliers: suppliersResult.data ?? [],
        items: itemsResult.data ?? [],
        locations: locationsResult.data ?? [],
        canManage: hasPurchasingRole(identity.role),
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
    if (!hasPurchasingRole(identity.role)) {
      return NextResponse.json({ error: 'Purchasing access required.' }, { status: 403 });
    }

    const parsed = await readJsonBody(request);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: parsed.status ?? 400 });
    if (!isRecord(parsed.body) || typeof parsed.body.action !== 'string') {
      return NextResponse.json({ error: 'Invalid purchasing request.' }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    if (parsed.body.action === 'create') {
      const { supplierId, expectedAt, lines, idempotencyKey } = parsed.body;
      if (
        !isUuid(supplierId)
        || (expectedAt !== null && expectedAt !== undefined && !isDateString(expectedAt))
        || !Array.isArray(lines)
        || lines.length < 1
        || lines.length > 100
        || !isUuid(idempotencyKey)
      ) {
        return NextResponse.json({ error: 'Check the supplier, date, and purchase order lines.' }, { status: 400 });
      }

      const parsedLines: { item_id: string; quantity_ordered: number; unit_cost_mad: number }[] = [];
      const itemIds = new Set<string>();
      for (const line of lines) {
        if (
          !isRecord(line)
          || !isUuid(line.itemId)
          || !isPositiveQuantity(line.quantity)
          || !isNonNegativeAmount(line.unitCostMad)
          || itemIds.has(line.itemId)
        ) {
          return NextResponse.json({ error: 'Each purchase order line must use a unique item and valid quantity and cost.' }, { status: 400 });
        }
        itemIds.add(line.itemId);
        parsedLines.push({
          item_id: line.itemId,
          quantity_ordered: line.quantity,
          unit_cost_mad: line.unitCostMad,
        });
      }

      const { data, error } = await supabase.rpc('erp_create_purchase_order', {
        p_supplier_id: supplierId,
        p_expected_at: expectedAt ?? null,
        p_lines: parsedLines,
        p_idempotency_key: idempotencyKey,
      });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ purchaseOrder: data }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (parsed.body.action === 'order' || parsed.body.action === 'cancel') {
      if (!isUuid(parsed.body.purchaseOrderId)) {
        return NextResponse.json({ error: 'A valid purchase order is required.' }, { status: 400 });
      }
      const { data, error } = await supabase.rpc(
        parsed.body.action === 'order' ? 'erp_mark_purchase_order_ordered' : 'erp_cancel_purchase_order',
        { p_purchase_order_id: parsed.body.purchaseOrderId },
      );
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ purchaseOrder: data }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (parsed.body.action === 'receive') {
      const { purchaseOrderId, deliveryReference, lines, idempotencyKey } = parsed.body;
      if (
        !isUuid(purchaseOrderId)
        || typeof deliveryReference !== 'string'
        || deliveryReference.trim().length > 120
        || !Array.isArray(lines)
        || lines.length < 1
        || lines.length > 100
        || !isUuid(idempotencyKey)
      ) {
        return NextResponse.json({ error: 'Check the purchase order and receipt details.' }, { status: 400 });
      }

      const receivedLines: Record<string, unknown>[] = [];
      for (const line of lines) {
        if (
          !isRecord(line)
          || !isUuid(line.purchaseOrderLineId)
          || !isUuid(line.locationId)
          || !isPositiveQuantity(line.quantity)
        ) {
          return NextResponse.json({ error: 'Each receipt line needs a valid order line, location, and quantity.' }, { status: 400 });
        }
        const lotCode = line.lotCode === undefined ? '' : line.lotCode;
        const supplierLotCode = line.supplierLotCode === undefined ? '' : line.supplierLotCode;
        const expiresOn = line.expiresOn === undefined || line.expiresOn === '' ? null : line.expiresOn;
        const quarantine = line.quarantine === undefined ? false : line.quarantine;
        if (
          typeof lotCode !== 'string' || lotCode.trim().length > 120
          || typeof supplierLotCode !== 'string' || supplierLotCode.trim().length > 120
          || (expiresOn !== null && !isDateString(expiresOn))
          || typeof quarantine !== 'boolean'
        ) {
          return NextResponse.json({ error: 'Check the receipt lot, expiry, and inspection details.' }, { status: 400 });
        }
        receivedLines.push({
          purchase_order_line_id: line.purchaseOrderLineId,
          location_id: line.locationId,
          quantity: line.quantity,
          lot_code: lotCode,
          supplier_lot_code: supplierLotCode,
          expires_on: expiresOn,
          quarantine,
        });
      }

      const { data, error } = await supabase.rpc('erp_receive_purchase_order', {
        p_purchase_order_id: purchaseOrderId,
        p_supplier_delivery_reference: deliveryReference.trim(),
        p_received_lines: receivedLines,
        p_idempotency_key: idempotencyKey,
      });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ receipt: data }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
    }

    return NextResponse.json({ error: 'Unknown purchasing action.' }, { status: 400 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
