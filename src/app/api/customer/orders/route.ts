import { ensureSizeStockItem } from '@/lib/api/ensureStockItem';
import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedCustomerUser } from '@/lib/auth/customer';
import { isRecord, isUuid, readJsonBody } from '@/lib/api/operations';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

async function findMembership(userId: string, clientId: string) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('erp_customer_memberships')
    .select('workspace_id, client_id')
    .eq('user_id', userId)
    .eq('client_id', clientId)
    .eq('is_active', true)
    .maybeSingle();
  return { membership: data, error };
}

export async function GET(request: NextRequest) {
  const user = await getVerifiedCustomerUser();
  if (!user) return NextResponse.json({ error: 'Customer sign-in required.' }, { status: 401 });
  const clientId = request.nextUrl.searchParams.get('clientId');
  if (!isUuid(clientId)) return NextResponse.json({ error: 'Choose a store account.' }, { status: 400 });

  try {
    const { membership, error: membershipError } = await findMembership(user.id, clientId);
    if (membershipError) return NextResponse.json({ error: 'Could not verify store access.' }, { status: 503 });
    if (!membership) return NextResponse.json({ error: 'Store account is not available.' }, { status: 403 });

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('erp_sales_orders')
      .select('id, document_number, status, created_at, erp_sales_order_lines(id, sku_snapshot, name_snapshot, quantity, unit_price_mad)')
      .eq('workspace_id', membership.workspace_id)
      .eq('client_id', membership.client_id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: 'Could not load order history.' }, { status: 503 });

    return NextResponse.json(
      { orders: data ?? [] },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Order history is unavailable.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getVerifiedCustomerUser();
  if (!user) return NextResponse.json({ error: 'Customer sign-in required.' }, { status: 401 });

  const parsed = await readJsonBody(request, 16_384);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: parsed.status ?? 400 });
  if (!isRecord(parsed.body) || !isUuid(parsed.body.clientId) || !isUuid(parsed.body.idempotencyKey)
    || !Array.isArray(parsed.body.lines) || parsed.body.lines.length < 1 || parsed.body.lines.length > 50) {
    return NextResponse.json({ error: 'Review the order and try again.' }, { status: 400 });
  }

  const lines: { sizeId: string; quantity: number }[] = [];
  const seenSizeIds = new Set<string>();
  for (const value of parsed.body.lines) {
    if (!isRecord(value) || !isUuid(value.sizeId) || !Number.isInteger(value.quantity)
      || (value.quantity as number) < 1 || (value.quantity as number) > 10_000
      || seenSizeIds.has(value.sizeId)) {
      return NextResponse.json({ error: 'Each item needs a valid quantity.' }, { status: 400 });
    }
    seenSizeIds.add(value.sizeId);
    lines.push({ sizeId: value.sizeId, quantity: value.quantity as number });
  }

  try {
    const { membership, error: membershipError } = await findMembership(user.id, parsed.body.clientId);
    if (membershipError) return NextResponse.json({ error: 'Could not verify store access.' }, { status: 503 });
    if (!membership) return NextResponse.json({ error: 'Store account is not available.' }, { status: 403 });

    const admin = getSupabaseAdminClient();
    for (const line of lines) {
      const ensured = await ensureSizeStockItem(admin, membership.workspace_id, line.sizeId, 'direct');
      if ('error' in ensured) return NextResponse.json({ error: 'One of the products is not available right now.' }, { status: 409 });
    }
    const { data, error } = await admin.rpc('erp_submit_customer_order', {
      p_user_id: user.id,
      p_workspace_id: membership.workspace_id,
      p_client_id: membership.client_id,
      p_idempotency_key: parsed.body.idempotencyKey,
      p_lines: lines,
    });
    if (error || !data) {
      return NextResponse.json(
        { error: 'The order could not be placed. Refresh the catalog and try again.' },
        { status: 409 },
      );
    }

    return NextResponse.json({ order: data }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Order service is unavailable.' }, { status: 503 });
  }
}
