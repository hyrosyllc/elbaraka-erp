import { NextRequest, NextResponse } from 'next/server';
import { isDateString, isRecord, isUuid, readJsonBody } from '@/lib/api/operations';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import type { OrderPriority, OrderStatus } from '@/lib/delivery-map';
import { ensureSizeStockItem } from '@/lib/api/ensureStockItem';
import { loadOrderProducts, type OrderProduct } from '@/lib/api/stockAvailability';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

type OrderRow = {
  id: string;
  document_number: string;
  client_id: string;
  client_name_snapshot: string;
  status: OrderStatus;
  priority: OrderPriority;
  requested_delivery_date: string | null;
  assigned_driver_id: string | null;
  notes: string;
  cancel_reason: string | null;
  created_at: string;
  erp_sales_order_lines: { item_id: string; sku_snapshot: string; name_snapshot: string; quantity: number; unit_price_mad: number | string }[] | null;
};

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return fail('Sign-in required.', 401);
  if (error instanceof WorkspaceAccessError) return fail('Workspace access is not active.', 403);
  return fail('Order service is unavailable.', 503);
}

const RPC_MESSAGES: Record<string, string> = {
  insufficient_stock: 'Not enough available stock to confirm this order.',
  price_required: 'A selected product has no sale price. Enter a price for it.',
  nothing_available: 'None of the ordered products are in stock yet. Produce or receive stock first.',
  sales_order_not_reservable: 'Only confirmed orders can reserve more stock.',
  sales_order_not_confirmable: 'Only draft orders can be confirmed.',
  sales_order_not_cancellable: 'This order can no longer be cancelled.',
  sales_order_closed: 'This order is closed and cannot be changed.',
  cancel_reason_required: 'Enter a cancellation reason.',
  duplicate_order_item: 'Each product can appear only once per order.',
  driver_not_found: 'The selected driver is not available.',
  client_not_found: 'The client was not found.',
  item_not_found: 'A selected product was not found.',
};

function rpcErrorResponse(error: { code?: string; message?: string; details?: string } | null) {
  if (error?.code === '42501') return fail('You do not have permission for this action.', 403);
  if (error?.code === 'P0002') return fail(RPC_MESSAGES[error.message ?? ''] ?? 'The requested record was not found.', 404);
  if (error?.code === '23505') return fail('A record with the same identifier already exists.', 409);
  if (error?.code === 'P0001' || error?.code?.startsWith('22')) {
    const body: { error: string; shortages?: unknown } = {
      error: RPC_MESSAGES[error.message ?? ''] ?? 'The order details are invalid.',
    };
    if (error.message === 'insufficient_stock' && error.details) {
      try {
        body.shortages = JSON.parse(error.details) as unknown;
      } catch {
        // details are informational only
      }
    }
    return NextResponse.json(body, { status: 400 });
  }
  if (error?.code) console.error('Order transaction failed', { code: error.code });
  return fail('The order transaction could not be completed.', 503);
}

export async function GET(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager' && identity.role !== 'delivery') return fail('Order access required.', 403);

    const clientId = request.nextUrl.searchParams.get('clientId');
    if (clientId !== null && !isUuid(clientId)) return fail('Invalid client.', 400);
    const isManager = identity.role === 'manager';

    const supabase = await getSupabaseServerClient();
    let ordersQuery = supabase
      .from('erp_sales_orders')
      .select('id, document_number, client_id, client_name_snapshot, status, priority, requested_delivery_date, assigned_driver_id, notes, cancel_reason, created_at, erp_sales_order_lines(item_id, sku_snapshot, name_snapshot, quantity, unit_price_mad)')
      .eq('workspace_id', identity.workspaceId)
      .order('created_at', { ascending: false })
      .limit(clientId ? 20 : 150);
    if (clientId) ordersQuery = ordersQuery.eq('client_id', clientId);
    if (!isManager) ordersQuery = ordersQuery.eq('assigned_driver_id', identity.userId);

    const [ordersResult, sizesResult, driversResult] = await Promise.all([
      ordersQuery,
      isManager && !clientId ? loadOrderProducts(supabase, identity.workspaceId).then((data) => ({ data, error: null })).catch(() => ({ data: [] as OrderProduct[], error: { code: 'products' } })) : Promise.resolve({ data: [] as OrderProduct[], error: null }),
      isManager && !clientId ? supabase.rpc('erp_list_workspace_drivers') : Promise.resolve({ data: [], error: null }),
    ]);

    if (ordersResult.error || sizesResult.error || driversResult.error) {
      console.error('Could not load orders', { orders: ordersResult.error?.code, sizes: sizesResult.error?.code });
      return fail('Could not load orders.', 503);
    }

    const rows = (ordersResult.data ?? []) as unknown as OrderRow[];
    let events: { order_id: string; event_type: string; actor_id: string | null; detail: unknown; created_at: string }[] = [];
    if (isManager && rows.length > 0) {
      const eventsResult = await supabase
        .from('erp_sales_order_events')
        .select('order_id, event_type, actor_id, detail, created_at')
        .eq('workspace_id', identity.workspaceId)
        .in('order_id', rows.map((row) => row.id))
        .order('created_at');
      if (eventsResult.error) return fail('Could not load order history.', 503);
      events = eventsResult.data ?? [];
    }

    const orders = rows.map((row) => {
      const lines = (row.erp_sales_order_lines ?? []).map((line) => ({
        itemId: line.item_id,
        sku: line.sku_snapshot,
        name: line.name_snapshot,
        quantity: line.quantity,
        unitPriceMad: Number(line.unit_price_mad),
      }));
      return {
        id: row.id,
        documentNumber: row.document_number,
        clientId: row.client_id,
        clientName: row.client_name_snapshot,
        status: row.status,
        priority: row.priority,
        requestedDeliveryDate: row.requested_delivery_date,
        assignedDriverId: row.assigned_driver_id,
        notes: row.notes,
        cancelReason: row.cancel_reason,
        createdAt: row.created_at,
        lines,
        totalMad: lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMad, 0),
        events: events
          .filter((event) => event.order_id === row.id)
          .map((event) => ({ type: event.event_type, actorId: event.actor_id, detail: event.detail, at: event.created_at })),
      };
    });

    const products = sizesResult.data;

    const drivers = ((driversResult.data ?? []) as { user_id: string; full_name: string }[]).map((driver) => ({
      userId: driver.user_id,
      fullName: driver.full_name,
    }));

    return NextResponse.json({ orders, products, drivers, canManage: isManager }, { headers: NO_STORE });
  } catch (error) {
    return authErrorResponse(error);
  }
}

function parsePriority(value: unknown): OrderPriority | null {
  if (value === undefined || value === null) return 'normal';
  return value === 'normal' || value === 'urgent' ? value : null;
}

function parseOptionalDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  return isDateString(value) ? value : undefined;
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager') return fail('Manager access required.', 403);

    const parsed = await readJsonBody(request);
    if (parsed.error) return fail(parsed.error, parsed.status ?? 400);
    const body = parsed.body;
    if (!isRecord(body) || typeof body.action !== 'string') return fail('Invalid order request.', 400);

    const supabase = await getSupabaseServerClient();

    if (body.action === 'create') {
      const priority = parsePriority(body.priority);
      const date = parseOptionalDate(body.requestedDeliveryDate);
      const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
      if (
        !isUuid(body.clientId) || !isUuid(body.idempotencyKey) || priority === null || date === undefined
        || notes.length > 1000 || !Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 100
      ) {
        return fail('Check the client, date, and order lines.', 400);
      }
      const lines: { itemId: string; quantity: number; unitPriceMad?: number }[] = [];
      for (const line of body.lines) {
        if (
          !isRecord(line) || (!isUuid(line.itemId) && !isUuid(line.sizeId)) || typeof line.quantity !== 'number'
          || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 10000
          || (line.unitPriceMad !== undefined && line.unitPriceMad !== null
            && (typeof line.unitPriceMad !== 'number' || !Number.isFinite(line.unitPriceMad) || line.unitPriceMad < 0 || line.unitPriceMad > 1_000_000))
        ) {
          return fail('Check the order lines.', 400);
        }
        let itemId = isUuid(line.itemId) ? line.itemId : '';
        if (!itemId) {
          const resolved = await ensureSizeStockItem(supabase, identity.workspaceId, line.sizeId as string);
          if ('error' in resolved) return fail(resolved.error, resolved.status);
          itemId = resolved.itemId;
        }
        lines.push({
          itemId,
          quantity: line.quantity,
          ...(typeof line.unitPriceMad === 'number' ? { unitPriceMad: line.unitPriceMad } : {}),
        });
      }
      const { data, error } = await supabase.rpc('erp_create_sales_order', {
        p_client_id: body.clientId,
        p_lines: lines,
        p_requested_delivery_date: date,
        p_priority: priority,
        p_notes: notes,
        p_idempotency_key: body.idempotencyKey,
      });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ orderId: data }, { status: 201, headers: NO_STORE });
    }

    if (body.action === 'confirm') {
      if (!isUuid(body.orderId)) return fail('Invalid order.', 400);
      const { error } = await supabase.rpc('erp_confirm_sales_order', { p_order_id: body.orderId, p_allow_partial: body.partial === true });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }

    if (body.action === 'reserve') {
      if (!isUuid(body.orderId)) return fail('Invalid order.', 400);
      const { data, error } = await supabase.rpc('erp_reserve_order_remaining', { p_order_id: body.orderId });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ ok: true, shortages: data ?? [] }, { headers: NO_STORE });
    }

    if (body.action === 'cancel') {
      if (!isUuid(body.orderId) || typeof body.reason !== 'string') return fail('Invalid cancellation.', 400);
      const { error } = await supabase.rpc('erp_cancel_sales_order', { p_order_id: body.orderId, p_reason: body.reason });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }

    if (body.action === 'assign') {
      const priority = parsePriority(body.priority);
      const date = parseOptionalDate(body.requestedDeliveryDate);
      const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
      const driverId = body.driverId === null || body.driverId === undefined || body.driverId === '' ? null : body.driverId;
      if (!isUuid(body.orderId) || priority === null || date === undefined || notes.length > 1000 || (driverId !== null && !isUuid(driverId))) {
        return fail('Check the driver, date, and priority.', 400);
      }
      const { error } = await supabase.rpc('erp_update_sales_order_dispatch', {
        p_order_id: body.orderId,
        p_driver_id: driverId,
        p_requested_delivery_date: date,
        p_priority: priority,
        p_notes: notes,
      });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }

    if (body.action === 'set_client_driver') {
      const driverId = body.driverId === null || body.driverId === undefined || body.driverId === '' ? null : body.driverId;
      if (!isUuid(body.clientId) || (driverId !== null && !isUuid(driverId))) return fail('Invalid driver assignment.', 400);
      const { error } = await supabase.rpc('erp_set_client_driver', { p_client_id: body.clientId, p_driver_id: driverId });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }

    return fail('Unknown order action.', 400);
  } catch (error) {
    return authErrorResponse(error);
  }
}
