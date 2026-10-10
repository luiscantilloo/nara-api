import { Injectable } from '@nestjs/common';
import {
  SessionService as AuthSessionService,
  verifySessionToken,
} from '@nara/auth-core';

@Injectable()
export class SessionQueryService {
  constructor(private readonly sessions: AuthSessionService) {}

  async me(
    token: string | null,
    meta?: { ip?: string | null; path?: string | null },
  ) {
    const id = verifySessionToken(token);
    if (!id) {
      void this.sessions.logAccess({
        action: 'http_401',
        status: 401,
        path: meta?.path || '/auth/me',
        ip: meta?.ip,
      });
      return { ok: false, status: 401, error: 'No autenticado.' };
    }
    const user = await this.sessions.loadUser(id, token);
    if (!user) {
      void this.sessions.logAccess({
        action: 'http_401',
        status: 401,
        accountId: id,
        path: meta?.path || '/auth/me',
        ip: meta?.ip,
      });
      return { ok: false, status: 401, error: 'No autenticado.' };
    }
    return { ok: true, status: 200, user };
  }

  async verify(
    token: string | null,
    meta?: { ip?: string | null; path?: string | null },
  ) {
    return this.me(token, meta);
  }
}
