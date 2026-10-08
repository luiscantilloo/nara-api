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
    ]);
    if ('error' in auth) return auth.error;

    const body = data.body || {};
    const name = String(body.name || '').trim();
    if (!name)
      return { ok: false, status: 400, error: 'El nombre es obligatorio.' };
    const now = new Date();
    const id = String(body.id || `p${Date.now().toString(36)}`);
    const existing = body.id
      ? await this.store.findOne('people', { id })
      : null;
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

    const doc: Record<string, unknown> = {
      id,
      code,
      name: name || String(existing?.name || ''),
      age:
        body.age != null
          ? Number(body.age) || 0
          : Number(existing?.age) || 0,
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
      clin:
        body.clin !== undefined
          ? body.clin || null
          : existing?.clin || null,
      phone:
        body.phone != null
          ? String(body.phone)
          : String(existing?.phone || ''),
      pendingEval:
        body.pendingEval !== undefined
          ? body.pendingEval === true
          : existing?.pendingEval === true,
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
    return { ok: true, status: 200, person: publicPerson(doc) };
  }
}
