import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const MAX_EMAIL_LENGTH = 254;
export const MAX_NAME_LENGTH = 120;

const RATE_LIMIT_BUCKET_COUNT = 32768;
const TRUSTED_IP_HEADERS = new Set([
  'x-forwarded-for',
  'x-vercel-forwarded-for',
  'x-real-ip',
  'cf-connecting-ip',
]);

export type RateLimitScope =
  | 'admin_users_list'
  | 'admin_users_create'
  | 'admin_users_update'
  | 'admin_customer_invite'
  | 'customer_account'
  | 'customer_catalog'
  | 'customer_invite_validation'
  | 'customer_order'
  | 'customer_profile'
  | 'operations_inventory_setup'
  | 'operations_orders';

export type RateLimitResult = { allowed: boolean } | { error: 'unavailable' };

export function getServerSecret() {
  const secret = process.env.APP_SECRET
    ?? process.env.NEXTAUTH_SECRET
    ?? process.env.SUPABASE_SECRET_KEY
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret || secret.trim().length < 32) {
    throw new Error('Missing or weak server secret. Set APP_SECRET, NEXTAUTH_SECRET, or a Supabase server-only secret key.');
  }

  return secret;
}

export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string'
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    && value.length <= MAX_EMAIL_LENGTH;
}

export function isValidName(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.trim().length <= MAX_NAME_LENGTH;
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function createSignedCookieValue(value: string) {
  const payload = Buffer.from(value, 'utf8').toString('base64url');
  const signature = createHmac('sha256', getServerSecret()).update(payload).digest('hex');
  return `${signature}.${payload}`;
}

export function verifySignedCookieValue(signedValue: string | null | undefined) {
  if (!signedValue) return null;
  const separator = signedValue.lastIndexOf('.');
  if (separator <= 0 || separator === signedValue.length - 1) return null;

  const signature = signedValue.slice(0, separator);
  const payload = signedValue.slice(separator + 1);
  if (!/^[a-f0-9]{64}$/.test(signature)) return null;

  const expected = createHmac('sha256', getServerSecret()).update(payload).digest('hex');
  const actual = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (actual.length !== expectedBuffer.length) return null;

  try {
    if (!timingSafeEqual(actual, expectedBuffer)) return null;
    return Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

export function getTrustedClientIp(request: Request) {
  const headerName = process.env.RATE_LIMIT_TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (!headerName || !TRUSTED_IP_HEADERS.has(headerName)) return null;

  const value = request.headers.get(headerName)?.trim();
  if (!value || value.length > 45 || value.includes(',') || isIP(value) === 0) return null;
  return value;
}

export async function checkRateLimit(
  scope: RateLimitScope,
  subject: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  try {
    const bucketHash = createHmac('sha256', getServerSecret())
      .update(`${scope}:${subject}`)
      .digest();
    const bucket = bucketHash.readUInt32BE(0) % RATE_LIMIT_BUCKET_COUNT;
    const { data, error } = await getSupabaseAdminClient().rpc('erp_check_api_rate_limit', {
      p_scope: scope,
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: Math.ceil(windowMs / 1000),
    });

    if (error || typeof data !== 'boolean') {
      console.error('Shared rate-limit check failed', { code: error?.code ?? 'invalid_result' });
      return { error: 'unavailable' };
    }

    return { allowed: data };
  } catch (error) {
    console.error('Shared rate-limit check could not reach its store', {
      error: error instanceof Error ? error.name : 'unknown',
    });
    return { error: 'unavailable' };
  }
}
