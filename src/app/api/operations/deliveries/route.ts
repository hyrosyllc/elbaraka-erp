import { NextRequest, NextResponse } from 'next/server';
import { isRecord, isUuid, readJsonBody } from '@/lib/api/operations';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

type NoteRow = {
  id: string;
  document_number: string;
  order_id: string;
  client_id: string;
  client_name_snapshot: string;
  status: 'ready' | 'dispatched' | 'delivered' | 'failed';
  dispatched_at: string | null;
  delivered_at: string | null;
  failure_reason: string | null;
  created_at: string;
  erp_delivery_note_lines: { sku_snapshot: string; name_snapshot: string; quantity: number; unit_price_mad: number | string }[] | null;
};

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return fail('Sign-in required.', 401);
  if (error instanceof WorkspaceAccessError) return fail('Workspace access is not active.', 403);
  return fail('Delivery service is unavailable.', 503);
}

const RPC_MESSAGES: Record<string, string> = {
  sales_order_not_deliverable: 'Only confirmed orders with items left to deliver can get a delivery note.',
  nothing_to_deliver: 'Every item on this order is already on a delivery note.',
  delivery_quantity_exceeds_order: 'The delivery quantity is more than what is left on the order.',
  invalid_delivery_lines: 'Check the delivery lines.',
  reservation_missing: 'Reserved stock for this order is missing. Re-confirm the order.',
  delivery_note_not_ready: 'This delivery note is not waiting for dispatch.',
  delivery_note_not_dispatched: 'This delivery note has not been dispatched.',
  delivery_note_not_failable: 'This delivery note is already closed.',
  failure_reason_required: 'Enter the reason the delivery failed.',
};

function rpcErrorResponse(error: { code?: string; message?: string } | null) {
  if (error?.code === '42501') return fail('You do not have permission for this action.', 403);
  if (error?.code === 'P0002') return fail('The requested record was not found.', 404);
  if (error?.code === '23505') return fail('A record with the same identifier already exists.', 409);
  if (error?.code === 'P0001' || error?.code?.startsWith('22')) return fail(RPC_MESSAGES[error.message ?? ''] ?? 'The delivery details are invalid.', 400);
  if (error?.code) console.error('Delivery transaction failed', { code: error.code });
  return fail('The delivery transaction could not be completed.', 503);
}

export async function GET() {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager' && identity.role !== 'delivery') return fail('Delivery access required.', 403);

    const supabase = await getSupabaseServerClient();
    let notesQuery = supabase
      .from('erp_delivery_notes')
      .select('id, document_number, order_id, client_id, client_name_snapshot, status, dispatched_at, delivered_at, failure_reason, created_at, erp_delivery_note_lines(sku_snapshot, name_snapshot, quantity, unit_price_mad)')
      .eq('workspace_id', identity.workspaceId)
      .order('created_at', { ascending: false })
      .limit(200);

    let driverOrderIds: string[] | null = null;
    if (identity.role === 'delivery') {
      const assigned = await supabase
        .from('erp_sales_orders')
        .select('id')
        .eq('workspace_id', identity.workspaceId)
        .eq('assigned_driver_id', identity.userId)
        .limit(1000);
      if (assigned.error) return fail('Could not load delivery notes.', 503);
      driverOrderIds = (assigned.data ?? []).map((order) => order.id);
      if (driverOrderIds.length === 0) return NextResponse.json({ notes: [], canManage: false }, { headers: NO_STORE });
      notesQuery = notesQuery.in('order_id', driverOrderIds);
    }

    const notesResult = await notesQuery;
    if (notesResult.error) return fail('Could not load delivery notes.', 503);
    const rows = (notesResult.data ?? []) as unknown as NoteRow[];

    const orderIds = [...new Set(rows.map((row) => row.order_id))];
    const orderInfo = new Map<string, { documentNumber: string; driverId: string | null }>();
    if (orderIds.length > 0) {
      const ordersResult = await supabase
        .from('erp_sales_orders')
        .select('id, document_number, assigned_driver_id')
        .eq('workspace_id', identity.workspaceId)
        .in('id', orderIds);
      if (ordersResult.error) return fail('Could not load delivery notes.', 503);
      for (const order of ordersResult.data ?? []) {
        orderInfo.set(order.id, { documentNumber: order.document_number, driverId: order.assigned_driver_id });
      }
    }

    const notes = rows.map((row) => {
      const lines = (row.erp_delivery_note_lines ?? []).map((line) => ({
        sku: line.sku_snapshot,
        name: line.name_snapshot,
        quantity: line.quantity,
        unitPriceMad: Number(line.unit_price_mad),
      }));
      return {
        id: row.id,
        documentNumber: row.document_number,
        orderId: row.order_id,
        orderNumber: orderInfo.get(row.order_id)?.documentNumber ?? '',
        driverId: orderInfo.get(row.order_id)?.driverId ?? null,
        clientId: row.client_id,
        clientName: row.client_name_snapshot,
        status: row.status,
        dispatchedAt: row.dispatched_at,
        deliveredAt: row.delivered_at,
        failureReason: row.failure_reason,
        createdAt: row.created_at,
        lines,
        totalMad: lines.reduce((sum, line) => sum + line.quantity * line.unitPriceMad, 0),
      };
    });

    return NextResponse.json({ notes, canManage: identity.role === 'manager' }, { headers: NO_STORE });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager' && identity.role !== 'delivery') return fail('Delivery access required.', 403);

    const parsed = await readJsonBody(request);
    if (parsed.error) return fail(parsed.error, parsed.status ?? 400);
    const body = parsed.body;
    if (!isRecord(body) || typeof body.action !== 'string') return fail('Invalid delivery request.', 400);
    const supabase = await getSupabaseServerClient();

    if (body.action === 'create') {
      if (identity.role !== 'manager') return fail('Manager access required.', 403);
      if (!isUuid(body.orderId) || !isUuid(body.idempotencyKey)) return fail('Invalid delivery request.', 400);
      const { data, error } = await supabase.rpc('erp_create_delivery_note', {
        p_order_id: body.orderId,
        p_lines: null,
        p_idempotency_key: body.idempotencyKey,
      });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ deliveryNoteId: data }, { status: 201, headers: NO_STORE });
    }

    if (!isUuid(body.noteId)) return fail('Invalid delivery note.', 400);

    if (body.action === 'dispatch') {
      const { error } = await supabase.rpc('erp_dispatch_delivery_note', { p_note_id: body.noteId });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }
    if (body.action === 'deliver') {
      const { error } = await supabase.rpc('erp_deliver_delivery_note', { p_note_id: body.noteId });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }
    if (body.action === 'fail') {
      if (typeof body.reason !== 'string') return fail('Enter the reason the delivery failed.', 400);
      const { error } = await supabase.rpc('erp_fail_delivery_note', { p_note_id: body.noteId, p_reason: body.reason });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }

    return fail('Unknown delivery action.', 400);
  } catch (error) {
    return authErrorResponse(error);
  }
}
