import { NextRequest, NextResponse } from 'next/server';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { getSupabaseServerClient } from '@/lib/supabase/server';

function safeInternalPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  return value;
}

export async function GET(request: NextRequest) {
  if (!getSupabasePublicConfig()) return NextResponse.redirect(new URL('/login?error=configuration', request.url));

  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const typeValue = request.nextUrl.searchParams.get('type');
  if (!tokenHash || (typeValue !== 'invite' && typeValue !== 'email')) {
    return NextResponse.redirect(new URL('/login?error=confirmation', request.url));
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: typeValue });
    if (error) return NextResponse.redirect(new URL('/login?error=confirmation', request.url));

    const destination = typeValue === 'invite'
      ? '/auth/set-password'
      : safeInternalPath(request.nextUrl.searchParams.get('next'));
    return NextResponse.redirect(new URL(destination, request.url));
  } catch {
    return NextResponse.redirect(new URL('/login?error=configuration', request.url));
  }
}