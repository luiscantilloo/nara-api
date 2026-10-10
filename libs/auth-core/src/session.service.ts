import { Inject, Injectable } from '@nestjs/common';
import {
  hrefForRoleId,
  resolveNotifKey,
  NARA_ROLES,
  type DocumentStore,
  type SessionUser,
} from '@nara/common';
import { DOCUMENT_STORE } from '@nara/database';
import { sessionIssuedAt } from './session-token';

@Injectable()
export class SessionService {
  constructor(@Inject(DOCUMENT_STORE) private readonly store: DocumentStore) {}

  /** T-03: invalida todos los tokens emitidos hasta ahora para esta cuenta. */
  async revoke(accountId: string) {
    await this.store.updateOne('accounts', { id: accountId }, { $set: { logoutAt: Date.now() } });
  }

  /**
   * Registro de acceso (6.19): login/401/403, sin claves ni datos clínicos.
   * Escribe en la colección `access_log`.
   */
  async logAccess(entry: {
    action: string;
    accountId?: string | null;
    email?: string | null;
    status?: number | null;
    path?: string | null;
  }) {
    const id = `al-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await this.store.upsert('access_log', { id }, {
        id,
        action: String(entry.action || '').slice(0, 64),
        accountId: entry.accountId ? String(entry.accountId).slice(0, 80) : null,
        email: entry.email
          ? String(entry.email).toLowerCase().slice(0, 120)
          : null,
        status: entry.status ?? null,
        path: entry.path ? String(entry.path).slice(0, 200) : null,
        at: Date.now(),
      });
    } catch {
      /* no bloquear la petición */
    }
  }

  async loadUser(accountId: string, token?: string | null): Promise<SessionUser | null> {
    const account = await this.store.findOne('accounts', {
      id: accountId,
      status: 'Activo',
    });
    if (!account) return null;
    // T-03: un token emitido antes del último cierre de sesión ya no vale.
    if (token && account.logoutAt) {
      const iat = sessionIssuedAt(token);
      if (iat == null || iat * 1000 <= Number(account.logoutAt)) return null;
    }
    const roleId = String(account.roleId || '');
    const roleDoc =
      (await this.store.findOne('roles', { id: roleId })) ||
      NARA_ROLES.find((r) => r.id === roleId) ||
      null;
    let href =
      (roleDoc && 'href' in roleDoc && String(roleDoc.href)) ||
      hrefForRoleId(roleId);
    let patientId = account.patientId ? String(account.patientId) : undefined;

    // Paciente sin perfil de ruta (cuestionario): puede autenticarse pero no entra a la app.
    if (roleId === 'paciente') {
      const patient =
        (patientId
          ? await this.store.findOne('patients', { id: patientId })
          : null) ||
        (await this.store.findOne('patients', { accountId })) ||
        null;
      if (patient?.id) patientId = String(patient.id);
      const profile = patient?.profile != null ? String(patient.profile) : '';
      const ready = /^P\d+$/i.test(profile);
      if (!ready) href = '/paciente/pendiente';
    }

    const orgType =
      account.orgType != null ? String(account.orgType) : undefined;
    const modules = Array.isArray(account.modules)
      ? account.modules.map((m) => String(m))
      : undefined;

    return {
      id: String(account.id),
      name: String(account.name || ''),
      email: String(account.email || ''),
      role: String(account.role || ''),
      roleId,
      terr: String(account.terr || ''),
      org: String(account.org || ''),
      contact: String(account.contact || account.email || ''),
      status: String(account.status || 'Activo'),
      href,
      nk: resolveNotifKey(roleId, String(account.id)),
      patientId,
      mustChangePassword: account.mustChangePassword === true,
      ...(orgType ? { orgType } : {}),
      ...(modules ? { modules } : {}),
    };
  }
}
