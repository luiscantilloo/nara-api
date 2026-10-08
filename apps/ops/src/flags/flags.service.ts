import { Inject, Injectable } from '@nestjs/common';
import type { DocumentStore } from '@nara/common';
import { DOCUMENT_STORE, MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { requireRoles } from '../shared/require-roles';
import { listCollection } from '../shared/list-collection';

@Injectable()
export class FlagsService {
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
      'flags',
      ['admin', 'experto', 'clinico'],
      'flags',
      { at: -1 },
    );
  }

  async upsert(token: string | null, body: Record<string, unknown>) {
    const auth = await requireRoles(this.sessions, token, [
      'admin',
      'experto',
      'clinico',
    ]);
    if ('error' in auth) return auth.error;
    const db = await this.mongo.db();
    const now = new Date();
    const id = String(body.id || `fv-${Date.now().toString(36)}`);
    const doc = {
      id,
      wid: body.wid || null,
      fromVisit: body.fromVisit !== false,
      expert: body.expert || '',
      expertName: body.expertName || '',
      territory: body.territory || '',
      person: body.person || '',
      when: body.when || 'Hoy',
      reasons: Array.isArray(body.reasons) ? body.reasons : [],
      status: body.status || 'pending',
      at: Date.now(),
      updatedAt: now,
    };
    await db
      .collection('flags')
      .updateOne(
        { id },
        { $set: doc, $setOnInsert: { createdAt: now } },
        { upsert: true },
      );
    return { ok: true, status: 201, flag: doc };
  }

  async patch(token: string | null, body: Record<string, unknown>) {
    const auth = await requireRoles(this.sessions, token, ['admin', 'clinico']);
    if ('error' in auth) return auth.error;
    const id = String(body.id || '');
    const status = body.status as string;
    if (!id || !status)
      return { ok: false, status: 400, error: 'id y status son obligatorios.' };
    const db = await this.mongo.db();
    const flag = await db.collection('flags').findOne({ id });
    if (!flag) return { ok: false, status: 404, error: 'Flag no encontrado.' };
    await db
      .collection('flags')
      .updateOne({ id }, { $set: { status, updatedAt: new Date() } });
    if (flag.fromVisit && flag.wid && flag.expert) {
      const wlStatus = status === 'approved' ? 'validada' : 'rechazada';
      await db
        .collection('worklist_items')
        .updateOne(
          { id: flag.wid, expertId: flag.expert },
          { $set: { status: wlStatus, updatedAt: new Date() } },
        );
    }
    return { ok: true, status: 200 };
  }
}
