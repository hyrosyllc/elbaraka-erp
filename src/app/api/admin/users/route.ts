import { NextRequest, NextResponse } from 'next/server';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { getAppUrl } from '@/lib/supabase/config';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function isManager(role: string) {
  return role === 'manager';
}

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return NextResponse.json({ error: 'Sign-in required.' }, { status: 401 });
  if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: 'Workspace access is not active.' }, { status: 403 });
  return NextResponse.json({ error: 'User administration is unavailable.' }, { status: 503 });
}

export async function GET(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (!isManager(identity.role)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

    const page = Math.max(1, Math.min(100, Number(request.nextUrl.searchParams.get('page')) || 1));
    const perPage = 50;
    const admin = getSupabaseAdminClient();
    const { data: memberships, error } = await admin
      .from('erp_workspace_memberships')
      .select('user_id, role_code, full_name, is_active, created_at')
      .eq('workspace_id', identity.workspaceId)
      .order('created_at', { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1);

    if (error) return NextResponse.json({ error: 'Could not load workspace users.' }, { status: 503 });

    const users = await Promise.all((memberships ?? []).map(async (membership) => {
      const { data } = await admin.auth.admin.getUserById(membership.user_id);
      return {
        id: membership.user_id,
        email: data.user?.email ?? '',
        fullName: membership.full_name,
        role: membership.role_code,
        isActive: membership.is_active,
        emailConfirmed: Boolean(data.user?.email_confirmed_at),
        createdAt: membership.created_at,
      };
    }));

    return NextResponse.json({ users, page, hasMore: users.length === perPage }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (!isManager(identity.role)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 4096) return NextResponse.json({ error: 'Request is too large.' }, { status: 413 });
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null) return NextResponse.json({ error: 'Invalid invitation.' }, { status: 400 });

    const values = body as { email?: unknown; fullName?: unknown; role?: unknown };
    const email = typeof values.email === 'string' ? values.email.trim().toLowerCase() : '';
    const fullName = typeof values.fullName === 'string' ? values.fullName.trim() : '';
    const role = values.role;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (!fullName || fullName.length > 120) return NextResponse.json({ error: 'Enter a name up to 120 characters.' }, { status: 400 });
    if (role !== 'manager' && role !== 'purchasing' && role !== 'delivery') {
      return NextResponse.json({ error: 'Choose a valid workspace role.' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const callback = new URL('/auth/confirm', getAppUrl());
    callback.searchParams.set('next', '/auth/set-password');
    const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: callback.toString(),
    });

    if (inviteError || !invite.user) {
      return NextResponse.json({ error: 'Could not send invitation. Check whether this address already has an account.' }, { status: 400 });
    }

    const { error: membershipError } = await admin.from('erp_workspace_memberships').insert({
      workspace_id: identity.workspaceId,
      user_id: invite.user.id,
      role_code: role,
      full_name: fullName,
      is_active: true,
      invited_by: identity.userId,
    });

    if (membershipError) {
      return NextResponse.json({ error: 'Invitation was sent, but workspace access was not saved. Contact the system owner before retrying.' }, { status: 503 });
    }

    return NextResponse.json({ invited: true }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (!isManager(identity.role)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 4096) return NextResponse.json({ error: 'Request is too large.' }, { status: 413 });
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null) return NextResponse.json({ error: 'Invalid user update.' }, { status: 400 });

    const values = body as { userId?: unknown; role?: unknown; isActive?: unknown; fullName?: unknown };
    const userId = typeof values.userId === 'string' ? values.userId : '';
    const fullName = typeof values.fullName === 'string' ? values.fullName.trim() : '';
    const role = values.role;
    const isActive = values.isActive;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return NextResponse.json({ error: 'Choose a valid workspace user.' }, { status: 400 });
    }
    if (role !== 'manager' && role !== 'purchasing' && role !== 'delivery') {
      return NextResponse.json({ error: 'Choose a valid workspace role.' }, { status: 400 });
    }
    if (typeof isActive !== 'boolean') return NextResponse.json({ error: 'Choose whether this user is active.' }, { status: 400 });
    if (!fullName || fullName.length > 120) return NextResponse.json({ error: 'Enter a name up to 120 characters.' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const { data: target, error: targetError } = await admin
      .from('erp_workspace_memberships')
      .select('user_id, role_code, is_active')
      .eq('workspace_id', identity.workspaceId)
      .eq('user_id', userId)
      .maybeSingle();
    if (targetError || !target) return NextResponse.json({ error: 'Workspace user was not found.' }, { status: 404 });

    const removesManager = target.role_code === 'manager' && target.is_active && (role !== 'manager' || !isActive);
    if (removesManager) {
      const { count, error: countError } = await admin
        .from('erp_workspace_memberships')
        .select('user_id', { count: 'exact', head: true })
        .eq('workspace_id', identity.workspaceId)
        .eq('role_code', 'manager')
        .eq('is_active', true);
      if (countError) return NextResponse.json({ error: 'Could not verify manager access.' }, { status: 503 });
      if ((count ?? 0) <= 1) return NextResponse.json({ error: 'The workspace must keep at least one active manager.' }, { status: 409 });
    }

    const { error: updateError } = await admin
      .from('erp_workspace_memberships')
      .update({ role_code: role, full_name: fullName, is_active: isActive, updated_at: new Date().toISOString() })
      .eq('workspace_id', identity.workspaceId)
      .eq('user_id', userId);
    if (updateError) return NextResponse.json({ error: 'Could not update workspace user.' }, { status: 503 });

    return NextResponse.json({ updated: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return authErrorResponse(error);
  }
}