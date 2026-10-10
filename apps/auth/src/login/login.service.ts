import { randomBytes, randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { DocumentStore } from '@nara/common';
import { DOCUMENT_STORE } from '@nara/database';
import {
  SessionService,
  hashPassword,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from '@nara/auth-core';

const IDENTITY_ERROR =
  'No pudimos verificar su identidad. Revise correo y nombre.';
const RESET_TTL_MS = 15 * 60 * 1000;
// SPEC-03: 5 fallos en 15 min bloquean la cuenta 15 min.
const LOCK_MAX_FAILS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const LOCK_ERROR = 'Demasiados intentos. Espere unos minutos e intente de nuevo.';
const LOGIN_ERROR = 'Correo o contraseña incorrectos.';
// SPEC-01: clave temporal de 6 dígitos que vence en 24 h; claves conocidas que obligan a cambiar.
const TEMP_TTL_MS = 24 * 60 * 60 * 1000;
const CLAVES_PROHIBIDAS = ['NaraPrueba#2026', 'AdminNara2026'];
// Hash ficticio para comparar en el mismo tiempo cuando la cuenta no existe (FR-01.6 de la spec completa).
const HASH_FICTICIO = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Ywq6XxV9x3d0Ffk8r0b6W5s8Yb1nG';

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
    const now = Date.now();
    // SPEC-03: contador por correo (exista o no la cuenta) en login_attempts.
    const intento = await this.store.findOne('login_attempts', { key: email });
    if (intento && Number(intento.lockUntil || 0) > now) {
      return { ok: false, status: 429, error: LOCK_ERROR };
    }
    const fallo = async () => {
      const dentro = intento && now - Number(intento.firstAt || 0) < LOCK_WINDOW_MS;
      const fails = dentro ? Number(intento!.fails || 0) + 1 : 1;
      await this.store.upsert('login_attempts', { key: email }, {
        key: email,
        fails,
        firstAt: dentro ? Number(intento!.firstAt) : now,
        lockUntil: fails >= LOCK_MAX_FAILS ? now + LOCK_MS : 0,
        at: new Date(now),
      });
      return { ok: false, status: 401, error: LOGIN_ERROR };
    };

    const account = await this.store.findOne('accounts', { email });
    if (!account || account.status !== 'Activo') {
      await verifyPassword(password, HASH_FICTICIO);
      return fallo();
    }
    // SPEC-01: si hay clave temporal vigente, solo se acepta esa.
    const temp = account.tempPassword as { hash?: string; expiresAt?: number } | undefined;
    let ok: boolean;
    if (temp?.hash) {
      if (Number(temp.expiresAt || 0) < now) {
        return {
          ok: false,
          status: 401,
          error: 'La clave temporal venció. Pida una nueva al administrador.',
        };
      }
      ok = await verifyPassword(password, String(temp.hash));
    } else {
      ok = await verifyPassword(password, String(account.passwordHash || ''));
    }
    if (!ok) return fallo();
    if (intento) await this.store.updateOne('login_attempts', { key: email }, { $set: { fails: 0, lockUntil: 0 } });

    const user = await this.sessions.loadUser(String(account.id));
    if (!user)
      return { ok: false, status: 401, error: 'Cuenta no disponible.' };
    await this.store.updateOne(
      'accounts',
      { id: account.id },
      { $set: { lastLoginAt: now } },
    );
    const token = signSessionToken(user.id);
    return { ok: true, status: 200, user, token };
  }

  /** SPEC-01 FR-01.3: el admin genera una clave temporal de 6 dígitos (24 h) para otra cuenta. */
  async assistedReset(token: string | null, accountId: string) {
    const actorId = verifySessionToken(token);
    const actor = actorId ? await this.sessions.loadUser(actorId) : null;
    if (!actor) return { ok: false, status: 401, error: 'No autenticado.' };
    if (actor.roleId !== 'admin') return { ok: false, status: 403, error: 'Sin permiso para esta acción.' };
    const target = await this.store.findOne('accounts', { id: String(accountId || '') });
    if (!target) return { ok: false, status: 404, error: 'Cuenta no encontrada.' };
    if (target.roleId === 'admin') return { ok: false, status: 403, error: 'Sin permiso para esta acción.' };
    const clave = String(randomInt(0, 1000000)).padStart(6, '0');
    const expiresAt = Date.now() + TEMP_TTL_MS;
    await this.store.updateOne('accounts', { id: target.id }, {
      $set: {
        tempPassword: { hash: await hashPassword(clave), expiresAt, by: actor.id, at: Date.now() },
        mustChangePassword: true,
        updatedAt: new Date(),
      },
      $unset: { passwordReset: '' },
    });
    await this.store.upsert('access_log', { id: `pr-${target.id}-${Date.now()}` }, {
      id: `pr-${target.id}-${Date.now()}`, action: 'password_reset', accountId: target.id, by: actor.id, at: Date.now(),
    });
    return { ok: true, status: 200, tempPassword: clave, expiresAt };
  }

  /** SPEC-01 FR-01.6: la persona con sesión crea su clave nueva. */
  async changePassword(token: string | null, newPassword: string) {
    const id = verifySessionToken(token);
    const account = id ? await this.store.findOne('accounts', { id }) : null;
    if (!account) return { ok: false, status: 401, error: 'No autenticado.' };
    const nueva = String(newPassword || '');
    if (nueva.length < 8) return { ok: false, status: 400, error: 'La clave debe tener al menos 8 caracteres.' };
    if (CLAVES_PROHIBIDAS.includes(nueva)) return { ok: false, status: 400, error: 'Esa clave no está permitida. Elija otra.' };
    const temp = account.tempPassword as { hash?: string } | undefined;
    if (temp?.hash && (await verifyPassword(nueva, String(temp.hash)))) {
      return { ok: false, status: 400, error: 'La clave nueva no puede ser la temporal.' };
    }
    await this.store.updateOne('accounts', { id: account.id }, {
      $set: { passwordHash: await hashPassword(nueva), mustChangePassword: false, updatedAt: new Date() },
      $unset: { tempPassword: '', passwordReset: '' },
    });
    await this.store.upsert('access_log', { id: `pc-${account.id}-${Date.now()}` }, {
      id: `pc-${account.id}-${Date.now()}`, action: 'password_change', accountId: account.id, by: account.id, at: Date.now(),
    });
    return { ok: true, status: 200 };
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
