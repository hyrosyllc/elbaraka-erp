import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabasePublicConfig } from '@/lib/supabase/config';

const publicPaths = new Set([
  '/',
  '/order',
  '/login',
  '/auth/confirm',
  '/auth/customer-confirm',
  '/auth/set-password',
  '/customer/setup',
  '/customer/reset-password',
]);

function copyAuthCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  for (const name of ['cache-control', 'expires', 'pragma']) {
    const value = source.headers.get(name);
    if (value) target.headers.set(name, value);
  }
  return target;
}

export async function middleware(request: NextRequest) {
  try {
    return await handleRequest(request);
  } catch (error) {
    console.error('Middleware failure', error instanceof Error ? error.message : 'unknown');
    if (publicPaths.has(request.nextUrl.pathname)) return NextResponse.next({ request });
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '?error=session-unavailable';
    return NextResponse.redirect(loginUrl);
  }
}

async function handleRequest(request: NextRequest) {
  const config = getSupabasePublicConfig();
  if (!config || request.nextUrl.pathname.startsWith('/api/')) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const pathname = request.nextUrl.pathname;
  if (publicPaths.has(pathname)) return response;

  const userId = typeof claims?.sub === 'string' ? claims.sub : '';
  if (!userId) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('next', pathname);
    return copyAuthCookies(response, NextResponse.redirect(loginUrl));
  }

  const { data: membership, error } = await supabase
    .from('erp_workspace_memberships')
    .select('workspace_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !membership) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '?error=no-workspace-access';
    return copyAuthCookies(response, NextResponse.redirect(loginUrl));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};