import { Inject, Injectable } from '@nestjs/common';
import type { DocumentStore } from '@nara/common';
import { DOCUMENT_STORE, MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { requireRoles } from '../shared/require-roles';
import { listCollection } from '../shared/list-collection';

@Injectable()
export class AssetsService {
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
      'assets',
      ['admin'],
      'assets',
    );
  }

  async bracelets(token: string | null, body: Record<string, unknown>) {
    const auth = await requireRoles(this.sessions, token, ['admin']);
    if ('error' in auth) return auth.error;
    const terr = String(body.terr || '').trim();
    const count = Number(body.count) > 0 ? Number(body.count) : 100;
    if (!terr)
      return { ok: false, status: 400, error: 'Territorio obligatorio.' };
    const db = await this.mongo.db();
    const t = await db.collection('territories').findOne({ name: terr });
    if (!t)
      return { ok: false, status: 404, error: 'Territorio no encontrado.' };
    const now = new Date();
    await db
      .collection('territories')
      .updateOne(
        { name: terr },
        { $set: { br: count, brA: count, brAv: count, updatedAt: now } },
      );
    await db.collection('assets').updateOne(
      { id: `BR-LOT-${terr}` },
      {
        $set: {
          id: `BR-LOT-${terr}`,
          code: `BR-LOT-${terr}`,
          kind: 'manilla-lote',
          type: 'manilla',
          status: 'En bodega',
          terr,
          count,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    return {
      ok: true,
      status: 200,
      territory: { name: terr, br: count, brA: count, brAv: count },
    };
  }

  async tablet(token: string | null, body: Record<string, unknown>) {
    const auth = await requireRoles(this.sessions, token, ['admin']);
    if ('error' in auth) return auth.error;
    const db = await this.mongo.db();
    const expert = body.expertId
      ? await db.collection('experts').findOne({ id: body.expertId })
      : await db
          .collection('experts')
          .findOne({ name: String(body.expertName || '').trim() });
    if (!expert)
      return { ok: false, status: 404, error: 'Experto no encontrado.' };
    if (expert.tablet) {
      return {
        ok: true,
        status: 200,
        already: true,
        expert: {
          id: expert.id,
          name: expert.name,
          terr: expert.terr,
          tablet: expert.tablet,
        },
      };
    }
    const assigned = await db
      .collection('experts')
      .countDocuments({ tablet: { $exists: true, $nin: [null, ''] } });
    const code = 'TB-' + String(assigned + 1).padStart(3, '0');
    const now = new Date();
    await db
      .collection('experts')
      .updateOne({ id: expert.id }, { $set: { tablet: code, updatedAt: now } });
    await db.collection('assets').updateOne(
      { code },
      {
        $set: {
          id: code,
          code,
          kind: 'tablet',
          type: 'tablet',
          status: 'Asignada',
          assignedTo: expert.id,
          assignedName: expert.name,
          terr: expert.terr || '',
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    return {
      ok: true,
      status: 200,
      expert: {
        id: expert.id,
        name: expert.name,
        terr: expert.terr,
        tablet: code,
      },
      asset: { code, kind: 'tablet' },
    };
  }
}
