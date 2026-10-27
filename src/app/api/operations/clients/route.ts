import { NextRequest, NextResponse } from 'next/server';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type ClientFields = {
  name: string;
  contact_name: string;
  phone: string;
  address: string;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return NextResponse.json({ error: 'Sign-in required.' }, { status: 401 });
  if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: 'Workspace access is not active.' }, { status: 403 });
  return NextResponse.json({ error: 'Client directory is unavailable.' }, { status: 503 });
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseCoordinates(body: Record<string, unknown>): Pick<ClientFields, 'latitude' | 'longitude'> | null {
  const hasLatitude = Object.hasOwn(body, 'latitude');
  const hasLongitude = Object.hasOwn(body, 'longitude');
  if (!hasLatitude && !hasLongitude) return {};
  if (hasLatitude !== hasLongitude) return null;

  const { latitude, longitude } = body;
  if (latitude === null && longitude === null) return { latitude: null, longitude: null };
  if (
    typeof latitude !== 'number'
    || !Number.isFinite(latitude)
    || latitude < -90
    || latitude > 90
    || typeof longitude !== 'number'
    || !Number.isFinite(longitude)
    || longitude < -180
    || longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

async function readJsonBody(request: NextRequest): Promise<{ body?: unknown; error?: string }> {
  const reader = request.body?.getReader();
  if (!reader) return { error: 'Request must contain valid JSON.' };

  const decoder = new TextDecoder();
  let text = '';
  let bytesRead = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > 8192) {
      await reader.cancel();
      return { error: 'Request is too large.' };
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();

  try {
    return { body: JSON.parse(text) as unknown };
  } catch {
    return { error: 'Request must contain valid JSON.' };
  }
}

function parseClientFields(body: Record<string, unknown>): ClientFields | null {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const contactName = typeof body.contactName === 'string' ? body.contactName.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const city = typeof body.city === 'string' ? body.city.trim() : '';

  if (!name || name.length > 160 || contactName.length > 160 || phone.length > 40 || address.length > 240 || city.length > 120) {
    return null;
  }

  const coordinates = parseCoordinates(body);
  if (!coordinates) return null;

  return {
    name,
    contact_name: contactName,
    phone,
    address,
    city,
    ...coordinates,
  };
}

export async function GET() {
  try {
    const identity = await getWorkspaceIdentity();
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('erp_clients')
      .select('id, code, name, name_ar, contact_name, phone, address, city, latitude, longitude, is_active, created_at')
      .eq('workspace_id', identity.workspaceId)
      .order('name');

    if (error) return NextResponse.json({ error: 'Could not load client records.' }, { status: 503 });

    return NextResponse.json(
      { clients: data ?? [], canManage: identity.role === 'manager' },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager') return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

    const parsedBody = await readJsonBody(request);
    if (parsedBody.error) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.error === 'Request is too large.' ? 413 : 400 });
    }
    if (!isRecord(parsedBody.body)) return NextResponse.json({ error: 'Invalid client record.' }, { status: 400 });
    const fields = parseClientFields(parsedBody.body);
    if (!fields) return NextResponse.json({ error: 'Check the client details and coordinate ranges.' }, { status: 400 });

    const id = crypto.randomUUID();
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('erp_clients')
      .insert({
        ...fields,
        latitude: fields.latitude ?? null,
        longitude: fields.longitude ?? null,
        id,
        code: `CLI-${id}`,
        workspace_id: identity.workspaceId,
      })
      .select('id, code, name, name_ar, contact_name, phone, address, city, latitude, longitude, is_active, created_at')
      .single();

    if (error || !data) return NextResponse.json({ error: 'Could not create this client record.' }, { status: 503 });
    return NextResponse.json({ client: data }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager') return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });

    const parsedBody = await readJsonBody(request);
    if (parsedBody.error) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.error === 'Request is too large.' ? 413 : 400 });
    }
    if (!isRecord(parsedBody.body) || !validId(parsedBody.body.id) || typeof parsedBody.body.isActive !== 'boolean') {
      return NextResponse.json({ error: 'Invalid client update.' }, { status: 400 });
    }
    const fields = parseClientFields(parsedBody.body);
    if (!fields) return NextResponse.json({ error: 'Check the client details and coordinate ranges.' }, { status: 400 });

    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('erp_clients')
      .update({ ...fields, is_active: parsedBody.body.isActive })
      .eq('id', parsedBody.body.id)
      .eq('workspace_id', identity.workspaceId)
      .select('id, code, name, name_ar, contact_name, phone, address, city, latitude, longitude, is_active, created_at')
      .maybeSingle();

    if (error) return NextResponse.json({ error: 'Could not update this client record.' }, { status: 503 });
    if (!data) return NextResponse.json({ error: 'Client record not found.' }, { status: 404 });
    return NextResponse.json({ client: data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
