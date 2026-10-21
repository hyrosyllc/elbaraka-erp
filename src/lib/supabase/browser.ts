'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicConfig } from './config';

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;
  const config = getSupabasePublicConfig();
  if (!config) throw new Error('Supabase public configuration is missing.');
  browserClient = createBrowserClient(config.url, config.key);
  return browserClient;
}