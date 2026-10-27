import { redirect } from 'next/navigation';
import { AdminWorkspace } from '@/components/admin/AdminWorkspace';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { getSupabasePublicConfig } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (!getSupabasePublicConfig()) return <AdminWorkspace />;

  try {
    const identity = await getWorkspaceIdentity();
    return <AdminWorkspace authenticatedRole={identity.role} fullName={identity.fullName} />;
  } catch (error) {
    if (error instanceof AuthRequiredError) redirect('/login?next=/');
    if (error instanceof WorkspaceAccessError) redirect('/login?error=no-workspace-access');
    redirect('/login?error=configuration');
  }
}
