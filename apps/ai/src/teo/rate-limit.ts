/** Límite simple en memoria: 20 peticiones / minuto por cuenta (6.14). */

const WINDOW_MS = 60_000;
const LIMIT = 20;
const buckets = new Map<string, number[]>();

export function teoRateLimitOk(accountId: string): boolean {
  const key = String(accountId || '').trim() || 'anon';
  const now = Date.now();
  const prev = (buckets.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (prev.length >= LIMIT) {
    buckets.set(key, prev);
    return false;
  }
  prev.push(now);
  buckets.set(key, prev);
  return true;
}

export const TEO_RATE_LIMIT_ERROR = {
  ok: false as const,
  status: 429,
  error: 'Demasiadas peticiones a TEO. Espere un minuto e intente de nuevo.',
};
