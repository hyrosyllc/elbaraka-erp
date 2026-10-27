import { NextRequest, NextResponse } from 'next/server';
import { isRecord, readJsonBody } from '@/lib/api/operations';
import { hashCustomerInvite, isCustomerInviteCode, normalizeCustomerEmail } from '@/lib/customer/invites';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

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
  const parsed = await readJsonBody(request, 4096);
  if (parsed.error) return inviteErrorResponse(parsed.error, parsed.status ?? 400);
  if (!isRecord(parsed.body)) return inviteErrorResponse('Enter the invitation details.', 400);

  const code = parsed.body.code;
  const email = normalizeCustomerEmail(parsed.body.email);
  const fullName = typeof parsed.body.fullName === 'string' ? parsed.body.fullName.trim() : '';
  if (!isCustomerInviteCode(code) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
    || !fullName || fullName.length > 120) {
    return inviteErrorResponse('Check the invitation code, email, and name.', 400);
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.rpc('erp_customer_invite_is_valid', {
      p_token_hash: hashCustomerInvite(code),
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
    response.cookies.set('elbaraka_customer_invite_hash', hashCustomerInvite(code), cookieOptions);
    response.cookies.set('elbaraka_customer_invite_email', email, cookieOptions);
    response.cookies.set('elbaraka_customer_invite_name', fullName, cookieOptions);
    return response;
  } catch {
    return inviteErrorResponse('Could not verify this invitation right now.', 503);
  }
}
