import { Inject, Injectable } from '@nestjs/common';
import type { DocumentStore } from '@nara/common';
import { DOCUMENT_STORE } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { requireRoles } from '../shared/require-roles';
import { publicPerson } from '../shared/mappers/person.mapper';

@Injectable()
export class PeopleService {
  constructor(
    @Inject(DOCUMENT_STORE) private readonly store: DocumentStore,
    private readonly sessions: SessionService,
  ) {}

  async list(data: {
    token: string | null;
    limit?: number;
    skip?: number;
    terr?: string;
    q?: string;
  }) {
    const auth = await requireRoles(this.sessions, data.token, [
      'admin',
      'experto',
      'clinico',
      'observador',
    ]);
    if ('error' in auth) return auth.error;

    const filter: Record<string, unknown> = {};
    if (data.terr) filter.terr = data.terr;
    if (data.q) filter.name = { $regex: data.q, $options: 'i' };
    const limit = Math.min(Math.max(Number(data.limit) || 5000, 1), 20000);
    const skip = Math.max(Number(data.skip) || 0, 0);
    const [total, rows] = await Promise.all([
      this.store.count('people', filter),
      this.store.findMany('people', filter, { sort: { name: 1 }, limit, skip }),
    ]);
    return {
      ok: true,
      status: 200,
      total,
      limit,
      skip,
      people: rows.map(publicPerson),
    };
  }

  /**
   * Experto activo del territorio (uno solo). Si hay varios, el de menor carga.
   */
  private async resolveTerritoryExpert(terr: string): Promise<{
    id: string;
    name: string;
  } | null> {
    if (!terr) return null;
    const experts = await this.store.findMany(
      'experts',
      { terr, active: { $ne: false } },
      { sort: { name: 1 }, limit: 20 },
    );
    if (!experts.length) return null;
    if (experts.length === 1) {
      return {
        id: String(experts[0].id),
        name: String(experts[0].name || ''),
      };
    }
    const counts = await Promise.all(
      experts.map(async (e) => ({
        e,
        n: await this.store.count('people', {
          $or: [{ expertId: e.id }, { expert: e.name }],
        }),
      })),
    );
    counts.sort((a, b) => a.n - b.n);
    const pick = counts[0].e;
    return { id: String(pick.id), name: String(pick.name || '') };
  }

  async upsert(data: { token: string | null; body: Record<string, unknown> }) {
    const auth = await requireRoles(this.sessions, data.token, [
      'admin',
      'experto',
      'clinico',
      'paciente',
    ]);
    if ('error' in auth) return auth.error;

    const body = data.body || {};
    const name = String(body.name || '').trim();
    if (!name)
      return { ok: false, status: 400, error: 'El nombre es obligatorio.' };
    const now = new Date();
    const bodyId = String(body.id || '').trim();
    const bodyCode = String(body.code || '').trim();

    // Paciente: Crisis (ayuda) o Activo (estoy bien) en su propia persona.
    if (auth.user.roleId === 'paciente') {
      const account = await this.store.findOne('accounts', {
        id: auth.user.id,
      });
      const linked =
        (account?.patientId ? String(account.patientId) : '') ||
        (
          await this.store.findOne('patients', { accountId: auth.user.id })
        )?.id;
      const ownId = linked ? String(linked) : bodyId;
      if (!ownId) {
        return {
          ok: false,
          status: 404,
          error: 'Sin ficha vinculada.',
        };
      }
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
      const nextStatus = isCrisis
        ? 'Crisis'
        : isInactive && !isWell
          ? 'Inactivo'
          : 'Activo';
      const patientPatch: Record<string, unknown> = isCrisis
        ? {
            status: 'Crisis',
            signal: 'Crisis',
            crisisLock: true,
            inactiveLock: false,
            crisisAttendedAt: null,
            crisisAttendedOutcome: null,
            crisisBtnReady: false,
            updatedAt: now,
          }
        : isInactive && !isWell
          ? {
              status: 'Inactivo',
              signal: 'Inactivo',
              inactiveLock: true,
              updatedAt: now,
            }
          : {
              status: 'Activo',
              signal: 'Activo',
              crisisLock: false,
              inactiveLock: false,
              activeAt: Date.now(),
              crisisAttendedAt: null,
              crisisAttendedOutcome: null,
              crisisBtnReady: true,
              crisisBtnReadyAt: Date.now(),
              updatedAt: now,
            };
      await this.store.updateOne(
        'people',
        { id: ownId },
        {
          $set: {
            status: nextStatus,
            inactiveLock: nextStatus === 'Inactivo',
            ...(nextStatus === 'Activo' ? { activeAt: Date.now() } : {}),
            updatedAt: now,
          },
        },
      );
      await this.store.updateOne('patients', { id: ownId }, { $set: patientPatch });
      const person = await this.store.findOne('people', { id: ownId });
      if (!person)
        return { ok: false, status: 404, error: 'Persona no encontrada.' };
      return { ok: true, status: 200, person: publicPerson(person) };
    }

    // Resolver ficha real: el worklist a veces manda otro id distinto al de people.
    let existing =
      (bodyId ? await this.store.findOne('people', { id: bodyId }) : null) ||
      (bodyCode
        ? await this.store.findOne('people', { code: bodyCode })
        : null) ||
      (name ? await this.store.findOne('people', { name }) : null);
    const id = String(existing?.id || bodyId || `p${Date.now().toString(36)}`);
    if (!existing && bodyId) {
      existing = await this.store.findOne('people', { id: bodyId });
    }
    const terr = String(body.terr ?? existing?.terr ?? '').trim();
    const pre =
      (
        { Salento: 'SAL', Armenia: 'ARM', Calarcá: 'CAL' } as Record<
          string,
          string
        >
      )[terr] ||
      terr.slice(0, 3).toUpperCase() ||
      'NAR';
    const count = await this.store.count('people');
    const code = String(
      body.code || existing?.code || `${pre}-${1000 + count + 1}`,
    );

    let expert = String(body.expert ?? existing?.expert ?? '').trim();
    let expertId =
      body.expertId != null
        ? body.expertId
          ? String(body.expertId)
          : null
        : (existing?.expertId as string | null) || null;
    // Autoasignación: persona nueva en un territorio → el experto de ese territorio.
    if (terr && (!expert || !expertId)) {
      const assigned = await this.resolveTerritoryExpert(terr);
      if (assigned) {
        if (!expert) expert = assigned.name;
        if (!expertId) expertId = assigned.id;
      }
    }

    const profileRaw =
      body.profile !== undefined ? body.profile : existing?.profile;
    const status =
      body.status != null
        ? String(body.status)
        : String(existing?.status || 'Sin evaluación');

    const pick = (key: string, fallback = '') =>
      body[key] != null ? String(body[key]) : String(existing?.[key] ?? fallback);

    const doc: Record<string, unknown> = {
      id,
      code,
      name: name || String(existing?.name || ''),
      firstName: pick('firstName'),
      lastName: pick('lastName'),
      age:
        body.age != null
          ? Number(body.age) || 0
          : Number(existing?.age) || 0,
      birthDate: pick('birthDate'),
      place:
        body.place != null
          ? String(body.place)
          : String(existing?.place || ''),
      rural:
        body.rural !== undefined
          ? body.rural !== false
          : existing?.rural !== false,
      terr,
      profile:
        profileRaw && /^P\d+$/i.test(String(profileRaw))
          ? String(profileRaw)
          : profileRaw === null
            ? null
            : existing?.profile || null,
      week:
        body.week != null
          ? Number(body.week) || 0
          : Number(existing?.week) || 0,
      weeks:
        body.weeks != null
          ? Number(body.weeks) || 13
          : Number(existing?.weeks) || 13,
      expert,
      expertId,
      status,
      inactiveLock:
        body.inactiveLock !== undefined
          ? body.inactiveLock === true
          : existing?.inactiveLock === true,
      activeAt:
        body.activeAt !== undefined
          ? body.activeAt == null
            ? null
            : Number(body.activeAt) || Date.now()
          : /^activo$/i.test(String(status)) &&
              !/^activo$/i.test(String(existing?.status || ''))
            ? Date.now() // primera vez que pasa a Activo → arranca reloj de inactividad
            : existing?.activeAt != null
              ? Number(existing.activeAt) || null
              : null,
      clin: (() => {
        if (body.clin !== undefined) return body.clin || null;
        if (existing?.clin) return existing.clin;
        // Clínico por territorio al crear la ficha (no esperar evaluación).
        const t = terr.toLowerCase();
        if (/pereira|dosquebradas|santa rosa|risaralda/.test(t)) {
          return 'Dr. Felipe Ruiz';
        }
        if (/manizales|chinchiná|chinchina|villamaría|villamaria|caldas/.test(t)) {
          return 'Dra. Carolina Úsuga';
        }
        return terr ? 'Dra. Lucía Marín' : null;
      })(),
      phone:
        body.phone != null
          ? String(body.phone)
          : String(existing?.phone || ''),
      email: pick('email').trim().toLowerCase(),
      sexo: pick('sexo'),
      genero: pick('genero'),
      estadoCivil: pick('estadoCivil'),
      estrato: pick('estrato'),
      pendingEval:
        body.pendingEval !== undefined
          ? body.pendingEval === true
          : existing?.pendingEval === true,
      evalAt:
        body.evalAt !== undefined
          ? body.evalAt == null
            ? null
            : Number(body.evalAt) || Date.now()
          : existing?.evalAt || null,
      evalBy:
        body.evalBy !== undefined
          ? body.evalBy == null
            ? null
            : String(body.evalBy)
          : existing?.evalBy || null,
      evalPhq:
        body.evalPhq !== undefined
          ? body.evalPhq == null
            ? null
            : Number(body.evalPhq)
          : existing?.evalPhq ?? null,
      evalDig:
        body.evalDig !== undefined
          ? body.evalDig == null
            ? null
            : Number(body.evalDig)
          : existing?.evalDig ?? null,
      finalEvalAt:
        body.finalEvalAt !== undefined
          ? body.finalEvalAt == null
            ? null
            : Number(body.finalEvalAt) || Date.now()
          : existing?.finalEvalAt || null,
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
    await this.store.upsert('people', { id }, doc);

    // Espejo clínico: Mis pacientes / admin leen colección patients.
    if (
      doc.profile ||
      doc.pendingEval === true ||
      body.pendingEval === false ||
      /por\s*aprobar|activo|aprobado|rechazad|terminado/i.test(
        String(doc.status || ''),
      )
    ) {
      const existingPat = await this.store.findOne('patients', { id });
      const patSet: Record<string, unknown> = {
        id,
        code: doc.code,
        name: doc.name,
        age: doc.age,
        place: doc.place || doc.terr || '',
        terr: doc.terr,
        phone: doc.phone,
        expert: doc.expert,
        clin: doc.clin,
        profile: doc.profile,
        status: doc.status,
        signal: doc.status,
        pendingEval: doc.pendingEval === true,
        previousProfile: doc.previousProfile ?? null,
        evalAt: doc.evalAt,
        evalBy: doc.evalBy,
        evalPhq: doc.evalPhq,
        evalDig: doc.evalDig,
        finalEvalAt: doc.finalEvalAt,
        inactiveLock: doc.inactiveLock === true,
        activeAt: doc.activeAt ?? null,
        updatedAt: now,
      };
      if (doc.evalPhq != null) {
        const prevPhq = Array.isArray(existingPat?.phq)
          ? (existingPat!.phq as number[])
          : [];
        const last = prevPhq.length ? prevPhq[prevPhq.length - 1] : null;
        if (last !== Number(doc.evalPhq)) {
          patSet.phq = prevPhq.concat([Number(doc.evalPhq)]);
          const prevDates = Array.isArray(existingPat?.phqDates)
            ? (existingPat!.phqDates as string[])
            : [];
          patSet.phqDates = prevDates.concat(['Hoy']);
        }
      }
      Object.keys(patSet).forEach((k) => {
        if (patSet[k] === undefined) delete patSet[k];
      });
      await this.store.upsert('patients', { id }, {
        ...(existingPat || {}),
        ...patSet,
      });
    }

    return { ok: true, status: 200, person: publicPerson(doc) };
  }
}
