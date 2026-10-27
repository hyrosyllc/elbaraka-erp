import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AuthRequiredError, getWorkspaceIdentity, WorkspaceAccessError } from '@/lib/auth/identity';
import { isRecord, isUuid, readJsonBody } from '@/lib/api/operations';
import { hashCustomerInvite, normalizeCustomerEmail } from '@/lib/customer/invites';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return NextResponse.json({ error: 'Sign-in required.' }, { status: 401 });
  if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: 'Workspace access is not active.' }, { status: 403 });
  return NextResponse.json({ error: 'Customer invitation service is unavailable.' }, { status: 503 });
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager') return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

    const parsed = await readJsonBody(request, 4096);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: parsed.status ?? 400 });
    if (!isRecord(parsed.body)) return NextResponse.json({ error: 'Invalid store invitation.' }, { status: 400 });

    const clientId = parsed.body.clientId;
    const email = normalizeCustomerEmail(parsed.body.email);
    if (!isUuid(clientId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: 'Choose a store and enter a valid customer email.' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { data: client, error: clientError } = await admin
      .from('erp_clients')
      .select('id')
      .eq('workspace_id', identity.workspaceId)
      .eq('id', clientId)
      .eq('is_active', true)
      .maybeSingle();

    if (clientError) return NextResponse.json({ error: 'Could not verify the store.' }, { status: 503 });
    if (!client) return NextResponse.json({ error: 'Active store was not found.' }, { status: 404 });

    const code = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
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

    return NextResponse.json(
      { invitation: { id: data.id, code, email, expiresAt: data.expires_at } },
      { status: 201, headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
