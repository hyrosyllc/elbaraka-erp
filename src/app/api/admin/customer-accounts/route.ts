import { NextRequest, NextResponse } from 'next/server';
import { AuthRequiredError, getWorkspaceIdentity, WorkspaceAccessError } from '@/lib/auth/identity';
import { isRecord, isUuid, readJsonBody } from '@/lib/api/operations';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAppUrl } from '@/lib/supabase/config';
import { sendCustomerAuthEmail } from '@/lib/email/customer-auth-email';

export const dynamic = 'force-dynamic';

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return fail('Sign-in required.', 401);
  if (error instanceof WorkspaceAccessError) return fail('This account has no active staff access. Sign out of any customer account and sign in as a manager.', 403);
  return fail('Customer account service is unavailable.', 503);
}

export async function GET(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager') return fail('Manager access required.', 403);

    const clientId = request.nextUrl.searchParams.get('clientId');
    if (!isUuid(clientId)) return fail('Choose a client record.', 400);

    const admin = getSupabaseAdminClient();
    const { data: memberships, error } = await admin
      .from('erp_customer_memberships')
      .select('user_id, full_name, is_active, created_at')
      .eq('workspace_id', identity.workspaceId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) return fail('Could not load client account details.', 503);

    const accounts = await Promise.all((memberships ?? []).map(async (membership) => {
      const { data, error: userError } = await admin.auth.admin.getUserById(membership.user_id);
      if (userError || !data.user?.email) throw new Error('customer_account_email_unavailable');
      return {
        userId: membership.user_id,
        fullName: membership.full_name,
        email: data.user.email,
        active: membership.is_active,
        createdAt: membership.created_at,
      };
    }));

    return NextResponse.json({ accounts }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof Error && error.message === 'customer_account_email_unavailable') {
      return fail('A linked account email could not be verified.', 503);
    }
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager') return fail('Manager access required.', 403);

    const parsed = await readJsonBody(request, 4096);
    if (parsed.error) return fail(parsed.error, parsed.status ?? 400);
    if (!isRecord(parsed.body) || !isUuid(parsed.body.clientId) || !isUuid(parsed.body.userId)) {
      return fail('Choose a linked customer account.', 400);
    }

    const admin = getSupabaseAdminClient();
    const { data: membership, error: membershipError } = await admin
      .from('erp_customer_memberships')
      .select('user_id')
      .eq('workspace_id', identity.workspaceId)
      .eq('client_id', parsed.body.clientId)
      .eq('user_id', parsed.body.userId)
      .eq('is_active', true)
      .maybeSingle();
    if (membershipError) return fail('Could not verify the customer account.', 503);
    if (!membership) return fail('Active customer account was not found.', 404);

    const { data: client, error: clientError } = await admin.from('erp_clients')
      .select('id')
      .eq('workspace_id', identity.workspaceId)
      .eq('id', parsed.body.clientId)
      .eq('is_active', true)
      .maybeSingle();
    if (clientError) return fail('Could not verify the client record.', 503);
    if (!client) return fail('Active client record was not found.', 404);

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(membership.user_id);
    if (userError || !userData.user?.email) return fail('Could not verify the customer email.', 503);

    const appUrl = new URL(getAppUrl());
    if (process.env.NODE_ENV === 'production'
      && (appUrl.protocol !== 'https:' || appUrl.hostname === 'localhost' || appUrl.hostname.endsWith('.localhost') || appUrl.hostname === '127.0.0.1')) {
      return fail('Set NEXT_PUBLIC_APP_URL to the HTTPS application origin before sending password reset emails.', 503);
    }

    const generated = await admin.auth.admin.generateLink({ type: 'recovery', email: userData.user.email });
    const tokenHash = generated.data?.properties?.hashed_token;
    if (generated.error || !tokenHash) {
      console.error('Could not generate customer password reset link', { code: generated.error?.code });
      return fail('Could not prepare the password reset email.', 503);
    }
    const resetLink = new URL('/auth/customer-confirm', appUrl);
    resetLink.searchParams.set('flow', 'recovery');
    resetLink.searchParams.set('token_hash', tokenHash);
    resetLink.searchParams.set('type', 'recovery');
    try {
      await sendCustomerAuthEmail('recovery', userData.user.email, resetLink.toString());
    } catch (sendError) {
      console.error('Could not send customer password reset email', { error: sendError instanceof Error ? sendError.name : 'unknown' });
      return fail('Could not send the password reset email. Check the Resend configuration and try again.', 503);
    }

    return NextResponse.json({ sent: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
