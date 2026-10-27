import { redirect } from 'next/navigation';
import { AuthRequiredError, WorkspaceAccessError, getWorkspaceIdentity } from '@/lib/auth/identity';
import { UserManagement } from '@/components/admin/UserManagement';

export const dynamic = 'force-dynamic';

export default async function WorkspaceUsersPage() {
  try {
    const identity = await getWorkspaceIdentity();
    if (identity.role !== 'manager') redirect('/staff');
    return <UserManagement />;
  } catch (error) {
    if (error instanceof AuthRequiredError) redirect('/login?next=/admin/users');
    if (error instanceof WorkspaceAccessError) redirect('/login?error=no-workspace-access');
    redirect('/login?error=configuration');
  }
}