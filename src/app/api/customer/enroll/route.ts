import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedCustomerUser } from '@/lib/auth/customer';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function clearInviteCookies(response: NextResponse) {
  for (const name of [
    'elbaraka_customer_invite_hash',
    'elbaraka_customer_invite_email',
    'elbaraka_customer_invite_name',
  ]) {
    response.cookies.set(name, '', { path: '/', maxAge: 0 });
  }
  return response;
}

export async function POST(request: NextRequest) {
  const user = await getVerifiedCustomerUser();
  if (!user) return NextResponse.json({ error: 'Verify your email before joining a store.' }, { status: 401 });

  const tokenHash = request.cookies.get('elbaraka_customer_invite_hash')?.value ?? '';
  const invitedEmail = request.cookies.get('elbaraka_customer_invite_email')?.value ?? '';
  const fullName = request.cookies.get('elbaraka_customer_invite_name')?.value ?? '';
  if (!/^[0-9a-f]{64}$/.test(tokenHash) || !invitedEmail || !fullName) {
    return NextResponse.json({ error: 'Invitation details expired. Start again with your store code.' }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.rpc('erp_redeem_customer_invite', {
      p_token_hash: tokenHash,
      p_user_id: user.id,
      p_email: invitedEmail,
      p_full_name: fullName,
    });
    if (error || !data) {
      return NextResponse.json(
        { error: 'This invitation could not be redeemed. Check its status or ask the store manager for a new code.' },
        { status: 400 },
      );
    }

    return clearInviteCookies(NextResponse.json(
      { membership: data },
      { headers: { 'Cache-Control': 'private, no-store' } },
    ));
  } catch {
    return NextResponse.json({ error: 'Customer account enrollment is unavailable.' }, { status: 503 });
  }
}
