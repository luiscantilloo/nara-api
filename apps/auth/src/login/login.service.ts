import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { DocumentStore } from '@nara/common';
import { DOCUMENT_STORE } from '@nara/database';
import {
  SessionService,
  hashPassword,
  signSessionToken,
  verifyPassword,
} from '@nara/auth-core';

const IDENTITY_ERROR =
  'No pudimos verificar su identidad. Revise correo y nombre.';
const RESET_TTL_MS = 15 * 60 * 1000;

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

/** Extrae primer nombre y primer apellido del nombre completo de la cuenta. */
export function splitAccountName(fullName: string) {
  let tokens = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens[0] && /^dra?\.?$/i.test(tokens[0])) {
    tokens = tokens.slice(1);
  }
  return {
    firstName: tokens[0] || '',
    lastName: tokens[1] || '',
  };
}

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
    await this.store.updateOne(
      'accounts',
      { id: account.id },
      { $set: { lastLoginAt: Date.now() } },
    );
    const token = signSessionToken(user.id);
    return { ok: true, status: 200, user, token };
  }

  async verifyIdentity(
    emailRaw: string,
    firstNameRaw: string,
    lastNameRaw: string,
  ) {
    const email = String(emailRaw || '')
      .trim()
      .toLowerCase();
    const firstName = normalizeText(firstNameRaw);
    const lastName = normalizeText(lastNameRaw);

    if (!email || !firstName || !lastName) {
      return {
        ok: false,
        status: 400,
        error: 'Correo, primer nombre y primer apellido son obligatorios.',
      };
    }

    const account = await this.store.findOne('accounts', { email });
    if (!account || account.status !== 'Activo') {
      return { ok: false, status: 401, error: IDENTITY_ERROR };
    }

    const expected = splitAccountName(String(account.name || ''));
    if (
      !expected.firstName ||
      !expected.lastName ||
      normalizeText(expected.firstName) !== firstName ||
      normalizeText(expected.lastName) !== lastName
    ) {
      return { ok: false, status: 401, error: IDENTITY_ERROR };
    }

    const resetToken = randomBytes(32).toString('hex');
    const tokenHash = await hashPassword(resetToken);
    const expiresAt = Date.now() + RESET_TTL_MS;

    await this.store.updateOne(
      'accounts',
      { id: account.id },
      {
        $set: {
          passwordReset: { tokenHash, expiresAt },
        },
      },
    );

    return {
      ok: true,
      status: 200,
      resetToken,
      email,
    };
  }

  async resetPassword(
    emailRaw: string,
    resetToken: string,
    password: string,
  ) {
    const email = String(emailRaw || '')
      .trim()
      .toLowerCase();
    const token = String(resetToken || '').trim();
    const nextPass = String(password || '');

    if (!email || !token || !nextPass) {
      return {
        ok: false,
        status: 400,
        error: 'Complete todos los campos.',
      };
    }
    if (nextPass.length < 8) {
      return {
        ok: false,
        status: 400,
        error: 'La contraseña debe tener al menos 8 caracteres.',
      };
    }

    const account = await this.store.findOne('accounts', { email });
    if (!account || account.status !== 'Activo') {
      return { ok: false, status: 401, error: IDENTITY_ERROR };
    }

    const reset = account.passwordReset as
      | { tokenHash?: string; expiresAt?: number }
      | undefined;
    if (
      !reset?.tokenHash ||
      !reset.expiresAt ||
      Number(reset.expiresAt) < Date.now()
    ) {
      return {
        ok: false,
        status: 401,
        error: 'La verificación expiró. Vuelva a comprobar su identidad.',
      };
    }

    const tokenOk = await verifyPassword(token, String(reset.tokenHash));
    if (!tokenOk) {
      return {
        ok: false,
        status: 401,
        error: 'La verificación expiró. Vuelva a comprobar su identidad.',
      };
    }

    const passwordHash = await hashPassword(nextPass);
    await this.store.updateOne(
      'accounts',
      { id: account.id },
      {
        $set: { passwordHash },
        $unset: { passwordReset: '' },
      },
    );

    return {
      ok: true,
      status: 200,
      message: 'Contraseña actualizada. Ya puede ingresar.',
    };
  }
}
