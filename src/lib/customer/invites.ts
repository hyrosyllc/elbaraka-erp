import 'server-only';
import { createHash } from 'node:crypto';

export function hashCustomerInvite(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

export function isCustomerInviteCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value);
}

export function normalizeCustomerEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
