import type { Request, Response } from 'express';
import { SESSION_COOKIE, SESSION_MAX_AGE_SEC } from '@nara/auth-core';

export function readToken(req: Request): string | null {
  const fromCookie = req.cookies?.[SESSION_COOKIE];
  if (fromCookie) return String(fromCookie);
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7);
  return null;
}

/** IP (x-forwarded-for) y ruta para access_log (6.19). */
export function requestMeta(req: Request): { ip: string | null; path: string } {
  const xf = req.headers['x-forwarded-for'];
  const fromHeader =
    typeof xf === 'string'
      ? xf.split(',')[0]
      : Array.isArray(xf)
        ? xf[0]
        : '';
  const ip = String(fromHeader || req.socket?.remoteAddress || '')
    .trim()
    .slice(0, 80);
  return {
    ip: ip || null,
    path: String(req.originalUrl || req.url || '').slice(0, 200),
  };
}

export function sendResult(res: Response, result: Record<string, unknown>) {
  const status = Number(result.status || (result.ok ? 200 : 500));
  const { status: _s, token, retryAfter, ...body } = result;
  if (token && typeof token === 'string') {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE_SEC * 1000,
    });
  }
  if (status === 429) {
    const sec = Number(retryAfter);
    if (Number.isFinite(sec) && sec > 0) {
      res.setHeader('Retry-After', String(Math.ceil(sec)));
      (body as { retryAfter?: number }).retryAfter = Math.ceil(sec);
    }
  }
  return res.status(status).json(body);
}

export function clearSession(res: Response) {
  res.cookie(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
