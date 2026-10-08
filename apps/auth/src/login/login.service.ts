import { Inject, Injectable } from '@nestjs/common';
import type { DocumentStore } from '@nara/common';
import { DOCUMENT_STORE } from '@nara/database';
import {
  SessionService,
  signSessionToken,
  verifyPassword,
} from '@nara/auth-core';

@Injectable()
export class LoginService {
  constructor(
    @Inject(DOCUMENT_STORE) private readonly store: DocumentStore,
    private readonly sessions: SessionService,
  ) {}

  async login(emailRaw: string, password: string) {
    const email = String(emailRaw || '')
      .trim()
      .toLowerCase();
    if (!email || !password) {
      return {
        ok: false,
        status: 400,
        error: 'Correo y contraseña son obligatorios.',
      };
    }
    const account = await this.store.findOne('accounts', { email });
    if (!account || account.status !== 'Activo') {
      return {
        ok: false,
        status: 401,
        error: 'Correo o contraseña incorrectos.',
      };
    }
    const ok = await verifyPassword(
      password,
      String(account.passwordHash || ''),
    );
    if (!ok)
      return {
        ok: false,
        status: 401,
        error: 'Correo o contraseña incorrectos.',
      };
    const user = await this.sessions.loadUser(String(account.id));
    if (!user)
      return { ok: false, status: 401, error: 'Cuenta no disponible.' };
    const token = signSessionToken(user.id);
    return { ok: true, status: 200, user, token };
  }
}
