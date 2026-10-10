import { createHash } from 'crypto';
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

function hashEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const raw = String(email).toLowerCase().trim().slice(0, 120);
  if (!raw) return null;
  const salt = process.env.ACCESS_LOG_EMAIL_SALT || 'nara-access-log';
  return createHash('sha256').update(`${salt}:${raw}`).digest('hex');
}

function clientIp(ip?: string | null): string | null {
  if (!ip) return null;
  return String(ip).split(',')[0].trim().slice(0, 80) || null;
}

@Injectable()
export class SessionService {
  private indexesReady = false;

  constructor(@Inject(DOCUMENT_STORE) private readonly store: DocumentStore) {}

  /** Índices access_log: {action,at} + TTL 90 días. */
  private async ensureAccessLogIndexes() {
    if (this.indexesReady) return;
    this.indexesReady = true;
    try {
      const db = await (
        this.store as { db?: () => Promise<{ collection: (n: string) => { createIndex: (k: unknown, o?: unknown) => Promise<unknown> } }> }
      ).db?.();
      if (!db) return;
      const col = db.collection('access_log');
      await col.createIndex({ action: 1, at: 1 });
      await col.createIndex(
        { expireAt: 1 },
        { expireAfterSeconds: 90 * 24 * 60 * 60 },
      );
    } catch {
      /* ignore */
    }
  }

  /** T-03: invalida todos los tokens emitidos hasta ahora para esta cuenta. */
  async revoke(accountId: string) {
    await this.store.updateOne('accounts', { id: accountId }, { $set: { logoutAt: Date.now() } });
  }

  /**
   * Registro de acceso (6.19): login/401/403, sin claves ni datos clínicos.
   * Correo con hash SHA-256+sal; IP y ruta cuando se pasan; consola sin correo.
   */
  async logAccess(entry: {
    action: string;
    accountId?: string | null;
    email?: string | null;
    status?: number | null;
    path?: string | null;
    ip?: string | null;
  }) {
    await this.ensureAccessLogIndexes();
    const at = Date.now();
    const action = String(entry.action || '').slice(0, 64);
    const accountId = entry.accountId ? String(entry.accountId).slice(0, 80) : null;
    const emailHash = hashEmail(entry.email);
    const status = entry.status ?? null;
    const path = entry.path ? String(entry.path).slice(0, 200) : null;
    const ip = clientIp(entry.ip);

    // Consola para Render (sin correo en claro).
    console.log(
      JSON.stringify({
        kind: 'access_log',
        action,
        status,
        accountId,
        path,
        ip,
        at,
      }),
    );

    try {
      // http_401 anónimos: agrupar por IP + minuto para no llenar la colección.
      if (action === 'http_401' && !accountId) {
        const minute = Math.floor(at / 60_000);
        const bucketIp = ip || 'unknown';
        const id = `al-401-${bucketIp}-${minute}`;
        const existing = await this.store.findOne('access_log', { id });
        if (existing) {
          await this.store.updateOne(
            'access_log',
            { id },
            {
              $inc: { count: 1 },
              $set: { at, path: path || existing.path || null },
            },
          );
          return;
        }
        await this.store.upsert('access_log', { id }, {
          id,
          action,
          accountId: null,
          emailHash: null,
          status: status ?? 401,
          path,
          ip: bucketIp === 'unknown' ? null : bucketIp,
          count: 1,
          at,
          expireAt: new Date(at),
        });
        return;
      }

      const id = `al-${at}-${Math.random().toString(36).slice(2, 8)}`;
      await this.store.upsert('access_log', { id }, {
        id,
        action,
        accountId,
        emailHash,
        status,
        path,
        ip,
        at,
        expireAt: new Date(at),
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
