import { NextRequest, NextResponse } from 'next/server';
import { isRecord, readJsonBody } from '@/lib/api/operations';
import { hashCustomerInvite, isCustomerInviteCode } from '@/lib/customer/invites';
import { getVerifiedCustomerUser } from '@/lib/auth/customer';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await getVerifiedCustomerUser();
  if (!user) return NextResponse.json({ error: 'Verify your email before joining a store.' }, { status: 401 });

  const parsed = await readJsonBody(request, 4096);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: parsed.status ?? 400 });
  if (!isRecord(parsed.body) || !isCustomerInviteCode(parsed.body.code)
    || typeof parsed.body.fullName !== 'string'
    || parsed.body.fullName.trim().length < 1
    || parsed.body.fullName.trim().length > 120
    || !user.email) {
    return NextResponse.json({ error: 'Enter your name and a valid store invitation.' }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.rpc('erp_redeem_customer_invite', {
      p_token_hash: hashCustomerInvite(parsed.body.code),
      p_user_id: user.id,
      p_email: user.email,
      p_full_name: parsed.body.fullName.trim(),
    });
    if (error || !data) {
      return NextResponse.json(
        { error: 'This invitation could not be redeemed. Check its status or ask the store manager for a new code.' },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { membership: data },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Customer account enrollment is unavailable.' }, { status: 503 });
  }
}
