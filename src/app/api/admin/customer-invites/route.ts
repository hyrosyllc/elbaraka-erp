import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AuthRequiredError, getWorkspaceIdentity, WorkspaceAccessError } from '@/lib/auth/identity';
import { isRecord, isUuid, readJsonBody } from '@/lib/api/operations';
import { hashCustomerInvite, normalizeCustomerEmail } from '@/lib/customer/invites';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAppUrl } from '@/lib/supabase/config';
import { sendCustomerAuthEmail } from '@/lib/email/customer-auth-email';
import { checkRateLimit, isValidEmail } from '@/lib/security';

export const dynamic = 'force-dynamic';

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return NextResponse.json({ error: 'Sign-in required.' }, { status: 401 });
  if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: 'This account has no active staff access. Sign out of any customer account and sign in as a manager.' }, { status: 403 });
  return NextResponse.json({ error: 'Customer invitation service is unavailable.' }, { status: 503 });
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager') return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

    const rateLimit = await checkRateLimit('admin_customer_invite', identity.userId, 12, 60_000);
    if ('error' in rateLimit) {
      return NextResponse.json({ error: 'Invitation service is temporarily unavailable.' }, { status: 503 });
    }
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment and try again.' }, { status: 429 });
    }

    const parsed = await readJsonBody(request, 4096);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: parsed.status ?? 400 });
    if (!isRecord(parsed.body)) return NextResponse.json({ error: 'Invalid store invitation.' }, { status: 400 });

    const clientId = parsed.body.clientId;
    const email = normalizeCustomerEmail(parsed.body.email);
    const mode = parsed.body.mode;
    if (!isUuid(clientId) || !isValidEmail(email)) {
      return NextResponse.json({ error: 'Choose a store and enter a valid customer email.' }, { status: 400 });
    }
    if (mode !== 'generate' && mode !== 'send_email') {
      return NextResponse.json({ error: 'Choose whether to generate a code or send an invitation email.' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { data: client, error: clientError } = await admin
      .from('erp_clients')
      .select('id, name')
      .eq('workspace_id', identity.workspaceId)
      .eq('id', clientId)
      .eq('is_active', true)
      .maybeSingle();

    if (clientError) return NextResponse.json({ error: 'Could not verify the store.' }, { status: 503 });
    if (!client) return NextResponse.json({ error: 'Active store was not found.' }, { status: 404 });

    const { data: linkedMemberships, error: membershipsError } = await admin.from('erp_customer_memberships')
      .select('user_id')
      .eq('workspace_id', identity.workspaceId)
      .eq('client_id', clientId)
      .limit(100);
    if (membershipsError) return NextResponse.json({ error: 'Could not verify existing customer accounts.' }, { status: 503 });

    const linkedUsers = await Promise.all((linkedMemberships ?? []).map((membership) => admin.auth.admin.getUserById(membership.user_id)));
    if (linkedUsers.some((result) => result.error)) {
      return NextResponse.json({ error: 'Could not verify existing customer accounts.' }, { status: 503 });
    }
    if (linkedUsers.some((result) => normalizeCustomerEmail(result.data.user?.email) === email)) {
      return NextResponse.json({ error: 'An account with this email is already linked to this client.' }, { status: 409 });
    }

    const appUrl = new URL(getAppUrl());
    if (process.env.NODE_ENV === 'production'
      && (appUrl.protocol !== 'https:' || appUrl.hostname === 'localhost' || appUrl.hostname.endsWith('.localhost') || appUrl.hostname === '127.0.0.1')) {
      return NextResponse.json({ error: 'Set NEXT_PUBLIC_APP_URL to the HTTPS application origin before sending customer invitations.' }, { status: 503 });
    }

    const code = randomBytes(24).toString('base64url');
    const portalLink = new URL('/', appUrl);
    const suggestedName = client.name.trim().slice(0, 120);
    portalLink.searchParams.set('inviteCode', code);
    portalLink.searchParams.set('inviteEmail', email);
    portalLink.searchParams.set('inviteName', suggestedName);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: revokePreviousError } = await admin.from('erp_customer_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('workspace_id', identity.workspaceId)
      .eq('client_id', clientId)
      .eq('email', email)
      .is('redeemed_at', null)
      .is('revoked_at', null);
    if (revokePreviousError) {
      console.error('Could not revoke previous customer invitations', { code: revokePreviousError.code });
      return NextResponse.json({ error: 'Could not prepare a new customer invitation.' }, { status: 503 });
    }

    const { data, error } = await admin
      .from('erp_customer_invites')
      .insert({
        workspace_id: identity.workspaceId,
        client_id: clientId,
        email,
        token_hash: hashCustomerInvite(code),
        expires_at: expiresAt,
        created_by: identity.userId,
      })
      .select('id, expires_at')
      .single();

    if (error || !data) return NextResponse.json({ error: 'Could not create this store invitation.' }, { status: 503 });

    const revokeUnsentInvite = async () => {
      const { error: revokeError } = await admin.from('erp_customer_invites')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', data.id);
      if (revokeError) console.error('Could not revoke unsent customer invitation', { code: revokeError.code });
    };

    if (mode === 'generate') {
      return NextResponse.json(
        { invitation: { id: data.id, mode, email, code, link: portalLink.toString(), expiresAt: data.expires_at } },
        { status: 201, headers: { 'Cache-Control': 'private, no-store' } },
      );
    }

    const sendFailure = () => NextResponse.json({ error: 'Could not send this invitation email. Check the Resend and Supabase Auth configuration and try again.' }, { status: 503 });
    try {
      let kind: 'invite' | 'existing' = 'invite';
      let generated = await admin.auth.admin.generateLink({ type: 'invite', email });
      if (generated.error?.code === 'email_exists' || generated.error?.code === 'user_already_exists') {
        kind = 'existing';
        generated = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      }
      const tokenHash = generated.data?.properties?.hashed_token;
      if (generated.error || !tokenHash) {
        console.error('Could not generate customer invitation link', { code: generated.error?.code });
        await revokeUnsentInvite();
        return sendFailure();
      }

      const confirmLink = new URL('/auth/customer-confirm', appUrl);
      confirmLink.searchParams.set('token_hash', tokenHash);
      confirmLink.searchParams.set('type', kind === 'invite' ? 'invite' : 'magiclink');
      confirmLink.searchParams.set('inviteCode', code);
      confirmLink.searchParams.set('inviteName', suggestedName);
      await sendCustomerAuthEmail(kind, email, confirmLink.toString());
    } catch (error) {
      console.error('Could not send customer invitation email', { error: error instanceof Error ? error.name : 'unknown' });
      await revokeUnsentInvite();
      return sendFailure();
    }

    return NextResponse.json(
      { invitation: { id: data.id, mode, email, expiresAt: data.expires_at } },
      { status: 201, headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
