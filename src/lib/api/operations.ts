export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function readJsonBody(
  request: Request,
  maxBytes = 32_768,
): Promise<{ body?: unknown; error?: string; status?: number }> {
  const reader = request.body?.getReader();
  if (!reader) return { error: 'Request must contain valid JSON.', status: 400 };

  const decoder = new TextDecoder();
  let text = '';
  let bytesRead = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel();
      return { error: 'Request is too large.', status: 413 };
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();

  try {
    return { body: JSON.parse(text) as unknown };
  } catch {
    return { error: 'Request must contain valid JSON.', status: 400 };
  }
}

export function isPositiveQuantity(value: unknown, precision = 3): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value > 0
    && Math.round(value * (10 ** precision)) / (10 ** precision) === value;
}

export function isNonNegativeAmount(value: unknown, precision = 5): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && Math.round(value * (10 ** precision)) / (10 ** precision) === value;
}

export function isDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
