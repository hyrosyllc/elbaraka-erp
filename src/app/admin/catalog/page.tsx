import { redirect } from 'next/navigation';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { CatalogManagement } from '@/components/admin/CatalogManagement';

export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  try {
    const identity = await getWorkspaceIdentity();
    return <CatalogManagement canManage={identity.role === 'manager'} fullName={identity.fullName} />;
  } catch (error) {
    if (error instanceof AuthRequiredError) redirect('/login?next=/admin/catalog');
    if (error instanceof WorkspaceAccessError) redirect('/login?error=no-workspace-access');
    redirect('/login?error=configuration');
  }
}
