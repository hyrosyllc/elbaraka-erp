import { NextRequest, NextResponse } from 'next/server';
import { isDateString, isRecord, isUuid, readJsonBody } from '@/lib/api/operations';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { loadOrderProducts, type OrderProduct } from '@/lib/api/stockAvailability';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return fail('Sign-in required.', 401);
  if (error instanceof WorkspaceAccessError) return fail('Workspace access is not active.', 403);
  return fail('Client account service is unavailable.', 503);
}

const RPC_MESSAGES: Record<string, string> = {
  invalid_note_kind: 'Choose a valid note type.',
  note_required: 'Write the note first.',
  promised_date_required: 'Pick the date the client promised to pay.',
};

function rpcErrorResponse(error: { code?: string; message?: string } | null) {
  if (error?.code === '42501') return fail('You do not have permission for this action.', 403);
  if (error?.code === 'P0002') return fail('The requested record was not found.', 404);
  if (error?.code === 'P0001' || error?.code?.startsWith('22')) return fail(RPC_MESSAGES[error.message ?? ''] ?? 'The details are invalid.', 400);
  if (error?.code) console.error('Client note transaction failed', { code: error.code });
  return fail('The client note could not be saved.', 503);
}

function money(value: number | string) {
  return Math.round(Number(value) * 100) / 100;
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return fail('Invalid client id.', 400);
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager') return fail('Manager access required.', 403);
    const supabase = await getSupabaseServerClient();
    const workspaceId = identity.workspaceId;

    const clientResult = await supabase
      .from('erp_clients')
      .select('id, code, name, name_ar, contact_name, phone, address, city, is_active, created_at')
      .eq('workspace_id', workspaceId)
      .eq('id', id)
      .maybeSingle();
    if (clientResult.error) return fail('Could not load the client.', 503);
    if (!clientResult.data) return fail('The requested record was not found.', 404);

    const [invoicesResult, ordersResult, notesResult, returnsResult, deliveriesResult, sizesResult] = await Promise.all([
      supabase
        .from('erp_invoices')
        .select('id, document_number, delivery_note_id, total_mad, issued_at, due_date, erp_payments(id, amount_mad, payment_method, paid_at, reference), erp_invoice_adjustments(id, kind, amount_mad, description, created_at)')
        .eq('workspace_id', workspaceId)
        .eq('client_id', id)
        .order('issued_at', { ascending: false })
        .limit(200),
      supabase
        .from('erp_sales_orders')
        .select('id, document_number, status, created_at, erp_sales_order_lines(id, sku_snapshot, name_snapshot, quantity, unit_price_mad)')
        .eq('workspace_id', workspaceId)
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('erp_client_notes')
        .select('id, invoice_id, kind, note, promised_date, is_resolved, resolved_at, created_at')
        .eq('workspace_id', workspaceId)
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('erp_customer_returns')
        .select('id, document_number, status, reason, created_at, erp_customer_return_lines(delivery_line_id, quantity)')
        .eq('workspace_id', workspaceId)
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('erp_delivery_notes')
        .select('id, document_number, order_id, status, delivered_at, created_at, erp_delivery_note_lines(id, order_line_id, quantity, sku_snapshot, name_snapshot)')
        .eq('workspace_id', workspaceId)
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(300),
      loadOrderProducts(supabase, workspaceId).then((data) => ({ data, error: null })).catch(() => ({ data: [] as OrderProduct[], error: { code: 'products' } })),
    ]);
    if (sizesResult.error || ordersResult.error || notesResult.error || returnsResult.error || deliveriesResult.error) {
      return fail('Could not load the client account.', 503);
    }

    const products = sizesResult.data;

    const returnedByLine = new Map<string, number>();
    for (const entry of returnsResult.data ?? []) {
      if (entry.status === 'rejected') continue;
      for (const line of entry.erp_customer_return_lines ?? []) {
        if (line.delivery_line_id) returnedByLine.set(line.delivery_line_id, (returnedByLine.get(line.delivery_line_id) ?? 0) + line.quantity);
      }
    }
    const invoicedNotes = new Set((invoicesResult.data ?? []).map((row) => row.delivery_note_id));

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Casablanca' });

    const invoices = (invoicesResult.data ?? []).map((row) => {
      const payments = (row.erp_payments ?? []).map((payment) => ({
        id: payment.id,
        amountMad: money(payment.amount_mad),
        method: payment.payment_method,
        paidAt: payment.paid_at,
        reference: payment.reference,
      }));
      const adjustments = (row.erp_invoice_adjustments ?? []).map((adjustment) => ({
        id: adjustment.id,
        kind: adjustment.kind,
        amountMad: money(adjustment.amount_mad),
        description: adjustment.description,
        createdAt: adjustment.created_at,
      }));
      const totalMad = money(row.total_mad);
      const adjustmentMad = money(adjustments.reduce((sum, entry) => sum + entry.amountMad, 0));
      const paidMad = money(payments.reduce((sum, entry) => sum + entry.amountMad, 0));
      const rawBalance = money(totalMad + adjustmentMad - paidMad);
      const balanceMad = Math.max(0, rawBalance);
      return {
        id: row.id,
        documentNumber: row.document_number,
        issuedAt: row.issued_at,
        dueDate: row.due_date,
        totalMad,
        adjustmentMad,
        netMad: money(totalMad + adjustmentMad),
        paidMad,
        balanceMad,
        creditMad: Math.max(0, -rawBalance),
        status: balanceMad <= 0 ? 'paid' : paidMad > 0 ? 'partial' : 'unpaid',
        overdue: balanceMad > 0 && Boolean(row.due_date) && String(row.due_date) < today,
        payments,
        adjustments,
      };
    });

    // Quantity still to ship = ordered − what active delivery notes already carry.
    const shippedByLine = new Map<string, number>();
    for (const note of deliveriesResult.data ?? []) {
      if (note.status === 'failed') continue;
      for (const line of note.erp_delivery_note_lines ?? []) {
        if (!line.order_line_id) continue;
        shippedByLine.set(line.order_line_id, (shippedByLine.get(line.order_line_id) ?? 0) + line.quantity);
      }
    }
    const toShip: { orderId: string; orderNumber: string; sku: string; name: string; remaining: number; valueMad: number }[] = [];
    const orders = (ordersResult.data ?? []).map((order) => {
      const open = order.status === 'confirmed' || order.status === 'part_delivered';
      let remainingUnits = 0;
      for (const line of order.erp_sales_order_lines ?? []) {
        const remaining = line.quantity - (shippedByLine.get(line.id) ?? 0);
        if (open && remaining > 0) {
          remainingUnits += remaining;
          toShip.push({
            orderId: order.id,
            orderNumber: order.document_number,
            sku: line.sku_snapshot,
            name: line.name_snapshot,
            remaining,
            valueMad: money(remaining * Number(line.unit_price_mad)),
          });
        }
      }
      return { id: order.id, documentNumber: order.document_number, status: order.status, createdAt: order.created_at, remainingUnits };
    });

    const notes = (notesResult.data ?? []).map((note) => ({
      id: note.id,
      invoiceId: note.invoice_id,
      kind: note.kind,
      note: note.note,
      promisedDate: note.promised_date,
      isResolved: note.is_resolved,
      createdAt: note.created_at,
      overdue: note.kind === 'promise_to_pay' && !note.is_resolved && Boolean(note.promised_date) && String(note.promised_date) < today,
    }));

    const summary = {
      invoicedMad: money(invoices.reduce((sum, entry) => sum + entry.totalMad, 0)),
      adjustmentMad: money(invoices.reduce((sum, entry) => sum + entry.adjustmentMad, 0)),
      paidMad: money(invoices.reduce((sum, entry) => sum + entry.paidMad, 0)),
      outstandingMad: money(invoices.reduce((sum, entry) => sum + entry.balanceMad, 0)),
      overdueMad: money(invoices.filter((entry) => entry.overdue).reduce((sum, entry) => sum + entry.balanceMad, 0)),
      creditMad: money(invoices.reduce((sum, entry) => sum + entry.creditMad, 0)),
      returnedMad: money(
        -invoices.reduce((sum, entry) => sum + entry.adjustments.filter((adj) => adj.kind === 'return_credit').reduce((s, adj) => s + adj.amountMad, 0), 0),
      ),
      orderCount: orders.length,
      returnCount: (returnsResult.data ?? []).length,
      toShipUnits: toShip.reduce((sum, entry) => sum + entry.remaining, 0),
    };

    return NextResponse.json(
      {
        client: {
          id: clientResult.data.id,
          code: clientResult.data.code,
          name: clientResult.data.name,
          nameAr: clientResult.data.name_ar,
          contactName: clientResult.data.contact_name,
          phone: clientResult.data.phone,
          address: clientResult.data.address,
          city: clientResult.data.city,
          isActive: clientResult.data.is_active,
        },
        summary,
        invoices,
        orders,
        toShip,
        notes,
        returns: (returnsResult.data ?? []).map((entry) => ({
          id: entry.id,
          documentNumber: entry.document_number,
          status: entry.status,
          reason: entry.reason,
          createdAt: entry.created_at,
        })),
        deliveries: (deliveriesResult.data ?? []).map((note) => ({
          id: note.id,
          documentNumber: note.document_number,
          status: note.status,
          createdAt: note.created_at,
          deliveredAt: note.delivered_at,
          orderId: note.order_id,
          invoiced: invoicedNotes.has(note.id),
          lines: (note.erp_delivery_note_lines ?? []).map((line) => ({
            id: line.id,
            sku: line.sku_snapshot,
            name: line.name_snapshot,
            quantity: line.quantity,
            returnable: Math.max(0, line.quantity - (returnedByLine.get(line.id) ?? 0)),
          })),
        })),
        products,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) return fail('Invalid client id.', 400);
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager') return fail('Manager access required.', 403);
    const parsed = await readJsonBody(request);
    if (parsed.error) return fail(parsed.error, parsed.status ?? 400);
    const body = parsed.body;
    if (!isRecord(body)) return fail('Invalid request body.', 400);
    const supabase = await getSupabaseServerClient();

    if (body.action === 'note') {
      if (typeof body.kind !== 'string' || typeof body.note !== 'string') return fail('Invalid note.', 400);
      if (body.invoiceId != null && !isUuid(body.invoiceId)) return fail('Invalid invoice.', 400);
      if (body.promisedDate != null && !isDateString(body.promisedDate)) return fail('Invalid promised date.', 400);
      const { data, error } = await supabase.rpc('erp_add_client_note', {
        p_client_id: id,
        p_invoice_id: (body.invoiceId as string | null | undefined) ?? null,
        p_kind: body.kind,
        p_note: body.note.slice(0, 500),
        p_promised_date: (body.promisedDate as string | null | undefined) ?? null,
        p_idempotency_key: isUuid(body.idempotencyKey) ? body.idempotencyKey : null,
      });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ noteId: data }, { status: 201, headers: NO_STORE });
    }

    if (body.action === 'resolveNote') {
      if (!isUuid(body.noteId)) return fail('Invalid note.', 400);
      const { error } = await supabase.rpc('erp_resolve_client_note', { p_note_id: body.noteId });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }

    return fail('Unknown client action.', 400);
  } catch (error) {
    return authErrorResponse(error);
  }
}
