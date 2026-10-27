import { NextResponse } from 'next/server';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await getWorkspaceIdentity();
    const token = process.env.MAPBOX_PUBLIC_ACCESS_TOKEN?.trim();
    if (!token?.startsWith('pk.')) {
      return NextResponse.json({ error: 'Map configuration is unavailable.' }, { status: 503 });
    }

    return NextResponse.json(
      { token },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: 'Sign-in required.' }, { status: 401 });
    }
    if (error instanceof WorkspaceAccessError) {
      return NextResponse.json({ error: 'Workspace access is not active.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Map configuration is unavailable.' }, { status: 500 });
  }
}
