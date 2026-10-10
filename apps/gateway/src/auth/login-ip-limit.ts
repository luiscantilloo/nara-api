/**
 * Límite de fallos de login por IP en el gateway (además del de la cuenta).
 * 20 fallos en 15 min → 429 con Retry-After.
 */

const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 20;
const buckets = new Map<string, number[]>();

function prune(ip: string, now: number): number[] {
  const prev = (buckets.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  buckets.set(ip, prev);
  return prev;
}

export function checkLoginIpLimit(
  ip: string | null | undefined,
): { ok: true } | { ok: false; retryAfter: number } {
  const key = String(ip || 'unknown').trim() || 'unknown';
  const now = Date.now();
  const prev = prune(key, now);
  if (prev.length >= LIMIT) {
    const oldest = prev[0] || now;
    const retryAfter = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    return { ok: false, retryAfter };
  }
  return { ok: true };
}

export function recordLoginIpFailure(ip: string | null | undefined) {
  const key = String(ip || 'unknown').trim() || 'unknown';
  const now = Date.now();
  const prev = prune(key, now);
  prev.push(now);
  buckets.set(key, prev);
}

export function clearLoginIpFailures(ip: string | null | undefined) {
  const key = String(ip || 'unknown').trim() || 'unknown';
  buckets.delete(key);
}
