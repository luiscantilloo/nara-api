import { Injectable } from '@nestjs/common';
import {
  SessionService as AuthSessionService,
  verifySessionToken,
} from '@nara/auth-core';

@Injectable()
export class SessionQueryService {
  constructor(private readonly sessions: AuthSessionService) {}

  async me(token: string | null) {
    const id = verifySessionToken(token);
    if (!id) return { ok: false, status: 401, error: 'No autenticado.' };
    const user = await this.sessions.loadUser(id);
    if (!user) return { ok: false, status: 401, error: 'No autenticado.' };
    return { ok: true, status: 200, user };
  }

  async verify(token: string | null) {
    return this.me(token);
  }
}
