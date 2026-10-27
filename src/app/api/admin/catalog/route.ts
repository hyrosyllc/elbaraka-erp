import { NextRequest, NextResponse } from 'next/server';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type CatalogOperation = 'category' | 'product' | 'size';
type CategoryFields = { name_ar: string; name: string };
type ProductFields = { name_ar: string; name: string; stock_unit: 'g' | 'kg'; category_id: string | null };
type SizeFields = { size_g: number; sku: string | null; sale_price_mad: number | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return NextResponse.json({ error: 'Sign-in required.' }, { status: 401 });
  if (error instanceof WorkspaceAccessError) return NextResponse.json({ error: 'Workspace access is not active.' }, { status: 403 });
  return NextResponse.json({ error: 'Product catalog service is unavailable.' }, { status: 503 });
}

function isManager(role: string) {
  return role === 'manager';
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

function parseCatalogFields(body: Record<string, unknown>, operation: 'category'): CategoryFields | null;
function parseCatalogFields(body: Record<string, unknown>, operation: 'product'): ProductFields | null;
function parseCatalogFields(body: Record<string, unknown>, operation: 'size'): SizeFields | null;
function parseCatalogFields(body: Record<string, unknown>, operation: CatalogOperation): CategoryFields | ProductFields | SizeFields | null {
  const nameAr = typeof body.nameAr === 'string' ? body.nameAr.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (operation === 'category' && (!nameAr || nameAr.length > 120 || name.length > 120)) return null;
  if (operation === 'product' && (!nameAr || nameAr.length > 160 || name.length > 160)) return null;

  if (operation === 'category') return { name_ar: nameAr, name };
  if (operation === 'product') {
    const stockUnit = body.stockUnit;
    const categoryId = body.categoryId;
    if (stockUnit !== 'g' && stockUnit !== 'kg') return null;
    if (categoryId !== null && categoryId !== '' && !validId(categoryId)) return null;
    return {
      name_ar: nameAr,
      name,
      stock_unit: stockUnit,
      category_id: categoryId === null || categoryId === '' ? null : categoryId,
    };
  }

  const sizeValue = typeof body.sizeValue === 'number' ? body.sizeValue : Number(body.sizeValue);
  const sizeUnit = body.sizeUnit;
  if (!Number.isFinite(sizeValue) || sizeValue <= 0 || (sizeUnit !== 'g' && sizeUnit !== 'kg')) return null;
  const sizeG = sizeUnit === 'kg' ? sizeValue * 1000 : sizeValue;
  if (sizeG > 1_000_000_000) return null;

  const rawSku = typeof body.sku === 'string' ? body.sku.trim() : '';
  const sku = rawSku ? rawSku.toUpperCase() : null;
  if (sku && !/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(sku)) return null;

  const rawPrice = body.salePriceMad;
  const salePrice = rawPrice === null || rawPrice === '' || rawPrice === undefined ? null : Number(rawPrice);
  if (salePrice !== null && (!Number.isFinite(salePrice) || salePrice < 0 || salePrice > 999999999999)) return null;
  return { size_g: sizeG, sku, sale_price_mad: salePrice };
}

async function categoryIsInWorkspace(categoryId: unknown, workspaceId: string, includeInactive = false) {
  if (categoryId === null || categoryId === '') return true;
  if (!validId(categoryId)) return false;
  const supabase = await getSupabaseServerClient();
  let query = supabase
    .from('erp_product_categories')
    .select('id')
    .eq('id', categoryId)
    .eq('workspace_id', workspaceId);
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function GET() {
  try {
    const identity = await getWorkspaceIdentity();
    const supabase = await getSupabaseServerClient();
    const [categoriesResult, productsResult, sizesResult] = await Promise.all([
      supabase.from('erp_product_categories')
        .select('id, name_ar, name, is_active, created_at')
        .eq('workspace_id', identity.workspaceId)
        .order('name_ar'),
      supabase.from('erp_products')
        .select('id, category_id, name_ar, name, stock_unit, is_active, created_at, updated_at')
        .eq('workspace_id', identity.workspaceId)
        .order('name_ar'),
      supabase.from('erp_product_sizes')
        .select('id, product_id, size_g, sku, sale_price_mad, is_active')
        .eq('workspace_id', identity.workspaceId)
        .order('size_g'),
    ]);

    if (categoriesResult.error || productsResult.error || sizesResult.error) {
      return NextResponse.json({ error: 'Could not load catalog records.' }, { status: 503 });
    }

    return NextResponse.json({
      categories: categoriesResult.data ?? [],
      products: productsResult.data ?? [],
      sizes: sizesResult.data ?? [],
      canManage: isManager(identity.role),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (!isManager(identity.role)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });
    const parsedBody = await readJsonBody(request);
    if (parsedBody.error) return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.error === 'Request is too large.' ? 413 : 400 });
    const body = parsedBody.body;
    if (!isRecord(body) || (body.operation !== 'category' && body.operation !== 'product' && body.operation !== 'size')) {
      return NextResponse.json({ error: 'Invalid catalog record.' }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    if (body.operation === 'category') {
      const fields = parseCatalogFields(body, 'category');
      if (!fields) return NextResponse.json({ error: 'Enter a category name up to 120 characters.' }, { status: 400 });
      const { data, error } = await supabase.from('erp_product_categories')
        .insert({ ...fields, workspace_id: identity.workspaceId })
        .select().single();
      if (error || !data) return NextResponse.json({ error: 'Could not create this category. Check whether its name is already in use.' }, { status: 409 });
      return NextResponse.json({ record: data }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (body.operation === 'product') {
      const fields = parseCatalogFields(body, 'product');
      if (!fields) return NextResponse.json({ error: 'Check the product name and stock unit.' }, { status: 400 });
      if (!await categoryIsInWorkspace(body.categoryId, identity.workspaceId)) {
        return NextResponse.json({ error: 'Choose an active category in this workspace.' }, { status: 400 });
      }
      const { data, error } = await supabase.from('erp_products')
        .insert({ ...fields, workspace_id: identity.workspaceId })
        .select().single();
      if (error || !data) return NextResponse.json({ error: 'Could not create this product. Check whether its name is already in use.' }, { status: 409 });
      return NextResponse.json({ record: data }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
    }

    const fields = parseCatalogFields(body, 'size');
    if (!fields) return NextResponse.json({ error: 'Check the size, SKU, and price.' }, { status: 400 });
    if (!validId(body.productId)) return NextResponse.json({ error: 'Choose a valid catalog product.' }, { status: 400 });
    const { data, error } = await supabase.from('erp_product_sizes')
      .insert({ ...fields, workspace_id: identity.workspaceId, product_id: body.productId })
      .select().single();
    if (error || !data) return NextResponse.json({ error: 'Could not create this size. Check for a duplicate size or SKU.' }, { status: 409 });

    return NextResponse.json({ record: data }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (!isManager(identity.role)) return NextResponse.json({ error: 'Manager access required.' }, { status: 403 });
    const parsedBody = await readJsonBody(request);
    if (parsedBody.error) return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.error === 'Request is too large.' ? 413 : 400 });
    const body = parsedBody.body;
    if (!isRecord(body) || !validId(body.id) || (body.operation !== 'category' && body.operation !== 'product' && body.operation !== 'size')) {
      return NextResponse.json({ error: 'Invalid catalog update.' }, { status: 400 });
    }

    if (typeof body.isActive !== 'boolean') {
      return NextResponse.json({ error: 'Check the catalog fields and active status.' }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const updatedAt = new Date().toISOString();
    if (body.operation === 'category') {
      const fields = parseCatalogFields(body, 'category');
      if (!fields) return NextResponse.json({ error: 'Enter a category name up to 120 characters.' }, { status: 400 });
      const { data, error } = await supabase.from('erp_product_categories')
        .update({ ...fields, is_active: body.isActive, updated_at: updatedAt })
        .eq('id', body.id).eq('workspace_id', identity.workspaceId).select().maybeSingle();
      if (error) return NextResponse.json({ error: 'Could not save this category. Check whether its name is already in use.' }, { status: 409 });
      if (!data) return NextResponse.json({ error: 'Category was not found or cannot be changed.' }, { status: 404 });
      return NextResponse.json({ record: data }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (body.operation === 'product') {
      const fields = parseCatalogFields(body, 'product');
      if (!fields) return NextResponse.json({ error: 'Check the product name and stock unit.' }, { status: 400 });
      if (!await categoryIsInWorkspace(body.categoryId, identity.workspaceId, true)) {
        return NextResponse.json({ error: 'Choose a category in this workspace.' }, { status: 400 });
      }
      const { data, error } = await supabase.from('erp_products')
        .update({ ...fields, is_active: body.isActive, updated_at: updatedAt })
        .eq('id', body.id).eq('workspace_id', identity.workspaceId).select().maybeSingle();
      if (error) return NextResponse.json({ error: 'Could not save this product. Check whether its name is already in use.' }, { status: 409 });
      if (!data) return NextResponse.json({ error: 'Product was not found or cannot be changed.' }, { status: 404 });
      return NextResponse.json({ record: data }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    const fields = parseCatalogFields(body, 'size');
    if (!fields) return NextResponse.json({ error: 'Check the size, SKU, and price.' }, { status: 400 });
    const { data, error } = await supabase.from('erp_product_sizes')
      .update({ ...fields, is_active: body.isActive, updated_at: updatedAt })
      .eq('id', body.id).eq('workspace_id', identity.workspaceId).select().maybeSingle();
    if (error) return NextResponse.json({ error: 'Could not save this size. Check for a duplicate size or SKU.' }, { status: 409 });
    if (!data) return NextResponse.json({ error: 'Size was not found or cannot be changed.' }, { status: 404 });
    return NextResponse.json({ record: data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
