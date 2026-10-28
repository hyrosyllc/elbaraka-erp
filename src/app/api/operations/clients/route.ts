import { NextRequest, NextResponse } from 'next/server';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
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

    type ClientMetrics = {
      invoicedMad: number; paidMad: number; outstandingMad: number; overdueMad: number; creditMad: number;
      orderCount: number; openOrders: number; returnCount: number; lastOrderAt: string | null;
    };
    type ClientRow = NonNullable<typeof data>[number] & { account_status?: 'active' | 'invited' | 'none'; account_count?: number; metrics?: ClientMetrics };
    let clients: ClientRow[] = data ?? [];
    if (identity.role === 'manager') {
      const admin = getSupabaseAdminClient();
      const nowIso = new Date().toISOString();
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Casablanca' });
      const [membershipsResult, invitesResult, invoicesResult, ordersResult, returnsResult] = await Promise.all([
        admin.from('erp_customer_memberships').select('client_id').eq('workspace_id', identity.workspaceId).eq('is_active', true).limit(5000),
        admin.from('erp_customer_invites').select('client_id').eq('workspace_id', identity.workspaceId).is('redeemed_at', null).is('revoked_at', null).gt('expires_at', nowIso).limit(5000),
        supabase.from('erp_invoices').select('client_id, total_mad, due_date, erp_payments(amount_mad), erp_invoice_adjustments(amount_mad)').eq('workspace_id', identity.workspaceId).limit(5000),
        supabase.from('erp_sales_orders').select('client_id, status, created_at').eq('workspace_id', identity.workspaceId).limit(10000),
        supabase.from('erp_customer_returns').select('client_id').eq('workspace_id', identity.workspaceId).limit(5000),
      ]);
      if (membershipsResult.error || invitesResult.error || invoicesResult.error || ordersResult.error || returnsResult.error) {
        return NextResponse.json({ error: 'Could not load client records.' }, { status: 503 });
      }
      const accountCounts = new Map<string, number>();
      for (const row of membershipsResult.data ?? []) accountCounts.set(row.client_id, (accountCounts.get(row.client_id) ?? 0) + 1);
      const invited = new Set((invitesResult.data ?? []).map((row) => row.client_id));
      const metrics = new Map<string, ClientMetrics>();
      const metricsFor = (id: string) => {
        let entry = metrics.get(id);
        if (!entry) {
          entry = { invoicedMad: 0, paidMad: 0, outstandingMad: 0, overdueMad: 0, creditMad: 0, orderCount: 0, openOrders: 0, returnCount: 0, lastOrderAt: null };
          metrics.set(id, entry);
        }
        return entry;
      };
      const sum = (rows: { amount_mad: number | string }[] | null) => (rows ?? []).reduce((total, row) => total + Number(row.amount_mad), 0);
      for (const invoice of invoicesResult.data ?? []) {
        const entry = metricsFor(invoice.client_id);
        const adjusted = Number(invoice.total_mad) + sum(invoice.erp_invoice_adjustments);
        const paid = sum(invoice.erp_payments);
        const balance = Math.round((adjusted - paid) * 100) / 100;
        entry.invoicedMad += adjusted;
        entry.paidMad += paid;
        if (balance > 0) {
          entry.outstandingMad += balance;
          if (invoice.due_date && String(invoice.due_date) < today) entry.overdueMad += balance;
        } else {
          entry.creditMad += -balance;
        }
      }
      for (const order of ordersResult.data ?? []) {
        const entry = metricsFor(order.client_id);
        entry.orderCount += 1;
        if (order.status === 'confirmed' || order.status === 'part_delivered') entry.openOrders += 1;
        if (!entry.lastOrderAt || order.created_at > entry.lastOrderAt) entry.lastOrderAt = order.created_at;
      }
      for (const row of returnsResult.data ?? []) metricsFor(row.client_id).returnCount += 1;
      const round = (value: number) => Math.round(value * 100) / 100;
      clients = clients.map((client) => {
        const count = accountCounts.get(client.id) ?? 0;
        const entry = metricsFor(client.id);
        return {
          ...client,
          account_count: count,
          account_status: count > 0 ? 'active' : invited.has(client.id) ? 'invited' : 'none',
          metrics: { ...entry, invoicedMad: round(entry.invoicedMad), paidMad: round(entry.paidMad), outstandingMad: round(entry.outstandingMad), overdueMad: round(entry.overdueMad), creditMad: round(entry.creditMad) },
        };
      });
    }

    return NextResponse.json(
      { clients, canManage: identity.role === 'manager' },
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
