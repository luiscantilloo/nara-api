import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_PATIENT_MODULES,
  NARA_ROLES,
  ROLE_LABEL_TO_ID,
  normalizeModuleIds,
  type DocumentStore,
} from '@nara/common';
import { DOCUMENT_STORE, MongoStore } from '@nara/database';
import { SessionService, hashPassword } from '@nara/auth-core';
import { requireRoles } from '../shared/require-roles';
import { listCollection } from '../shared/list-collection';

@Injectable()
export class AccountsService {
  constructor(
    @Inject(DOCUMENT_STORE) private readonly store: DocumentStore,
    private readonly mongo: MongoStore,
    private readonly sessions: SessionService,
  ) {}

  list(token: string | null) {
    return listCollection(
      this.store,
      this.sessions,
      token,
      'accounts',
      ['admin'],
      'accounts',
      {
        name: 1,
      },
    );
  }

  async me(token: string | null) {
    const auth = await requireRoles(this.sessions, token);
    if ('error' in auth) return auth.error;
    return { ok: true, status: 200, account: auth.user };
  }

  async mePatch(token: string | null, body: Record<string, unknown>) {
    const auth = await requireRoles(this.sessions, token);
    if ('error' in auth) return auth.error;
    const name = String(body.name || '').trim();
    const contact = String(body.contact || '').trim();
    const org = String(body.org || '').trim();
    if (!name) return { ok: false, status: 400, error: 'Escriba su nombre.' };
    if (!contact)
      return {
        ok: false,
        status: 400,
        error: 'Escriba un correo o celular de contacto.',
      };

    const db = await this.mongo.db();
    const now = new Date();
    const setDoc: Record<string, unknown> = { name, contact, updatedAt: now };
    if (org) setDoc.org = org;
    if (/@/.test(contact)) {
      const email = contact.toLowerCase();
      const clash = await db
        .collection('accounts')
        .findOne({ email, id: { $ne: auth.user.id } });
      if (clash)
        return {
          ok: false,
          status: 409,
          error: 'Ese correo ya está en uso por otra cuenta.',
        };
      setDoc.email = email;
    }
    await db
      .collection('accounts')
      .updateOne({ id: auth.user.id }, { $set: setDoc });
    const user = await this.sessions.loadUser(auth.user.id);
    if (!user)
      return { ok: false, status: 401, error: 'Cuenta no disponible.' };
    return { ok: true, status: 200, user };
  }

  async upsert(token: string | null, body: Record<string, unknown>) {
    const auth = await requireRoles(this.sessions, token, ['admin']);
    if ('error' in auth) return auth.error;

    const name = String(body.name || '').trim();
    const contact = String(body.contact || body.email || '').trim();
    const role = String(body.role || '').trim();
    const password = String(body.password || '');
    const emailRaw = String(body.email || (/@/.test(contact) ? contact : ''))
      .trim()
      .toLowerCase();
    if (!name || !contact)
      return {
        ok: false,
        status: 400,
        error: 'Escriba el nombre y un correo o celular.',
      };
    if (!emailRaw || !/@/.test(emailRaw)) {
      return {
        ok: false,
        status: 400,
        error: 'Para crear acceso con contraseña use un correo.',
      };
    }
    if (!ROLE_LABEL_TO_ID[role])
      return { ok: false, status: 400, error: 'Rol no válido.' };

    const db = await this.mongo.db();
    const col = db.collection('accounts');
    const existingById = body.id ? await col.findOne({ id: body.id }) : null;
    const existingByEmail = await col.findOne({ email: emailRaw });
    if (!existingById && !password) {
      return {
        ok: false,
        status: 400,
        error: 'Defina una contraseña para el nuevo usuario.',
      };
    }
    if (password && password.length < 8) {
      return {
        ok: false,
        status: 400,
        error: 'La contraseña debe tener al menos 8 caracteres.',
      };
    }
    if (
      existingByEmail &&
      (!existingById || existingByEmail.id !== existingById.id)
    ) {
      return {
        ok: false,
        status: 409,
        error: 'Ya existe una cuenta con ese correo.',
      };
    }

    const roleId = ROLE_LABEL_TO_ID[role];
    const roleDoc = NARA_ROLES.find((r) => r.id === roleId);
    const now = new Date();
    const id = String(
      existingById?.id || body.id || `u${Date.now().toString(36)}`,
    );
    const status =
      body.status === 'Inactivo'
        ? 'Inactivo'
        : body.status === 'Activo'
          ? 'Activo'
          : (existingById?.status as string) || 'Activo';

    const rawTerr = String(body.terr || '').trim();
    const singleTerr = rawTerr
      .split(/\s*[,;/|]\s*|\s+y\s+/i)
      .map((x) => x.trim())
      .filter(Boolean)[0] || '';
    if (roleId === 'experto') {
      if (!singleTerr || /^todos$/i.test(singleTerr)) {
        return {
          ok: false,
          status: 400,
          error: 'El experto de campo debe tener un único territorio asignado.',
        };
      }
      if (!(await db.collection('territories').findOne({ name: singleTerr }))) {
        return {
          ok: false,
          status: 400,
          error: 'Ese territorio no existe en la base de datos.',
        };
      }
      const other = await db.collection('experts').findOne({
        terr: singleTerr,
        active: { $ne: false },
        accountId: { $ne: id },
        id: { $ne: id },
      });
      if (other && other.accountId !== id) {
        return {
          ok: false,
          status: 409,
          error:
            'El territorio «' +
            singleTerr +
            '» ya tiene experto asignado (' +
            String(other.name || other.id) +
            '). Cada territorio solo puede tener uno.',
        };
      }
    }

    const setDoc: Record<string, unknown> = {
      id,
      name,
      email: emailRaw,
      contact,
      role,
      roleId,
      terr:
        roleId === 'experto'
          ? singleTerr
          : singleTerr || 'Todos',
      org:
        role === 'Observador' ? String(body.org || '').trim() : 'Programa NARA',
      status,
      updatedAt: now,
    };
    if (role === 'Observador') {
      // Un solo rol Observador (sin tipos Financiador / Investigación / Institución).
      setDoc.modules = Array.isArray(body.modules) ? body.modules : [];
    }
    let patientModules = DEFAULT_PATIENT_MODULES.slice();
    if (role === 'Paciente') {
      patientModules = normalizeModuleIds(body.patientModules);
      setDoc.patientModules = patientModules;
    }
    if (password) setDoc.passwordHash = await hashPassword(password);

    const update: Record<string, unknown> = {
      $set: setDoc,
      $setOnInsert: { createdAt: now, created: true },
    };
    if (role === 'Observador') {
      update.$unset = { orgType: '', ethics: '' };
    }

    await col.updateOne({ id }, update, { upsert: true });

    if (roleId === 'paciente') {
      await this.syncPatient(
        db,
        id,
        name,
        emailRaw,
        contact,
        setDoc.terr,
        patientModules,
        existingById,
        now,
      );
    }
    if (roleId === 'experto') {
      try {
        await this.syncExpert(db, id, name, contact, setDoc.terr, status, now);
      } catch (err) {
        return {
          ok: false,
          status: 409,
          error:
            err instanceof Error
              ? err.message
              : 'No se pudo sincronizar el experto de campo.',
        };
      }
    }

    const saved = await col.findOne({ id });
    const { passwordHash: _p, ...publicAcc } = (saved || setDoc) as Record<
      string,
      unknown
    >;
    return {
      ok: true,
      status: 200,
      account: publicAcc,
      href: roleDoc?.href || '/ingreso',
      passwordSet: !!password,
    };
  }

  private async syncPatient(
    db: Awaited<ReturnType<MongoStore['db']>>,
    id: string,
    name: string,
    emailRaw: string,
    contact: string,
    terr: unknown,
    patientModules: string[],
    existingById: Record<string, unknown> | null,
    now: Date,
  ) {
    const patientId = String(existingById?.patientId || `sm-acc-${id}`);
    const existingPatient =
      (await db.collection('patients').findOne({ accountId: id })) ||
      (await db.collection('patients').findOne({ email: emailRaw })) ||
      (await db.collection('patients').findOne({ id: patientId }));
    const pid = String(existingPatient?.id || patientId);
    const prevVisible = normalizeModuleIds(existingPatient?.modulesVisible);
    const modulesVisible = prevVisible.filter((m) =>
      patientModules.includes(m),
    );
    await db.collection('patients').updateOne(
      { id: pid },
      {
        $set: {
          id: pid,
          accountId: id,
          name,
          email: emailRaw,
          phone: /@/.test(contact)
            ? String(existingPatient?.phone || '')
            : contact,
          terr,
          place: String(existingPatient?.place || terr || ''),
          modulesEnabled: patientModules,
          modulesVisible: modulesVisible.length
            ? modulesVisible
            : patientModules,
          updatedAt: now,
        },
        $setOnInsert: {
          age: 0,
          profile: null,
          phq: [],
          phqDates: [],
          expert: '',
          clin: null,
          next: 'Primera llamada dentro de 7 días',
          nextShort: 'Primera llamada',
          consent: true,
          signal: 'Pendiente de evaluación',
          ctx: { dano: 0, perdida: 0 },
          timeline: [],
          createdAt: now,
        },
      },
      { upsert: true },
    );
    await db
      .collection('accounts')
      .updateOne({ id }, { $set: { patientId: pid } });
  }

  private async syncExpert(
    db: Awaited<ReturnType<MongoStore['db']>>,
    id: string,
    name: string,
    contact: string,
    terr: unknown,
    status: string,
    now: Date,
  ) {
    const terrName = String(terr || '').trim();
    const existingExpert =
      (await db.collection('experts').findOne({ accountId: id })) ||
      (await db.collection('experts').findOne({ name }));
    if (terrName && status === 'Activo') {
      const occupied = await db.collection('experts').findOne({
        terr: terrName,
        active: { $ne: false },
        ...(existingExpert?.id
          ? { id: { $ne: existingExpert.id } }
          : { accountId: { $ne: id } }),
      });
      if (occupied) {
        throw new Error(
          'El territorio «' +
            terrName +
            '» ya tiene experto asignado (' +
            String(occupied.name || occupied.id) +
            ').',
        );
      }
    }
    const expertKey = existingExpert ? { id: existingExpert.id } : { name };
    await db.collection('experts').updateOne(
      expertKey,
      {
        $set: {
          accountId: id,
          name,
          phone: contact,
          terr: terrName,
          active: status === 'Activo',
          updatedAt: now,
        },
        $setOnInsert: {
          id: existingExpert?.id || id,
          target: 9,
          today: 0,
          week: 0,
          training: 'Pendiente',
          createdAt: now,
        },
      },
      { upsert: true },
    );
  }
}
