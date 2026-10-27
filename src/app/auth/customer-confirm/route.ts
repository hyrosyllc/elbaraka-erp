import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isCustomerInviteCode } from '@/lib/customer/invites';

function redirectTo(request: NextRequest, error?: string) {
  const url = new URL('/', request.url);
  if (error) url.searchParams.set('customerError', error);
  return NextResponse.redirect(url);
}

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

export async function GET(request: NextRequest) {
  if (!getSupabasePublicConfig()) return redirectTo(request, 'configuration');

  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const requestedAuthType = request.nextUrl.searchParams.get('type');
  const authType = requestedAuthType === 'invite' ? 'invite'
    : requestedAuthType === 'email' ? 'email'
      : requestedAuthType === 'magiclink' ? 'magiclink'
        : requestedAuthType === 'recovery' ? 'recovery' : null;
  const inviteCode = request.nextUrl.searchParams.get('inviteCode');
  const flow = request.nextUrl.searchParams.get('flow');
  if (!tokenHash || !authType) {
    return redirectTo(request, 'confirmation');
  }

  if (flow === 'recovery') {
    try {
      const supabase = await getSupabaseServerClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
      if (error) return redirectTo(request, 'confirmation');
      return NextResponse.redirect(new URL('/customer/reset-password', request.url));
    } catch {
      return redirectTo(request, 'configuration');
    }
  }

  if (isCustomerInviteCode(inviteCode)) {
    try {
      const supabase = await getSupabaseServerClient();
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: authType,
      });
      if (error) return redirectTo(request, 'confirmation');
      const setupUrl = new URL('/customer/setup', request.url);
      setupUrl.searchParams.set('inviteCode', inviteCode);
      const inviteName = request.nextUrl.searchParams.get('inviteName')?.slice(0, 120);
      if (inviteName) setupUrl.searchParams.set('inviteName', inviteName);
      if (authType === 'magiclink') setupUrl.searchParams.set('existingAccount', '1');
      return NextResponse.redirect(setupUrl);
    } catch {
      return redirectTo(request, 'configuration');
    }
  }

  const inviteHash = request.cookies.get('elbaraka_customer_invite_hash')?.value ?? '';
  const invitedEmail = request.cookies.get('elbaraka_customer_invite_email')?.value ?? '';
  const fullName = request.cookies.get('elbaraka_customer_invite_name')?.value ?? '';
  if (!/^[0-9a-f]{64}$/.test(inviteHash) || !invitedEmail || !fullName) {
    return redirectTo(request, 'invitation');
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    if (error || !data.user?.email || !data.user.email_confirmed_at) {
      return clearInviteCookies(redirectTo(request, 'confirmation'));
    }

    const admin = getSupabaseAdminClient();
    const { error: redeemError } = await admin.rpc('erp_redeem_customer_invite', {
      p_token_hash: inviteHash,
      p_user_id: data.user.id,
      p_email: invitedEmail,
      p_full_name: fullName,
    });
    if (redeemError) return clearInviteCookies(redirectTo(request, 'invitation'));

    return clearInviteCookies(NextResponse.redirect(new URL('/', request.url)));
  } catch {
    return clearInviteCookies(redirectTo(request, 'configuration'));
  }
}
