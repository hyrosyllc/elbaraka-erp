export type SupabasePublicConfig = {
  url: string;
  key: string;
};

function cleanEnv(value: string | undefined): string {
  return (value ?? '').trim().replace(/^["']|["']$/g, '').trim();
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const rawUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, '');
  const key = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) || cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!rawUrl || !key) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  } catch {
    return null;
  }
  return { url: rawUrl, key };
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}