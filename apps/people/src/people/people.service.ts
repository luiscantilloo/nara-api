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
    const terr = String(body.terr || '').trim();
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
    const code = String(body.code || `${pre}-${1000 + count + 1}`);
    const doc = {
      id,
      code,
      name,
      age: Number(body.age) || 0,
      place: String(body.place || ''),
      rural: body.rural !== false,
      terr,
      profile:
        body.profile && /^P\d+$/i.test(String(body.profile))
          ? String(body.profile)
          : null,
      week: Number(body.week) || 0,
      weeks: Number(body.weeks) || 13,
      expert: String(body.expert || ''),
      expertId: body.expertId || null,
      status: String(body.status || 'Activa'),
      clin: body.clin || null,
      phone: String(body.phone || ''),
      updatedAt: now,
    };
    await this.store.upsert('people', { id }, doc);
    return { ok: true, status: 200, person: publicPerson(doc) };
  }
}
