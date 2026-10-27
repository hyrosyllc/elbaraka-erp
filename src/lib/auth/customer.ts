import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function getVerifiedCustomerUser() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email || !data.user.email_confirmed_at) return null;
  return data.user;
}
