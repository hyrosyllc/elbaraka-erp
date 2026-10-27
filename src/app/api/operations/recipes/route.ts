import { NextRequest, NextResponse } from 'next/server';
import { isRecord, isUuid, readJsonBody } from '@/lib/api/operations';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) return fail('Sign-in required.', 401);
  if (error instanceof WorkspaceAccessError) return fail('Workspace access is not active.', 403);
  return fail('Recipe service is unavailable.', 503);
}

const RPC_MESSAGES: Record<string, string> = {
  invalid_output_quantity: 'Enter a batch output greater than zero with at most three decimals.',
  invalid_recipe_components: 'Add at least one component, each with a different item and a quantity above zero.',
  output_item_not_found: 'Choose a blend or finished good.',
  component_item_not_found: 'A component is not an active ingredient, packaging item or blend.',
  draft_already_exists: 'This product already has a draft. Edit or delete it first.',
  recipe_not_draft: 'Approved recipes cannot be changed. Create a new version instead.',
};

function rpcErrorResponse(error: { code?: string; message?: string } | null) {
  if (error?.code === '42501') return fail('You do not have permission for this action.', 403);
  if (error?.code === 'P0002') return fail(RPC_MESSAGES[error.message ?? ''] ?? 'The requested record was not found.', 404);
  if (error?.code === '23505') return fail('A record with the same identifier already exists.', 409);
  if (error?.code === 'P0001' || error?.code?.startsWith('22')) return fail(RPC_MESSAGES[error.message ?? ''] ?? 'The recipe details are invalid.', 400);
  if (error?.code) console.error('Recipe transaction failed', { code: error.code });
  return fail('The recipe transaction could not be completed.', 503);
}

export async function GET() {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager' && identity.role !== 'purchasing') return fail('Recipe access required.', 403);
    const supabase = await getSupabaseServerClient();

    const [recipesResult, itemsResult] = await Promise.all([
      supabase
        .from('inventory_recipes')
        .select('id, output_item_id, version, output_quantity, status, approved_at, inventory_recipe_components(input_item_id, quantity)')
        .eq('workspace_id', identity.workspaceId)
        .order('version', { ascending: false })
        .limit(500),
      supabase
        .from('inventory_items')
        .select('id, sku, name, item_type, base_unit')
        .eq('workspace_id', identity.workspaceId)
        .eq('is_active', true)
        .order('name')
        .limit(1000),
    ]);
    if (recipesResult.error || itemsResult.error) return fail('Could not load recipes.', 503);

    const items = (itemsResult.data ?? []).map((item) => ({ id: item.id, sku: item.sku, name: item.name, type: item.item_type, unit: item.base_unit }));
    const recipes = (recipesResult.data ?? []).map((recipe) => ({
      id: recipe.id,
      outputItemId: recipe.output_item_id,
      version: recipe.version,
      outputQuantity: Number(recipe.output_quantity),
      status: recipe.status,
      approvedAt: recipe.approved_at,
      components: (recipe.inventory_recipe_components ?? []).map((component) => ({ itemId: component.input_item_id, quantity: Number(component.quantity) })),
    }));
    return NextResponse.json({ recipes, items, canApprove: identity.role === 'manager' }, { headers: NO_STORE });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager' && identity.role !== 'purchasing') return fail('Recipe access required.', 403);

    const parsed = await readJsonBody(request);
    if (parsed.error) return fail(parsed.error, parsed.status ?? 400);
    const body = parsed.body;
    if (!isRecord(body) || typeof body.action !== 'string') return fail('Invalid request.', 400);
    const supabase = await getSupabaseServerClient();

    if (body.action === 'save') {
      const recipeId = body.recipeId ?? null;
      if ((recipeId !== null && !isUuid(recipeId)) || !isUuid(body.outputItemId) || typeof body.outputQuantity !== 'number' || !Array.isArray(body.components)) {
        return fail('Invalid recipe request.', 400);
      }
      const components = body.components.map((component) => (isRecord(component) ? { itemId: component.itemId, quantity: component.quantity } : null));
      if (components.some((component) => component === null || !isUuid(component.itemId) || typeof component.quantity !== 'number')) {
        return fail('Invalid recipe components.', 400);
      }
      const { data, error } = await supabase.rpc('erp_save_recipe_draft', {
        p_recipe_id: recipeId,
        p_output_item_id: body.outputItemId,
        p_output_quantity: body.outputQuantity,
        p_components: components,
      });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ recipeId: data }, { status: 201, headers: NO_STORE });
    }

    if (!isUuid(body.recipeId)) return fail('Invalid recipe.', 400);

    if (body.action === 'approve') {
      if (identity.role !== 'manager') return fail('Manager access required.', 403);
      const { error } = await supabase.rpc('erp_approve_recipe', { p_recipe_id: body.recipeId });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }
    if (body.action === 'delete') {
      const { error } = await supabase.rpc('erp_delete_recipe_draft', { p_recipe_id: body.recipeId });
      if (error) return rpcErrorResponse(error);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }

    return fail('Unknown recipe action.', 400);
  } catch (error) {
    return authErrorResponse(error);
  }
}
