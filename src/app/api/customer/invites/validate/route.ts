import { NextRequest, NextResponse } from 'next/server';
import { isRecord, readJsonBody } from '@/lib/api/operations';
import { hashCustomerInvite, isCustomerInviteCode, normalizeCustomerEmail } from '@/lib/customer/invites';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, createSignedCookieValue, getTrustedClientIp, isValidEmail, isValidName } from '@/lib/security';

export const dynamic = 'force-dynamic';

function inviteErrorResponse(error: string, status: number) {
  const response = NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } });
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
  const clientIp = getTrustedClientIp(request);
  if (!clientIp) {
    console.error('Customer invite validation requires a trusted client IP header.');
    return inviteErrorResponse('Invitation verification is temporarily unavailable.', 503);
  }

  const rateLimit = await checkRateLimit('customer_invite_validation', clientIp, 8, 60_000);
  if ('error' in rateLimit) {
    return inviteErrorResponse('Invitation verification is temporarily unavailable.', 503);
  }
  if (!rateLimit.allowed) {
    return inviteErrorResponse('Too many attempts. Please wait a moment and try again.', 429);
  }

  const parsed = await readJsonBody(request, 4096);
  if (parsed.error) return inviteErrorResponse(parsed.error, parsed.status ?? 400);
  if (!isRecord(parsed.body)) return inviteErrorResponse('Enter the invitation details.', 400);

  const code = parsed.body.code;
  const email = normalizeCustomerEmail(parsed.body.email);
  const fullName = typeof parsed.body.fullName === 'string' ? parsed.body.fullName.trim() : '';
  if (!isCustomerInviteCode(code) || !isValidEmail(email) || !isValidName(fullName)) {
    return inviteErrorResponse('Check the invitation code, email, and name.', 400);
  }

  const inviteHash = hashCustomerInvite(code);

  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.rpc('erp_customer_invite_is_valid', {
      p_token_hash: inviteHash,
      p_email: email,
    });
    if (error) return inviteErrorResponse('Could not verify this invitation right now.', 503);
    if (data !== true) return inviteErrorResponse('This invitation is invalid, expired, or belongs to another email.', 400);

    const response = NextResponse.json({ valid: true }, { headers: { 'Cache-Control': 'private, no-store' } });
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 10 * 60,
    };

    response.cookies.set('elbaraka_customer_invite_hash', createSignedCookieValue(inviteHash), cookieOptions);
    response.cookies.set('elbaraka_customer_invite_email', createSignedCookieValue(email), cookieOptions);
    response.cookies.set('elbaraka_customer_invite_name', createSignedCookieValue(fullName), cookieOptions);
    return response;
  } catch {
    return inviteErrorResponse('Could not verify this invitation right now.', 503);
  }
}
