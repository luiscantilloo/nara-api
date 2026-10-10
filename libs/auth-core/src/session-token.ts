import { createHmac, timingSafeEqual } from 'crypto';

export const SESSION_COOKIE = 'nara_sid';
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 14;

function secret() {
  const s = process.env.AUTH_SECRET || process.env.NARA_AUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === 'production')
      throw new Error('Falta AUTH_SECRET');
    return 'nara-dev-auth-secret-change-me';
  }
  return s;
}

export function signSessionToken(
  accountId: string,
  maxAgeSec = SESSION_MAX_AGE_SEC,
) {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSec;
  const payload = `${accountId}.${exp}`;
  const sig = createHmac('sha256', secret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySessionToken(
  token: string | null | undefined,
): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [accountId, expStr, sig] = parts;
  if (!accountId || !expStr || !sig) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  const payload = `${accountId}.${expStr}`;
  const expected = createHmac('sha256', secret())
    .update(payload)
    .digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return accountId;
}

/** Momento de emisión (segundos) de un token válido; null si no es válido. */
export function sessionIssuedAt(token: string | null | undefined): number | null {
  if (!verifySessionToken(token)) return null;
  const exp = Number(String(token).split('.')[1]);
  return exp - SESSION_MAX_AGE_SEC;
}
