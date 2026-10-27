import { NextResponse } from 'next/server';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return NextResponse.json({ error: 'Sign-in required.' }, { status: 401 });
  if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: 'Workspace access is not active.' }, { status: 403 });
  return NextResponse.json({ error: 'Inventory service is unavailable.' }, { status: 503 });
}

export async function GET() {
  try {
    const identity = await getWorkspaceIdentity();
    const supabase = await getSupabaseServerClient();
    const [balancesResult, movementsResult] = await Promise.all([
      supabase
        .from('inventory_location_stock_balances')
        .select('workspace_id, item_id, sku, name, item_type, base_unit, reorder_point, is_active, location_id, location_name, location_type, on_hand, reserved, quarantined, available')
        .eq('workspace_id', identity.workspaceId)
        .order('sku')
        .order('location_name'),
      supabase
        .from('inventory_movements')
        .select('id, item_id, location_id, movement_type, quantity_delta, reference_type, reference_id, recorded_at')
        .eq('workspace_id', identity.workspaceId)
        .order('recorded_at', { ascending: false })
        .limit(25),
    ]);

    if (balancesResult.error || movementsResult.error) {
      return NextResponse.json({ error: 'Could not load live inventory balances.' }, { status: 503 });
    }

    return NextResponse.json(
      { balances: balancesResult.data ?? [], movements: movementsResult.data ?? [] },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
