import { NextResponse } from 'next/server';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { loadItemAvailability, rawGapsFor } from '@/lib/api/stockAvailability';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'private, no-store' };

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

// Draft orders reserve nothing until confirmed, so their demand is what stock may not cover.
export async function GET() {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager' && identity.role !== 'purchasing') return fail('Stock access required.', 403);
    const supabase = await getSupabaseServerClient();

    const lines = await supabase
      .from('erp_sales_order_lines')
      .select('item_id, sku_snapshot, name_snapshot, quantity, order_id, erp_sales_orders!inner(status, document_number)')
      .eq('workspace_id', identity.workspaceId)
      .eq('erp_sales_orders.status', 'draft')
      .limit(2000);
    if (lines.error) return fail('Could not load stock needs.', 503);

    const demand = new Map<string, { sku: string; name: string; ordered: number; orders: Set<string> }>();
    for (const line of (lines.data ?? []) as unknown as { item_id: string; sku_snapshot: string; name_snapshot: string; quantity: number; erp_sales_orders: { document_number: string } | { document_number: string }[] }[]) {
      const order = Array.isArray(line.erp_sales_orders) ? line.erp_sales_orders[0] : line.erp_sales_orders;
      const entry = demand.get(line.item_id) ?? { sku: line.sku_snapshot, name: line.name_snapshot, ordered: 0, orders: new Set<string>() };
      entry.ordered += line.quantity;
      if (order) entry.orders.add(order.document_number);
      demand.set(line.item_id, entry);
    }

    const availability = await loadItemAvailability(supabase, identity.workspaceId, [...demand.keys()]);
    const needs = [...demand.entries()].flatMap(([itemId, entry]) => {
      const available = Math.max(0, availability.get(itemId)?.available ?? 0);
      const short = entry.ordered - available;
      if (short <= 0) return [];
      const { state, gaps } = rawGapsFor(availability.get(itemId), short);
      return [{ itemId, sku: entry.sku, name: entry.name, ordered: entry.ordered, available, short, orders: [...entry.orders], state, rawGaps: gaps }];
    }).sort((a, b) => b.short - a.short);

    return NextResponse.json({ needs }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof AuthRequiredError) return fail('Sign-in required.', 401);
    if (error instanceof WorkspaceAccessError) return fail('Workspace access is not active.', 403);
    return fail('Could not load stock needs.', 503);
  }
}
