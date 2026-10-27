import { NextRequest, NextResponse } from 'next/server';
import { isDateString, isRecord, isUuid, readJsonBody } from '@/lib/api/operations';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const METHODS = ['cash', 'bank_transfer', 'card', 'cheque', 'other'];

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return fail('Sign-in required.', 401);
  if (error instanceof WorkspaceAccessError) return fail('Workspace access is not active.', 403);
  return fail('Invoice service is unavailable.', 503);
}

const RPC_MESSAGES: Record<string, string> = {
  delivery_note_not_delivered: 'Only delivered notes can be invoiced.',
  invoice_already_issued: 'This delivery note already has an invoice.',
  invalid_tax_rate: 'Tax rate must be between 0 and 100.',
  invalid_payment_amount: 'Enter an amount in dirhams with at most two decimals.',
  invalid_payment_method: 'Choose a valid payment method.',
  payment_exceeds_balance: 'The payment is more than the balance due.',
};

function rpcErrorResponse(error: { code?: string; message?: string } | null) {
  if (error?.code === '42501') return fail('You do not have permission for this action.', 403);
  if (error?.code === 'P0002') return fail('The requested record was not found.', 404);
  if (error?.code === '23505') return fail('A record with the same identifier already exists.', 409);
  if (error?.code === 'P0001' || error?.code?.startsWith('22')) return fail(RPC_MESSAGES[error.message ?? ''] ?? 'The details are invalid.', 400);
  if (error?.code) console.error('Invoice transaction failed', { code: error.code });
  return fail('The invoice transaction could not be completed.', 503);
}

function money(value: number | string) {
  return Math.round(Number(value) * 100) / 100;
}

export async function GET() {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager') return fail('Manager access required.', 403);
    const supabase = await getSupabaseServerClient();

    const [invoicesResult, notesResult] = await Promise.all([
      supabase
        .from('erp_invoices')
        .select('id, document_number, delivery_note_id, client_id, client_name_snapshot, subtotal_mad, tax_mad, total_mad, tax_rate_percent, issued_at, due_date, erp_payments(id, amount_mad, payment_method, paid_at, reference)')
        .eq('workspace_id', identity.workspaceId)
        .order('issued_at', { ascending: false })
        .limit(300),
      supabase
        .from('erp_delivery_notes')
        .select('id, document_number, client_name_snapshot, delivered_at, erp_delivery_note_lines(quantity, unit_price_mad)')
        .eq('workspace_id', identity.workspaceId)
        .eq('status', 'delivered')
        .order('delivered_at', { ascending: false })
        .limit(300),
    ]);
    if (invoicesResult.error || notesResult.error) return fail('Could not load invoices.', 503);

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Casablanca' });
    const invoices = (invoicesResult.data ?? []).map((row) => {
      const payments = (row.erp_payments ?? []).map((payment) => ({
        id: payment.id,
        amountMad: money(payment.amount_mad),
        method: payment.payment_method,
        paidAt: payment.paid_at,
        reference: payment.reference,
      }));
      const paidMad = money(payments.reduce((sum, payment) => sum + payment.amountMad, 0));
      const totalMad = money(row.total_mad);
      const balanceMad = money(totalMad - paidMad);
      const status = balanceMad <= 0 ? 'paid' : paidMad > 0 ? 'partial' : 'unpaid';
      return {
        id: row.id,
        documentNumber: row.document_number,
        deliveryNoteId: row.delivery_note_id,
        clientId: row.client_id,
        clientName: row.client_name_snapshot,
        subtotalMad: money(row.subtotal_mad),
        taxMad: money(row.tax_mad),
        taxRatePercent: Number(row.tax_rate_percent),
        totalMad,
        paidMad,
        balanceMad,
        status,
        overdue: balanceMad > 0 && row.due_date !== null && row.due_date < today,
        issuedAt: row.issued_at,
        dueDate: row.due_date,
        payments,
      };
    });

    const invoicedNotes = new Set(invoices.map((invoice) => invoice.deliveryNoteId));
    const unbilled = (notesResult.data ?? [])
      .filter((note) => !invoicedNotes.has(note.id))
      .map((note) => ({
        id: note.id,
        documentNumber: note.document_number,
        clientName: note.client_name_snapshot,
        deliveredAt: note.delivered_at,
        subtotalMad: money((note.erp_delivery_note_lines ?? []).reduce((sum, line) => sum + line.quantity * Number(line.unit_price_mad), 0)),
      }));

    return NextResponse.json({ invoices, unbilled }, { headers: NO_STORE });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager') return fail('Manager access required.', 403);

    const parsed = await readJsonBody(request);
    if (parsed.error) return fail(parsed.error, parsed.status ?? 400);
    const body = parsed.body;
    if (!isRecord(body) || !isUuid(body.idempotencyKey)) return fail('Invalid request.', 400);
    const supabase = await getSupabaseServerClient();

    if (body.action === 'issue') {
      if (!isUuid(body.noteId) || typeof body.taxRatePercent !== 'number') return fail('Invalid invoice request.', 400);
      if (body.dueDate !== null && body.dueDate !== undefined && !isDateString(body.dueDate)) return fail('Invalid due date.', 400);
      const { data, error } = await supabase.rpc('erp_issue_invoice', {
        p_note_id: body.noteId,
        p_tax_rate_percent: body.taxRatePercent,
        p_due_date: body.dueDate ?? null,
        p_idempotency_key: body.idempotencyKey,
      });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ invoiceId: data }, { status: 201, headers: NO_STORE });
    }

    if (body.action === 'pay') {
      if (!isUuid(body.invoiceId) || typeof body.amountMad !== 'number' || typeof body.method !== 'string' || !METHODS.includes(body.method)) {
        return fail('Invalid payment request.', 400);
      }
      const reference = typeof body.reference === 'string' ? body.reference.slice(0, 120) : '';
      const { data, error } = await supabase.rpc('erp_record_payment', {
        p_invoice_id: body.invoiceId,
        p_amount_mad: body.amountMad,
        p_method: body.method,
        p_paid_at: null,
        p_reference: reference,
        p_idempotency_key: body.idempotencyKey,
      });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ paymentId: data }, { status: 201, headers: NO_STORE });
    }

    return fail('Unknown invoice action.', 400);
  } catch (error) {
    return authErrorResponse(error);
  }
}
