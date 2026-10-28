import { NextRequest, NextResponse } from 'next/server';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';

export const dynamic = 'force-dynamic';

type Feature = { geometry?: { coordinates?: [number, number] }; properties?: { name?: string; full_address?: string; place_formatted?: string } };

// Signed-in proxy so place search never needs the token in more places than the map itself.
export async function GET(request: NextRequest) {
  try {
    await getWorkspaceIdentity();
    const q = request.nextUrl.searchParams.get('q')?.trim().slice(0, 120) ?? '';
    const token = process.env.MAPBOX_PUBLIC_ACCESS_TOKEN?.trim();
    if (q.length < 3 || !token) return NextResponse.json({ results: [] });

    const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '5');
    url.searchParams.set('country', 'ma');
    url.searchParams.set('access_token', token);
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) return NextResponse.json({ results: [] });
    const payload = await response.json() as { features?: Feature[] };
    const results = (payload.features ?? []).flatMap((feature) => {
      const coordinates = feature.geometry?.coordinates;
      if (!coordinates) return [];
      return [{
        label: feature.properties?.full_address || [feature.properties?.name, feature.properties?.place_formatted].filter(Boolean).join(', '),
        longitude: coordinates[0],
        latitude: coordinates[1],
      }];
    });
    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AuthRequiredError) return NextResponse.json({ error: 'Sign-in required.' }, { status: 401 });
    if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: 'Workspace access is not active.' }, { status: 403 });
    return NextResponse.json({ results: [] });
  }
}
