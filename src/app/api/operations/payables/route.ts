import { NextRequest, NextResponse } from 'next/server';
import { isRecord, isUuid, readJsonBody } from '@/lib/api/operations';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'private, no-store' };
const METHODS = ['cash', 'bank_transfer', 'card', 'cheque', 'other'];
const num = (value: unknown) => Number(value ?? 0) || 0;
const money = (value: number) => Math.round(value * 100) / 100;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return fail('Sign-in required.', 401);
  if (error instanceof WorkspaceAccessError) return fail('Workspace access is not active.', 403);
  return fail('Payables service is unavailable.', 503);
}

const RPC_MESSAGES: Record<string, string> = {
  invalid_payment_amount: 'Enter an amount in dirhams with at most two decimals.',
  invalid_payment_method: 'Choose a valid payment method.',
  payment_exceeds_payable: 'The payment is more than the value received and not yet paid.',
};

export async function GET() {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager' && identity.role !== 'purchasing') return fail('Purchasing access required.', 403);
    const supabase = await getSupabaseServerClient();

    const [suppliers, lines, payments] = await Promise.all([
      supabase.from('erp_suppliers').select('id, name').eq('workspace_id', identity.workspaceId).order('name').limit(500),
      supabase.from('erp_purchase_receipt_lines')
        .select('quantity, unit_cost_mad, erp_purchase_receipts!inner(created_at, purchase_order_id, erp_purchase_orders!inner(supplier_id))')
        .eq('workspace_id', identity.workspaceId).limit(10_000),
      supabase.from('erp_supplier_payments')
        .select('id, supplier_id, amount_mad, payment_method, paid_at, reference')
        .eq('workspace_id', identity.workspaceId).order('paid_at', { ascending: false }).limit(2000),
    ]);
    if (suppliers.error || lines.error || payments.error) return fail('Could not load payables.', 503);

    type Receipt = { created_at: string; erp_purchase_orders: { supplier_id: string } | { supplier_id: string }[] };
    const received = new Map<string, { value: number; last: string | null }>();
    for (const line of (lines.data ?? []) as unknown as { quantity: number; unit_cost_mad: number; erp_purchase_receipts: Receipt | Receipt[] }[]) {
      const receipt = Array.isArray(line.erp_purchase_receipts) ? line.erp_purchase_receipts[0] : line.erp_purchase_receipts;
      const order = Array.isArray(receipt?.erp_purchase_orders) ? receipt.erp_purchase_orders[0] : receipt?.erp_purchase_orders;
      if (!order) continue;
      const entry = received.get(order.supplier_id) ?? { value: 0, last: null };
      entry.value += num(line.quantity) * num(line.unit_cost_mad);
      if (!entry.last || receipt.created_at > entry.last) entry.last = receipt.created_at;
      received.set(order.supplier_id, entry);
    }
    const paid = new Map<string, number>();
    for (const payment of payments.data ?? []) paid.set(payment.supplier_id, (paid.get(payment.supplier_id) ?? 0) + num(payment.amount_mad));

    const rows = (suppliers.data ?? []).map((supplier) => {
      const receivedMad = money(received.get(supplier.id)?.value ?? 0);
      const paidMad = money(paid.get(supplier.id) ?? 0);
      return {
        supplierId: supplier.id, name: supplier.name, receivedMad, paidMad, outstandingMad: money(receivedMad - paidMad),
        lastReceiptAt: received.get(supplier.id)?.last ?? null,
        lastPaymentAt: (payments.data ?? []).find((payment) => payment.supplier_id === supplier.id)?.paid_at ?? null,
      };
    }).filter((row) => row.receivedMad > 0 || row.paidMad > 0);

    return NextResponse.json({
      suppliers: rows.sort((a, b) => b.outstandingMad - a.outstandingMad),
      totalOutstandingMad: money(rows.reduce((sum, row) => sum + row.outstandingMad, 0)),
      payments: (payments.data ?? []).slice(0, 30).map((payment) => ({ id: payment.id, supplierId: payment.supplier_id, amountMad: num(payment.amount_mad), method: payment.payment_method, paidAt: payment.paid_at, reference: payment.reference })),
      canPay: identity.role === 'manager',
    }, { headers: NO_STORE });
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
    if (!isRecord(body) || body.action !== 'pay' || !isUuid(body.supplierId) || !isUuid(body.idempotencyKey)
      || typeof body.amountMad !== 'number' || typeof body.method !== 'string' || !METHODS.includes(body.method)) {
      return fail('Invalid payment request.', 400);
    }
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc('erp_record_supplier_payment', {
      p_supplier_id: body.supplierId,
      p_purchase_order_id: null,
      p_amount_mad: body.amountMad,
      p_method: body.method,
      p_reference: typeof body.reference === 'string' ? body.reference.slice(0, 120) : '',
      p_idempotency_key: body.idempotencyKey,
    });
    if (error) {
      if (error.code === '42501') return fail('You do not have permission for this action.', 403);
      if (error.code === 'P0002') return fail('The supplier was not found.', 404);
      if (error.code === 'P0001') return fail(RPC_MESSAGES[error.message] ?? 'The payment is invalid.', 400);
      return fail('The payment could not be saved.', 503);
    }
    return NextResponse.json({ paymentId: data }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return authErrorResponse(error);
  }
}
