import { Inject, Injectable } from '@nestjs/common';
import type { DocumentStore } from '@nara/common';
import { DOCUMENT_STORE, MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { requireRoles } from '../shared/require-roles';
import { listCollection } from '../shared/list-collection';

@Injectable()
export class TerritoriesService {
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
      'territories',
      ['admin', 'experto', 'clinico', 'observador'],
      'territories',
      { name: 1 },
    );
  }

  async upsert(token: string | null, body: Record<string, unknown>) {
    const auth = await requireRoles(this.sessions, token, ['admin']);
    if ('error' in auth) return auth.error;
    const name = String(body.name || '').trim();
    if (!name)
      return { ok: false, status: 400, error: 'El nombre es obligatorio.' };
    const now = new Date();
    const doc = {
      name,
      dep: String(body.dep || ''),
      level: String(body.level || ''),
      experts: Number(body.experts) || 0,
      cap: Number(body.cap) || 0,
      goal: Number(body.goal) || 0,
      rural: Number(body.rural) || 0,
      ruralG: Number(body.ruralG) || 0,
      sixty: Number(body.sixty) || 0,
      sixtyG: Number(body.sixtyG) || 0,
      br: Number(body.br) || 0,
      brA: Number(body.brA ?? body.br) || 0,
      brD: Number(body.brD) || 0,
      brAv: Number(body.brAv ?? body.br) || 0,
      insts: body.insts ?? 0,
      content: Array.isArray(body.content) ? body.content : [],
      places: Array.isArray(body.places) ? body.places : [],
      isNew: !!body.isNew,
      pace: Number(body.pace) || 0,
      updatedAt: now,
    };
    const db = await this.mongo.db();
    await db
      .collection('territories')
      .updateOne(
        { name },
        { $set: doc, $setOnInsert: { createdAt: now } },
        { upsert: true },
      );
    return { ok: true, status: 200, territory: doc };
  }
}
