import { notFound, redirect } from 'next/navigation';
import { AdminWorkspace } from '@/components/admin/AdminWorkspace';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { INITIAL_ROLE_ACCESS, parseWorkspacePath } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

export default async function StaffPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  const path = ['staff', ...slug].map((segment) => encodeURIComponent(segment)).join('/');
  const route = parseWorkspacePath(`/${path}`);
  if (!route) notFound();

  if (!getSupabasePublicConfig()) return <AdminWorkspace />;

  let identity;
  try {
    identity = await getWorkspaceIdentity();
  } catch (error) {
    if (error instanceof AuthRequiredError) redirect(`/login?next=/${path}`);
    if (error instanceof WorkspaceAccessError) redirect('/login?error=no-workspace-access');
    redirect('/login?error=configuration');
  }

  if (!INITIAL_ROLE_ACCESS[identity.role].includes(route.page)) redirect('/staff');
  return <AdminWorkspace authenticatedRole={identity.role} fullName={identity.fullName} />;
}
