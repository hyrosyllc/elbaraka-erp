import { NextRequest, NextResponse } from 'next/server';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type SupplierFields = {
  name: string;
  contact_name: string;
  phone: string;
  lead_time_days: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return NextResponse.json({ error: 'Sign-in required.' }, { status: 401 });
  if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: 'Workspace access is not active.' }, { status: 403 });
  return NextResponse.json({ error: 'Supplier directory is unavailable.' }, { status: 503 });
}

function canManageSuppliers(role: string) {
  return role === 'manager' || role === 'purchasing';
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

function parseSupplierFields(body: Record<string, unknown>): SupplierFields | null {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const contactName = typeof body.contactName === 'string' ? body.contactName.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const rawLeadTimeDays = body.leadTimeDays === undefined ? 7 : body.leadTimeDays;
  const leadTimeDays = typeof rawLeadTimeDays === 'number'
    ? rawLeadTimeDays
    : typeof rawLeadTimeDays === 'string' && /^\d+$/.test(rawLeadTimeDays.trim())
      ? Number(rawLeadTimeDays)
      : Number.NaN;

  if (
    !name
    || name.length > 160
    || contactName.length > 160
    || phone.length > 40
    || !Number.isInteger(leadTimeDays)
    || leadTimeDays < 0
    || leadTimeDays > 3650
  ) {
    return null;
  }

  return { name, contact_name: contactName, phone, lead_time_days: leadTimeDays };
}

export async function GET() {
  try {
    const identity = await getWorkspaceIdentity();
    if (!canManageSuppliers(identity.role)) {
      return NextResponse.json({ error: 'Purchasing access required.' }, { status: 403 });
    }

    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('erp_suppliers')
      .select('id, code, name, name_ar, contact_name, phone, lead_time_days, is_active, created_at')
      .eq('workspace_id', identity.workspaceId)
      .order('name');

    if (error) return NextResponse.json({ error: 'Could not load supplier records.' }, { status: 503 });

    return NextResponse.json(
      { suppliers: data ?? [], canManage: canManageSuppliers(identity.role) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (!canManageSuppliers(identity.role)) {
      return NextResponse.json({ error: 'Purchasing access required.' }, { status: 403 });
    }

    const parsedBody = await readJsonBody(request);
    if (parsedBody.error) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.error === 'Request is too large.' ? 413 : 400 });
    }
    if (!isRecord(parsedBody.body)) return NextResponse.json({ error: 'Invalid supplier record.' }, { status: 400 });
    const fields = parseSupplierFields(parsedBody.body);
    if (!fields) return NextResponse.json({ error: 'Check the supplier name and contact details.' }, { status: 400 });

    const id = crypto.randomUUID();
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('erp_suppliers')
      .insert({ ...fields, id, code: `SUP-${id}`, workspace_id: identity.workspaceId })
      .select('id, code, name, name_ar, contact_name, phone, lead_time_days, is_active, created_at')
      .single();

    if (error || !data) return NextResponse.json({ error: 'Could not create this supplier record.' }, { status: 503 });
    return NextResponse.json({ supplier: data }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (!canManageSuppliers(identity.role)) {
      return NextResponse.json({ error: 'Purchasing access required.' }, { status: 403 });
    }

    const parsedBody = await readJsonBody(request);
    if (parsedBody.error) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.error === 'Request is too large.' ? 413 : 400 });
    }
    if (!isRecord(parsedBody.body) || !validId(parsedBody.body.id) || typeof parsedBody.body.isActive !== 'boolean') {
      return NextResponse.json({ error: 'Invalid supplier update.' }, { status: 400 });
    }
    const fields = parseSupplierFields(parsedBody.body);
    if (!fields) return NextResponse.json({ error: 'Check the supplier name and contact details.' }, { status: 400 });

    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from('erp_suppliers')
      .update({ ...fields, is_active: parsedBody.body.isActive })
      .eq('id', parsedBody.body.id)
      .eq('workspace_id', identity.workspaceId)
      .select('id, code, name, name_ar, contact_name, phone, lead_time_days, is_active, created_at')
      .maybeSingle();

    if (error) return NextResponse.json({ error: 'Could not update this supplier record.' }, { status: 503 });
    if (!data) return NextResponse.json({ error: 'Supplier record not found.' }, { status: 404 });
    return NextResponse.json({ supplier: data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
