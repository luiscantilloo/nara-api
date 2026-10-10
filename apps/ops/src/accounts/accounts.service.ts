import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_PATIENT_MODULES,
  NARA_ROLES,
  clinicoDelTerritorio,
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

  async list(token: string | null) {
    // H-002: el admin lista todas las cuentas. El clínico solo necesita lastLoginAt de los pacientes
    // de su territorio para derivar «Inactivo»: recibe esas cuentas sin correo, teléfono ni nombre.
    const auth = await requireRoles(this.sessions, token, ['admin', 'clinico']);
    if ('error' in auth) return auth.error;
    if (auth.user.roleId === 'admin') {
      return listCollection(this.store, this.sessions, token, 'accounts', ['admin'], 'accounts', { name: 1 });
    }
    const terr = String(auth.user.terr || '');
    const rows = await this.store.findMany(
      'accounts',
      { roleId: 'paciente', terr },
      { limit: 20000 },
    );
    return {
      ok: true,
      status: 200,
      accounts: rows.map((a) => ({
        id: a.id,
        roleId: a.roleId,
        role: a.role,
        terr: a.terr,
        status: a.status,
        patientId: a.patientId ?? null,
        lastLoginAt: a.lastLoginAt ?? null,
      })),
    };
  }

  async me(token: string | null) {
    const auth = await requireRoles(this.sessions, token);
    if ('error' in auth) return auth.error;
    return { ok: true, status: 200, account: auth.user };
  }

  async mePatch(token: string | null, body: Record<string, unknown>) {
    const auth = await requireRoles(this.sessions, token);
    if ('error' in auth) return auth.error;
    const db = await this.mongo.db();
    const now = new Date();

    // Ping de actividad (clics / uso de la app) → renueva lastLoginAt.
    if (body.touch === true) {
      const at = Date.now();
      await db
        .collection('accounts')
        .updateOne(
          { id: auth.user.id },
          { $set: { lastLoginAt: at, updatedAt: now } },
        );
      return { ok: true, status: 200, lastLoginAt: at };
    }

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

    let syncedPerson: Record<string, unknown> | null = null;
    if (roleId === 'paciente') {
      syncedPerson = await this.syncPatient(
        db,
        id,
        name,
        emailRaw,
        contact,
        setDoc.terr,
        patientModules,
        existingById,
        now,
        body,
      );
      if (syncedPerson?.id) {
        await col.updateOne(
          { id },
          {
            $set: {
              patientId: syncedPerson.id,
              personId: syncedPerson.id,
            },
          },
        );
      }
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
      person: syncedPerson || undefined,
      href: roleDoc?.href || '/ingreso',
      passwordSet: !!password,
    };
  }

  private async resolveExpertForTerr(
    db: Awaited<ReturnType<MongoStore['db']>>,
    terrName: string,
  ): Promise<{ name: string; id: string } | null> {
    if (!terrName) return null;
    const ex = await db.collection('experts').findOne({
      terr: terrName,
      active: { $ne: false },
    });
    if (ex) {
      return {
        name: String(ex.name || ''),
        id: String(ex.accountId || ex.id || ''),
      };
    }
    // Fallback: cuenta con rol experto en ese territorio.
    const acc = await db.collection('accounts').findOne({
      terr: terrName,
      status: 'Activo',
      $or: [{ roleId: 'experto' }, { role: 'Experto de campo' }],
    });
    if (acc) {
      return {
        name: String(acc.name || ''),
        id: String(acc.id || ''),
      };
    }
    return null;
  }

  private async nextPersonCode(
    db: Awaited<ReturnType<MongoStore['db']>>,
    terrName: string,
  ): Promise<string> {
    const TCODE: Record<string, string> = {
      Salento: 'SAL',
      Armenia: 'ARM',
      Calarcá: 'CAL',
      Pereira: 'PER',
      Manizales: 'MAN',
      Chinchiná: 'CHI',
      Prueba: 'PRU',
    };
    const pre =
      TCODE[terrName] || terrName.slice(0, 3).toUpperCase() || 'NAR';
    const count = await db.collection('people').countDocuments();
    return `${pre}-${1000 + count + 1}`;
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
    body: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const fromBody = String(body.personId || body.patientId || '').trim();
    const origin = String(body.origin || body.source || '').toLowerCase();
    const fromAdmin =
      origin === 'admin' ||
      origin === 'importacion' ||
      origin === 'import' ||
      origin === 'manual';
    // Admin / importación → Sin evaluación. Experto (tras eval) → Por aprobar.
    const forcedStatus = String(body.patientStatus || '').trim();

    const patientId = String(
      fromBody || existingById?.patientId || `sm-acc-${id}`,
    );
    let personDoc = fromBody
      ? await db.collection('people').findOne({
          $or: [{ id: fromBody }, { code: fromBody }],
        })
      : null;
    const existingPatient =
      (fromBody
        ? await db.collection('patients').findOne({
            $or: [{ id: fromBody }, { code: fromBody }],
          })
        : null) ||
      (await db.collection('patients').findOne({ accountId: id })) ||
      (await db.collection('patients').findOne({ email: emailRaw })) ||
      (await db.collection('patients').findOne({ id: patientId }));
    const pid = String(
      existingPatient?.id || personDoc?.id || patientId,
    );

    const bodyFirst = String(body.firstName || '').trim();
    const bodyLast = String(body.lastName || '').trim();
    const firstName = String(
      bodyFirst || personDoc?.firstName || existingPatient?.firstName || '',
    ).trim();
    const lastName = String(
      bodyLast || personDoc?.lastName || existingPatient?.lastName || '',
    ).trim();
    const fullName =
      [firstName, lastName].filter(Boolean).join(' ') ||
      String(personDoc?.name || '').trim() ||
      name;
    const place = String(
      body.place || personDoc?.place || existingPatient?.place || '',
    ).trim();
    const birthDate = String(
      body.birthDate || personDoc?.birthDate || existingPatient?.birthDate || '',
    );
    const age =
      Number(body.age) ||
      Number(personDoc?.age ?? existingPatient?.age) ||
      0;
    const genero = String(
      body.genero || personDoc?.genero || existingPatient?.genero || '',
    );
    const estadoCivil = String(
      body.estadoCivil ||
        personDoc?.estadoCivil ||
        existingPatient?.estadoCivil ||
        '',
    );
    const estrato = String(
      body.estrato || personDoc?.estrato || existingPatient?.estrato || '',
    );
    const phoneFromPerson = String(
      body.phone || personDoc?.phone || existingPatient?.phone || '',
    );
    const phone = /@/.test(contact) ? phoneFromPerson : contact || phoneFromPerson;
    const terrName = String(body.terr || personDoc?.terr || terr || '').trim();
    const rural =
      body.rural != null
        ? !!body.rural
        : /vereda/i.test(place) ||
          !!(personDoc?.rural ?? existingPatient?.rural);
    const source = String(
      body.source ||
        personDoc?.source ||
        existingPatient?.source ||
        (fromAdmin ? (origin === 'manual' ? 'admin-manual' : 'admin') : ''),
    );

    // Clínico por territorio (misma lógica de campo).
    let clin = String(personDoc?.clin || existingPatient?.clin || body.clin || '').trim();
    if (!clin && terrName) {
      // H-009: la cuenta Clínico activa del territorio, no un nombre fijo.
      clin = (await clinicoDelTerritorio((c, q) => db.collection(c).findOne(q), terrName)) || '';
    }

    // Experto del territorio al crear (no esperar a la evaluación).
    let expert = String(
      body.expert || personDoc?.expert || existingPatient?.expert || '',
    ).trim();
    let expertId = String(
      body.expertId ||
        personDoc?.expertId ||
        existingPatient?.expertId ||
        '',
    ).trim();
    if ((!expert || !expertId) && terrName) {
      const assigned = await this.resolveExpertForTerr(db, terrName);
      if (assigned) {
        if (!expert) expert = assigned.name;
        if (!expertId) expertId = assigned.id;
      }
    }

    // Código NARA al crear (no esperar a la evaluación).
    let code = String(
      personDoc?.code || existingPatient?.code || body.code || '',
    ).trim();
    if (!code) {
      code = await this.nextPersonCode(db, terrName);
    }

    // Manual/import admin → Sin evaluación. Enlace a ficha de campo → respeta estado existente.
    const clinicalStatus = String(
      forcedStatus ||
        (!fromBody && fromAdmin
          ? 'Sin evaluación'
          : personDoc?.status ||
            existingPatient?.status ||
            (fromAdmin ? 'Sin evaluación' : 'Por aprobar')),
    );
    const profile = personDoc?.profile ?? existingPatient?.profile ?? null;

    const prevVisible = normalizeModuleIds(existingPatient?.modulesVisible);
    const modulesVisible = prevVisible.filter((m) =>
      patientModules.includes(m),
    );

    const peopleSet: Record<string, unknown> = {
      id: pid,
      code,
      name: fullName,
      firstName,
      lastName,
      email: emailRaw,
      phone,
      terr: terrName,
      place: place || terrName,
      rural,
      age,
      birthDate,
      genero,
      estadoCivil,
      estrato,
      accountId: id,
      expert,
      expertId,
      clin,
      status: clinicalStatus,
      updatedAt: now,
    };

    if (!fromBody) {
      // Alta manual (o importación): crear ficha completa en people.
      await db.collection('people').updateOne(
        { id: pid },
        {
          $set: {
            ...peopleSet,
            profile: null,
            source: source || 'admin-manual',
          },
          $setOnInsert: {
            week: 0,
            weeks: 13,
            createdAt: now,
          },
        },
        { upsert: true },
      );
    } else {
      // Desde campo: enlazar cuenta y completar experto/código/clínico si faltaban.
      const peopleQ = personDoc?.id
        ? { id: String(personDoc.id) }
        : { $or: [{ id: fromBody }, { code: fromBody }] };
      const patch: Record<string, unknown> = {
        accountId: id,
        email: emailRaw,
        updatedAt: now,
      };
      if (firstName) patch.firstName = firstName;
      if (lastName) patch.lastName = lastName;
      if (code) patch.code = code;
      if (expert) patch.expert = expert;
      if (expertId) patch.expertId = expertId;
      if (clin) patch.clin = clin;
      if (terrName && !personDoc?.terr) patch.terr = terrName;
      await db.collection('people').updateOne(peopleQ, { $set: patch });
    }

    personDoc = await db.collection('people').findOne({ id: pid });
    if (!personDoc && fromBody) {
      personDoc = await db.collection('people').findOne({
        $or: [{ id: fromBody }, { code: fromBody }],
      });
    }
    const finalCode = String(personDoc?.code || code);
    const finalExpert = String(personDoc?.expert || expert);
    const finalExpertId = String(personDoc?.expertId || expertId);
    const finalClin = personDoc?.clin ?? clin;

    await db.collection('patients').updateOne(
      { id: String(personDoc?.id || pid) },
      {
        $set: {
          id: String(personDoc?.id || pid),
          code: finalCode,
          accountId: id,
          name: fullName,
          firstName,
          lastName,
          email: emailRaw,
          phone,
          terr: String(personDoc?.terr || terrName),
          place: place || terrName,
          rural,
          age,
          birthDate,
          sexo: String(personDoc?.sexo || existingPatient?.sexo || ''),
          genero,
          estadoCivil,
          estrato,
          source,
          profile,
          status: clinicalStatus,
          signal: clinicalStatus,
          expert: finalExpert,
          expertId: finalExpertId,
          clin: finalClin,
          week: Number(personDoc?.week ?? existingPatient?.week) || 0,
          weeks: Number(personDoc?.weeks ?? existingPatient?.weeks) || 13,
          modulesEnabled: patientModules,
          modulesVisible: modulesVisible.length
            ? modulesVisible
            : patientModules,
          updatedAt: now,
        },
        $setOnInsert: {
          phq: [],
          phqDates: [],
          next: 'Primera llamada dentro de 7 días',
          nextShort: 'Primera llamada',
          consent: true,
          ctx: { dano: 0, perdida: 0 },
          timeline: [],
          createdAt: now,
        },
      },
      { upsert: true },
    );

    return (personDoc || {
      id: pid,
      code: finalCode,
      name: fullName,
      expert: finalExpert,
      expertId: finalExpertId,
      clin: finalClin,
      terr: terrName,
      status: clinicalStatus,
    }) as Record<string, unknown>;
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
