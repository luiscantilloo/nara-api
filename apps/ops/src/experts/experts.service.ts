import { Inject, Injectable } from '@nestjs/common';
import type { DocumentStore } from '@nara/common';
import { DOCUMENT_STORE, MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { requireRoles } from '../shared/require-roles';
import { listCollection } from '../shared/list-collection';

@Injectable()
export class ExpertsService {
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
      'experts',
      ['admin', 'experto', 'clinico', 'observador'],
      'experts',
      { name: 1 },
    );
  }

  async upsert(token: string | null, body: Record<string, unknown>) {
    const auth = await requireRoles(this.sessions, token, ['admin']);
    if ('error' in auth) return auth.error;
    const name = String(body.name || '').trim();
    const phoneDigits = String(body.phone || '').replace(/\D/g, '');
    const terr = String(body.terr || '').trim();
    const target = Number(body.target) || 9;
    if (!name)
      return { ok: false, status: 400, error: 'El nombre es obligatorio.' };
    if (phoneDigits.length < 10)
      return {
        ok: false,
        status: 400,
        error: 'Escriba un celular de 10 dígitos.',
      };
    if (!terr)
      return { ok: false, status: 400, error: 'Seleccione un territorio.' };

    const db = await this.mongo.db();
    if (!(await db.collection('territories').findOne({ name: terr }))) {
      return {
        ok: false,
        status: 400,
        error: 'Ese territorio no existe en la base de datos.',
      };
    }
    const now = new Date();
    const id = String(body.id || `e${Date.now().toString(36)}`);
    const phone =
      phoneDigits.length === 10
        ? `${phoneDigits.slice(0, 3)} ${phoneDigits.slice(3, 6)} ${phoneDigits.slice(6)}`
        : String(body.phone || '');
    const doc = {
      id,
      name,
      phone,
      terr,
      target,
      today: 0,
      week: 0,
      training: 'Pendiente',
      active: true,
      isNew: true,
      accountId: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection('experts').insertOne(doc);
    await db
      .collection('territories')
      .updateOne(
        { name: terr },
        { $inc: { experts: 1 }, $set: { updatedAt: now } },
      );
    return { ok: true, status: 201, expert: doc };
  }
}
