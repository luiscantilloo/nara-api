import type { Request, Response } from 'express';
import { SESSION_COOKIE, SESSION_MAX_AGE_SEC } from '@nara/auth-core';

export function readToken(req: Request): string | null {
  const fromCookie = req.cookies?.[SESSION_COOKIE];
  if (fromCookie) return String(fromCookie);
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7);
  return null;
}

export function sendResult(res: Response, result: Record<string, unknown>) {
  const status = Number(result.status || (result.ok ? 200 : 500));
  const { status: _s, token, ...body } = result;
  if (token && typeof token === 'string') {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE_SEC * 1000,
    });
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
