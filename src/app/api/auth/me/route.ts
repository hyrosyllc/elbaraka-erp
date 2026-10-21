import { NextResponse } from 'next/server';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const identity = await getWorkspaceIdentity();
    return NextResponse.json({
      user: {
        id: identity.userId,
        email: identity.email,
        fullName: identity.fullName,
      },
      workspaceId: identity.workspaceId,
      role: identity.role,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AuthRequiredError) return NextResponse.json({ error: 'Sign-in required.' }, { status: 401 });
    if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: 'Workspace access is not active.' }, { status: 403 });
    return NextResponse.json({ error: 'Authentication service unavailable.' }, { status: 503 });
  }
}