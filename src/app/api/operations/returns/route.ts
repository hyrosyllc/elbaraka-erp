import { NextRequest, NextResponse } from 'next/server';
import { isRecord, isUuid, readJsonBody } from '@/lib/api/operations';
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
  return fail('Returns service is unavailable.', 503);
}

const RPC_MESSAGES: Record<string, string> = {
  delivery_note_not_delivered: 'Returns can only be recorded for delivered notes.',
  return_reason_required: 'Enter the reason for the return.',
  invalid_return_lines: 'Choose at least one item and a whole quantity.',
  return_quantity_exceeds_delivered: 'The quantity is more than was delivered and not yet returned.',
  return_not_requested: 'This return was already received.',
  return_not_in_inspection: 'Receive the return for inspection first.',
  invalid_return_decision: 'Choose release or reject.',
  shipment_record_missing: 'The original shipment record is missing, so stock cannot be released.',
};

function rpcErrorResponse(error: { code?: string; message?: string } | null) {
  if (error?.code === '42501') return fail('You do not have permission for this action.', 403);
  if (error?.code === 'P0002') return fail('The requested record was not found.', 404);
  if (error?.code === '23505') return fail('A record with the same identifier already exists.', 409);
  if (error?.code === 'P0001' || error?.code?.startsWith('22')) return fail(RPC_MESSAGES[error.message ?? ''] ?? 'The return details are invalid.', 400);
  if (error?.code) console.error('Return transaction failed', { code: error.code });
  return fail('The return transaction could not be completed.', 503);
}

export async function GET() {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager' && identity.role !== 'delivery') return fail('Delivery access required.', 403);
    const supabase = await getSupabaseServerClient();

    let allowedOrders: string[] | null = null;
    if (identity.role === 'delivery') {
      const assigned = await supabase
        .from('erp_sales_orders')
        .select('id')
        .eq('workspace_id', identity.workspaceId)
        .eq('assigned_driver_id', identity.userId)
        .limit(1000);
      if (assigned.error) return fail('Could not load returns.', 503);
      allowedOrders = (assigned.data ?? []).map((order) => order.id);
      if (allowedOrders.length === 0) return NextResponse.json({ returns: [], returnable: [], canManage: false }, { headers: NO_STORE });
    }

    let notesQuery = supabase
      .from('erp_delivery_notes')
      .select('id, document_number, client_name_snapshot, order_id, erp_delivery_note_lines(id, sku_snapshot, name_snapshot, quantity)')
      .eq('workspace_id', identity.workspaceId)
      .eq('status', 'delivered')
      .order('delivered_at', { ascending: false })
      .limit(200);
    if (allowedOrders) notesQuery = notesQuery.in('order_id', allowedOrders);
    const notesResult = await notesQuery;
    if (notesResult.error) return fail('Could not load returns.', 503);
    const notes = notesResult.data ?? [];
    const noteIds = notes.map((note) => note.id);
    if (noteIds.length === 0) return NextResponse.json({ returns: [], returnable: [], canManage: identity.role === 'manager' }, { headers: NO_STORE });

    const returnsResult = await supabase
      .from('erp_customer_returns')
      .select('id, document_number, delivery_note_id, client_name_snapshot, reason, status, resolution_note, created_at, erp_customer_return_lines(delivery_line_id, quantity, item_id)')
      .eq('workspace_id', identity.workspaceId)
      .in('delivery_note_id', noteIds)
      .order('created_at', { ascending: false })
      .limit(300);
    if (returnsResult.error) return fail('Could not load returns.', 503);

    const noteById = new Map(notes.map((note) => [note.id, note]));
    const lineById = new Map(notes.flatMap((note) => (note.erp_delivery_note_lines ?? []).map((line) => [line.id, line] as const)));
    const used = new Map<string, number>();
    const returns = (returnsResult.data ?? []).map((row) => {
      const lines = (row.erp_customer_return_lines ?? []).map((line) => {
        const source = line.delivery_line_id ? lineById.get(line.delivery_line_id) : undefined;
        if (line.delivery_line_id && row.status !== 'rejected') used.set(line.delivery_line_id, (used.get(line.delivery_line_id) ?? 0) + line.quantity);
        return { name: source?.name_snapshot ?? '', sku: source?.sku_snapshot ?? '', quantity: line.quantity };
      });
      return {
        id: row.id,
        documentNumber: row.document_number,
        noteNumber: noteById.get(row.delivery_note_id)?.document_number ?? '',
        clientName: row.client_name_snapshot,
        reason: row.reason,
        status: row.status,
        resolutionNote: row.resolution_note,
        createdAt: row.created_at,
        lines,
      };
    });

    const returnable = notes
      .map((note) => ({
        noteId: note.id,
        documentNumber: note.document_number,
        clientName: note.client_name_snapshot,
        lines: (note.erp_delivery_note_lines ?? [])
          .map((line) => ({ id: line.id, sku: line.sku_snapshot, name: line.name_snapshot, remaining: line.quantity - (used.get(line.id) ?? 0) }))
          .filter((line) => line.remaining > 0),
      }))
      .filter((note) => note.lines.length > 0);

    return NextResponse.json({ returns, returnable, canManage: identity.role === 'manager' }, { headers: NO_STORE });
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
    if (!isRecord(body) || typeof body.action !== 'string') return fail('Invalid request.', 400);
    const supabase = await getSupabaseServerClient();

    if (body.action === 'create') {
      if (!isUuid(body.noteId) || !isUuid(body.idempotencyKey) || typeof body.reason !== 'string' || !Array.isArray(body.lines)) return fail('Invalid return request.', 400);
      const { data, error } = await supabase.rpc('erp_create_customer_return', {
        p_note_id: body.noteId,
        p_reason: body.reason,
        p_lines: body.lines,
        p_idempotency_key: body.idempotencyKey,
      });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ returnId: data }, { status: 201, headers: NO_STORE });
    }

    if (identity.role !== 'manager') return fail('Manager access required.', 403);
    if (!isUuid(body.returnId)) return fail('Invalid return.', 400);

    if (body.action === 'receive') {
      const { error } = await supabase.rpc('erp_receive_customer_return', { p_return_id: body.returnId });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }
    if (body.action === 'release' || body.action === 'reject') {
      const { error } = await supabase.rpc('erp_resolve_customer_return', {
        p_return_id: body.returnId,
        p_decision: body.action,
        p_note: typeof body.note === 'string' ? body.note.slice(0, 300) : '',
      });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }

    return fail('Unknown return action.', 400);
  } catch (error) {
    return authErrorResponse(error);
  }
}
