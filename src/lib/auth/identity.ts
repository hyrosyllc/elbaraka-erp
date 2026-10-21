import { getSupabaseServerClient } from '@/lib/supabase/server';
import { WorkspaceRole } from '@/lib/workspace';

export type WorkspaceIdentity = {
  userId: string;
  email: string;
  workspaceId: string;
  role: WorkspaceRole;
  fullName: string;
};

export class AuthRequiredError extends Error {}
export class WorkspaceAccessError extends Error {}

export async function getWorkspaceIdentity(): Promise<WorkspaceIdentity> {
  const supabase = await getSupabaseServerClient();
  const { data, error: claimsError } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const userId = typeof claims?.sub === 'string' ? claims.sub : '';
  if (claimsError || !userId) throw new AuthRequiredError('Sign-in required.');

  const { data: membership, error: membershipError } = await supabase
    .from('erp_workspace_memberships')
    .select('workspace_id, role_code, full_name')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (membershipError || !membership) throw new WorkspaceAccessError('No active workspace membership.');
  if (membership.role_code !== 'manager' && membership.role_code !== 'purchasing' && membership.role_code !== 'delivery') {
    throw new WorkspaceAccessError('Workspace role is invalid.');
  }

  return {
    userId,
    email: typeof claims.email === 'string' ? claims.email : '',
    workspaceId: membership.workspace_id,
    role: membership.role_code,
    fullName: membership.full_name,
  };
}