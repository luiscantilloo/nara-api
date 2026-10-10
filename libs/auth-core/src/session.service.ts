import { Inject, Injectable } from '@nestjs/common';
import {
  hrefForRoleId,
  resolveNotifKey,
  NARA_ROLES,
  type DocumentStore,
  type SessionUser,
} from '@nara/common';
import { DOCUMENT_STORE } from '@nara/database';

@Injectable()
export class SessionService {
  constructor(@Inject(DOCUMENT_STORE) private readonly store: DocumentStore) {}

  async loadUser(accountId: string): Promise<SessionUser | null> {
    const account = await this.store.findOne('accounts', {
      id: accountId,
      status: 'Activo',
    });
    if (!account) return null;
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
