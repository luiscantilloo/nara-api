import { Injectable } from '@nestjs/common';
import { inScope, normalizeModuleIds } from '@nara/common';
import { MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { requireRoles } from '../shared/require-roles';
import { publicPatient } from '../shared/mappers/patient.mapper';

@Injectable()
export class PatientsUpsertService {
  constructor(
    private readonly mongo: MongoStore,
    private readonly sessions: SessionService,
  ) {}

  async upsert(data: { token: string | null; body: Record<string, unknown> }) {
    const auth = await requireRoles(this.sessions, data.token, [
      'admin',
      'experto',
      'clinico',
      'paciente',
    ]);
    if ('error' in auth) return auth.error;

    const body = data.body || {};
    const id = String(body.id || '').trim();
    const name = String(body.name || '').trim();
    if (!id || !name)
      return { ok: false, status: 400, error: 'id y name son obligatorios.' };
    const now = new Date();
    const db = await this.mongo.db();

    // Paciente: Crisis (ayuda) o Activo (estoy bien) en su propia ficha.
    if (auth.user.roleId === 'paciente') {
      const account = await db
        .collection('accounts')
        .findOne({ id: auth.user.id });
      const linked =
        (account?.patientId ? String(account.patientId) : '') ||
        (
          await db.collection('patients').findOne({ accountId: auth.user.id })
        )?.id;
      const ownId = linked ? String(linked) : '';
      if (!ownId) {
        return {
          ok: false,
          status: 403,
          error: 'Sin ficha vinculada.',
        };
      }
      // Siempre escribe sobre la ficha vinculada (ignora id erróneo del cliente).
      const status = String(body.status || body.signal || '').trim();
      const isCrisis = /^crisis$/i.test(status);
      const isInactive =
        /^inactivo$/i.test(status) || body.inactiveLock === true;
      const isWell =
        /^activo$/i.test(status) ||
        body.crisisLock === false ||
        body.inactiveLock === false;
      if (!isCrisis && !isInactive && !isWell) {
        return {
          ok: false,
          status: 403,
          error:
            'El paciente solo puede reportar Crisis, Inactivo o confirmar Volví / estoy bien.',
        };
      }
      const patientId = ownId;
      const patch: Record<string, unknown> = {
        updatedAt: now,
      };
      if (isCrisis) {
        Object.assign(patch, {
          status: 'Crisis',
          signal: 'Crisis',
          crisisLock: true,
          inactiveLock: false,
          crisisAttendedAt: null,
          crisisAttendedOutcome: null,
          crisisBtnReady: false,
        });
      } else if (isInactive && !isWell) {
        Object.assign(patch, {
          status: 'Inactivo',
          signal: 'Inactivo',
          inactiveLock: true,
        });
      } else {
        Object.assign(patch, {
          status: 'Activo',
          signal: 'Activo',
          crisisLock: false,
          inactiveLock: false,
          activeAt: Date.now(),
          crisisAttendedAt: null,
          crisisAttendedOutcome: null,
          crisisBtnReady: true,
          crisisBtnReadyAt: Date.now(),
        });
      }
      await db.collection('patients').updateOne({ id: patientId }, { $set: patch });
      await db.collection('people').updateOne(
        { id: patientId },
        {
          $set: {
            status: String(patch.status),
            inactiveLock: patch.inactiveLock === true,
            ...(patch.activeAt != null ? { activeAt: patch.activeAt } : {}),
            updatedAt: now,
          },
        },
      );
      const doc = await db.collection('patients').findOne({ id: patientId });
      if (!doc)
        return { ok: false, status: 404, error: 'Ficha no encontrada.' };
      return {
        ok: true,
        status: 200,
        patient: publicPatient(doc as Record<string, unknown>),
      };
    }

    // Resolver ficha canónica (worklist id ≠ people/patients id).
    let patientId = id;
    const byCode = body.code
      ? await db.collection('patients').findOne({ code: String(body.code) })
      : null;
    const byId = await db.collection('patients').findOne({ id });
    const byPeople =
      (await db.collection('people').findOne({ id })) ||
      (body.code
        ? await db.collection('people').findOne({ code: String(body.code) })
        : null) ||
      (await db.collection('people').findOne({ name }));
    if (byId?.id) patientId = String(byId.id);
    else if (byCode?.id) patientId = String(byCode.id);
    else if (byPeople?.id) patientId = String(byPeople.id);

    const existing =
      (await db.collection('patients').findOne({ id: patientId })) ||
      byId ||
      byCode ||
      null;

    const terr = String(
      body.terr != null
        ? body.terr
        : body.place != null
          ? body.place
          : existing?.terr || '',
    ).trim();
    // SPEC-02 FR-02.2: experto y clínico solo escriben fichas de su territorio.
    if (
      auth.user.roleId !== 'admin' &&
      ((existing && !inScope(auth.user, existing as { terr?: unknown })) ||
        !inScope(auth.user, { terr }))
    ) {
      return { ok: false, status: 403, error: 'Sin permiso para esta acción.' };
    }
    let expert = String(
      body.expert != null ? body.expert : existing?.expert || '',
    ).trim();
    if (terr && !expert) {
      const assigned = await db.collection('experts').findOne({
        terr,
        active: { $ne: false },
      });
      if (assigned?.name) expert = String(assigned.name);
    }

    const pickStr = (key: string, fallback = '') =>
      body[key] != null
        ? String(body[key])
        : String(existing?.[key] ?? fallback);

    const profile =
      body.profile !== undefined
        ? body.profile && /^P\d+$/i.test(String(body.profile))
          ? String(body.profile)
          : null
        : existing?.profile && /^P\d+$/i.test(String(existing.profile))
          ? String(existing.profile)
          : byPeople?.profile && /^P\d+$/i.test(String(byPeople.profile))
            ? String(byPeople.profile)
            : null;

    const status = String(
      body.status != null
        ? body.status
        : body.signal != null
          ? body.signal
          : existing?.status || existing?.signal || 'Nueva',
    );

    const modulesEnabled =
      body.modulesEnabled !== undefined
        ? normalizeModuleIds(body.modulesEnabled)
        : Array.isArray(existing?.modulesEnabled)
          ? normalizeModuleIds(existing.modulesEnabled)
          : normalizeModuleIds(undefined);
    const modulesVisible = normalizeModuleIds(
      body.modulesVisible !== undefined
        ? body.modulesVisible
        : existing?.modulesVisible ?? modulesEnabled,
    ).filter((m) => modulesEnabled.includes(m));

    const doc: Record<string, unknown> = {
      id: patientId,
      name: name || String(existing?.name || ''),
      firstName: pickStr('firstName'),
      lastName: pickStr('lastName'),
      email: pickStr('email').trim().toLowerCase(),
      age:
        body.age != null
          ? Number(body.age) || 0
          : Number(existing?.age) || 0,
      birthDate: pickStr('birthDate'),
      place: pickStr('place'),
      terr,
      departamento: pickStr('departamento'),
      municipio: pickStr('municipio'),
      profile,
      phone: pickStr('phone'),
      sexo: pickStr('sexo'),
      genero: pickStr('genero'),
      estadoCivil: pickStr('estadoCivil'),
      estrato: pickStr('estrato'),
      phq: Array.isArray(body.phq)
        ? body.phq
        : Array.isArray(existing?.phq)
          ? existing.phq
          : [],
      phqDates: Array.isArray(body.phqDates)
        ? body.phqDates
        : Array.isArray(existing?.phqDates)
          ? existing.phqDates
          : ['Hoy'],
      expert,
      clin:
        body.clin !== undefined
          ? body.clin || null
          : existing?.clin ?? byPeople?.clin ?? null,
      next: pickStr('next', 'Primera llamada dentro de 7 días'),
      nextShort: pickStr('nextShort', 'Primera llamada'),
      consent:
        body.consent !== undefined
          ? body.consent !== false
          : existing?.consent !== false,
      signal: String(body.signal != null ? body.signal : status),
      status,
      crisisLock:
        body.crisisLock !== undefined
          ? body.crisisLock === true
          : existing?.crisisLock === true,
      inactiveLock:
        body.inactiveLock !== undefined
          ? body.inactiveLock === true
          : existing?.inactiveLock === true,
      activeAt:
        body.activeAt !== undefined
          ? body.activeAt == null
            ? null
            : Number(body.activeAt) || Date.now()
          : existing?.activeAt != null
            ? Number(existing.activeAt) || null
            : null,
      crisisAttendedAt:
        body.crisisAttendedAt !== undefined
          ? body.crisisAttendedAt == null
            ? null
            : Number(body.crisisAttendedAt) || null
          : existing?.crisisAttendedAt != null
            ? Number(existing.crisisAttendedAt) || null
            : null,
      crisisAttendedOutcome:
        body.crisisAttendedOutcome !== undefined
          ? body.crisisAttendedOutcome
            ? String(body.crisisAttendedOutcome)
            : null
          : existing?.crisisAttendedOutcome
            ? String(existing.crisisAttendedOutcome)
            : null,
      crisisBtnReady:
        body.crisisBtnReady !== undefined
          ? body.crisisBtnReady === true
          : existing?.crisisBtnReady === true,
      summary:
        body.summary !== undefined ? body.summary : existing?.summary ?? null,
      adherence:
        body.adherence !== undefined
          ? body.adherence
          : (existing?.adherence ?? null),
      sleep: body.sleep !== undefined ? body.sleep : existing?.sleep ?? null,
      braceletStatus: pickStr('braceletStatus'),
      audios:
        body.audios != null
          ? Number(body.audios) || 0
          : Number(existing?.audios) || 0,
      timeline: Array.isArray(body.timeline)
        ? body.timeline
        : Array.isArray(existing?.timeline)
          ? existing.timeline
          : [],
      ctx: body.ctx || existing?.ctx || { dano: 0, perdida: 0 },
      modulesEnabled,
      modulesVisible: modulesVisible.length ? modulesVisible : modulesEnabled,
      source: pickStr('source'),
      accountId:
        body.accountId !== undefined
          ? body.accountId
          : existing?.accountId ?? null,
      pendingEval:
        body.pendingEval !== undefined
          ? body.pendingEval === true
          : existing?.pendingEval === true,
      code: String(
        body.code || existing?.code || byPeople?.code || '',
      ),
      updatedAt: now,
    };

    if (body.previousProfile !== undefined) {
      doc.previousProfile =
        body.previousProfile && /^P\d+$/i.test(String(body.previousProfile))
          ? String(body.previousProfile)
          : null;
    } else if (existing && 'previousProfile' in existing) {
      doc.previousProfile = existing.previousProfile;
    }

    if (body.evalPhq != null) doc.evalPhq = Number(body.evalPhq);
    else if (existing?.evalPhq != null) doc.evalPhq = existing.evalPhq;
    if (body.evalDig != null) doc.evalDig = Number(body.evalDig);
    else if (existing?.evalDig != null) doc.evalDig = existing.evalDig;
    if (body.evalBy != null) doc.evalBy = String(body.evalBy);
    else if (existing?.evalBy != null) doc.evalBy = existing.evalBy;
    if (body.evalAt != null) doc.evalAt = Number(body.evalAt) || Date.now();
    else if (existing?.evalAt != null) doc.evalAt = existing.evalAt;
    if (body.finalEvalAt !== undefined) {
      doc.finalEvalAt =
        body.finalEvalAt == null
          ? null
          : Number(body.finalEvalAt) || Date.now();
    } else if (existing?.finalEvalAt != null) {
      doc.finalEvalAt = existing.finalEvalAt;
    }

    await db.collection('patients').updateOne(
      { id: patientId },
      { $set: doc, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    return {
      ok: true,
      status: 200,
      patient: publicPatient({ ...doc, id: patientId }),
    };
  }
}
