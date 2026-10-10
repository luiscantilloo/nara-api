/** Límite simple en memoria: 20 peticiones / minuto por cuenta (6.14). */

const WINDOW_MS = 60_000;
const LIMIT = 20;
const buckets = new Map<string, number[]>();

function prune(key: string, now: number): number[] {
  const prev = (buckets.get(key) || []).filter((t) => now - t < WINDOW_MS);
  buckets.set(key, prev);
  return prev;
}

/** Segundos hasta que caduque el tick más viejo del bucket (Retry-After). */
export function teoRetryAfterSec(accountId: string): number {
  const key = String(accountId || '').trim() || 'anon';
  const now = Date.now();
  const prev = prune(key, now);
  if (!prev.length) return 1;
  return Math.max(1, Math.ceil((prev[0]! + WINDOW_MS - now) / 1000));
}

export function teoRateLimitOk(accountId: string): boolean {
  const key = String(accountId || '').trim() || 'anon';
  const now = Date.now();
  const prev = prune(key, now);
  if (prev.length >= LIMIT) {
    return false;
  }
  prev.push(now);
  buckets.set(key, prev);
  return true;
}

export function teoRateLimitError(accountId: string) {
  return {
    ok: false as const,
    status: 429,
    error: 'Demasiadas peticiones a TEO. Espere un minuto e intente de nuevo.',
    retryAfter: teoRetryAfterSec(accountId),
  };
}

/** @deprecated usar teoRateLimitError(accountId) para incluir Retry-After real. */
export const TEO_RATE_LIMIT_ERROR = {
  ok: false as const,
  status: 429,
  error: 'Demasiadas peticiones a TEO. Espere un minuto e intente de nuevo.',
  retryAfter: 60,
};
