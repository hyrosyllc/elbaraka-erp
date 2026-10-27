import { NextResponse } from 'next/server';
import { getVerifiedCustomerUser } from '@/lib/auth/customer';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getVerifiedCustomerUser();
  if (!user) return NextResponse.json({ error: 'Customer sign-in required.' }, { status: 401 });

  try {
    const admin = getSupabaseAdminClient();
    const { data: memberships, error } = await admin
      .from('erp_customer_memberships')
      .select('workspace_id, client_id, full_name')
      .eq('user_id', user.id)
      .eq('is_active', true);
    if (error) return NextResponse.json({ error: 'Could not load customer accounts.' }, { status: 503 });
    if (!memberships?.length) return NextResponse.json({ error: 'No active store account is linked.' }, { status: 403 });

    const clientIds = [...new Set(memberships.map((membership) => membership.client_id))];
    const { data: clients, error: clientsError } = await admin
      .from('erp_clients')
      .select('id, name, name_ar, city')
      .in('id', clientIds)
      .eq('is_active', true);
    if (clientsError) return NextResponse.json({ error: 'Could not load customer store details.' }, { status: 503 });

    const clientById = new Map((clients ?? []).map((client) => [client.id, client]));
    const accounts = memberships.flatMap((membership) => {
      const client = clientById.get(membership.client_id);
      return client ? [{
        workspaceId: membership.workspace_id,
        clientId: client.id,
        clientName: client.name,
        clientNameAr: client.name_ar,
        city: client.city,
        fullName: membership.full_name,
      }] : [];
    });
    if (!accounts.length) return NextResponse.json({ error: 'No active store account is linked.' }, { status: 403 });

    return NextResponse.json(
      { accounts, email: user.email },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Customer account service is unavailable.' }, { status: 503 });
  }
}
