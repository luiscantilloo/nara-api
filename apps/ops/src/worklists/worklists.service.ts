import { Injectable } from '@nestjs/common';
import { MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { requireRoles } from '../shared/require-roles';

@Injectable()
export class WorklistsService {
  constructor(
    private readonly mongo: MongoStore,
    private readonly sessions: SessionService,
  ) {}

  async list(token: string | null, expertId?: string) {
    const auth = await requireRoles(this.sessions, token, [
      'admin',
      'experto',
      'clinico',
    ]);
    if ('error' in auth) return auth.error;
    const db = await this.mongo.db();
    const q = expertId ? { expertId } : {};
    const rows = await db
      .collection('worklist_items')
      .find(q)
      .sort({ at: -1 })
      .toArray();
    return {
      ok: true,
      status: 200,
      items: rows.map((r) => ({
        id: r.id,
        expertId: r.expertId,
        time: r.time || '—',
        name: r.name,
        age: r.age || 0,
        place: r.place || '',
        rural: !!r.rural,
        status: r.status || 'programada',
        profile: r.profile || null,
        code: r.code || null,
        phone: r.phone || '',
      })),
      worklists: rows,
    };
  }

  async upsert(token: string | null, body: Record<string, unknown>) {
    const auth = await requireRoles(this.sessions, token, [
      'admin',
      'experto',
      'clinico',
    ]);
    if ('error' in auth) return auth.error;
    const expertId = String(body.expertId || '');
    const name = String(body.name || '').trim();
    if (!expertId || !name)
      return {
        ok: false,
        status: 400,
        error: 'expertId y name son obligatorios.',
      };
    const db = await this.mongo.db();
    const now = new Date();
    const id = String(body.id || `p${Date.now().toString(36)}`);
    const doc = {
      id,
      expertId,
      time: body.time || 'Ahora',
      name,
      age: Number(body.age) || 0,
      place: String(body.place || ''),
      rural: body.rural !== false,
      status: String(body.status || 'programada'),
      profile: body.profile || null,
      code: body.code || null,
      phone: String(body.phone || ''),
      at: Date.now(),
      updatedAt: now,
    };
    await db
      .collection('worklist_items')
      .updateOne(
        { id, expertId },
        { $set: doc, $setOnInsert: { createdAt: now } },
        { upsert: true },
      );
    return { ok: true, status: 201, item: doc };
  }

  async patch(token: string | null, body: Record<string, unknown>) {
    const auth = await requireRoles(this.sessions, token, [
      'admin',
      'experto',
      'clinico',
    ]);
    if ('error' in auth) return auth.error;
    const id = String(body.id || '').trim();
    if (!id) return { ok: false, status: 400, error: 'id obligatorio' };
    const db = await this.mongo.db();
    const now = new Date();
    const $set: Record<string, unknown> = { updatedAt: now };
    if (body.status) $set.status = String(body.status);
    if (body.expertId) $set.expertId = String(body.expertId);
    const q: Record<string, unknown> = { id };
    if (body.expertId) q.expertId = String(body.expertId);
    await db.collection('worklist_items').updateOne(q, { $set });
    return { ok: true, status: 200 };
  }
}
