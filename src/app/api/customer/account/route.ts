import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/api/operations';
import { getVerifiedCustomerUser } from '@/lib/auth/customer';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const num = (value: unknown) => Number(value ?? 0) || 0;
const money = (value: number) => Math.round(value * 100) / 100;

// Read-only statement for the signed-in store: invoices, payments, credits and balance.
export async function GET(request: NextRequest) {
  const user = await getVerifiedCustomerUser();
  if (!user) return NextResponse.json({ error: 'Customer sign-in required.' }, { status: 401 });
  const clientId = request.nextUrl.searchParams.get('clientId');
  if (!isUuid(clientId)) return NextResponse.json({ error: 'Choose a store account.' }, { status: 400 });

  try {
    const admin = getSupabaseAdminClient();
    const { data: membership, error: membershipError } = await admin
      .from('erp_customer_memberships')
      .select('workspace_id, client_id')
      .eq('user_id', user.id)
      .eq('client_id', clientId)
      .eq('is_active', true)
      .maybeSingle();
    if (membershipError) return NextResponse.json({ error: 'Could not verify store access.' }, { status: 503 });
    if (!membership) return NextResponse.json({ error: 'Store account is not available.' }, { status: 403 });

    const { data, error } = await admin
      .from('erp_invoices')
      .select('id, document_number, total_mad, issued_at, due_date, erp_payments(amount_mad), erp_invoice_adjustments(amount_mad, kind, description)')
      .eq('workspace_id', membership.workspace_id)
      .eq('client_id', membership.client_id)
      .order('issued_at', { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: 'Could not load your account.' }, { status: 503 });

    const today = new Date().toISOString().slice(0, 10);
    const invoices = (data ?? []).map((invoice) => {
      const paid = (invoice.erp_payments ?? []).reduce((sum, payment) => sum + num(payment.amount_mad), 0);
      const adjustments = (invoice.erp_invoice_adjustments ?? []).reduce((sum, row) => sum + num(row.amount_mad), 0);
      const balance = money(num(invoice.total_mad) + adjustments - paid);
      return {
        id: invoice.id,
        documentNumber: invoice.document_number,
        issuedAt: invoice.issued_at,
        dueDate: invoice.due_date,
        totalMad: money(num(invoice.total_mad)),
        paidMad: money(paid),
        adjustmentsMad: money(adjustments),
        balanceMad: balance,
        overdue: balance > 0 && Boolean(invoice.due_date) && String(invoice.due_date) < today,
        adjustments: (invoice.erp_invoice_adjustments ?? []).map((row) => ({ kind: row.kind, amountMad: money(num(row.amount_mad)), description: row.description })),
      };
    });
    const balanceMad = money(invoices.reduce((sum, invoice) => sum + invoice.balanceMad, 0));
    return NextResponse.json({
      invoices,
      balanceMad,
      dueMad: money(invoices.reduce((sum, invoice) => sum + Math.max(invoice.balanceMad, 0), 0)),
      overdueMad: money(invoices.filter((invoice) => invoice.overdue).reduce((sum, invoice) => sum + invoice.balanceMad, 0)),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Your account is unavailable.' }, { status: 503 });
  }
}
