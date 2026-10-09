import { Inject, Injectable } from '@nestjs/common';
import type { DocumentStore } from '@nara/common';
import { DOCUMENT_STORE, MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { requireRoles } from '../shared/require-roles';
import { listCollection } from '../shared/list-collection';

/** Flags solo por duración mínima (criterio retirado). */
function isDurationOnlyFlag(f: { reasons?: unknown }): boolean {
  const reasons = Array.isArray(f.reasons) ? f.reasons : [];
  if (!reasons.length) return false;
  return reasons.every((r) =>
    /mínimo\s*20|minimo\s*20|menos de\s*20\s*minutos|entrevista de\s+\d+/i.test(
      String(r || ''),
    ),
  );
}

@Injectable()
export class FlagsService {
  constructor(
    @Inject(DOCUMENT_STORE) private readonly store: DocumentStore,
    private readonly mongo: MongoStore,
    private readonly sessions: SessionService,
  ) {}

  async list(token: string | null) {
    const result = await listCollection(
      this.store,
      this.sessions,
      token,
      'flags',
      ['admin', 'experto', 'clinico'],
      'flags',
      { at: -1 },
    );
    if (!result || typeof result !== 'object' || !('flags' in result)) return result;
    const flags = Array.isArray(result.flags) ? result.flags : [];
    const obsolete = flags.filter((f) => isDurationOnlyFlag(f as { reasons?: unknown }));
    const kept = flags.filter((f) => !isDurationOnlyFlag(f as { reasons?: unknown }));
    if (obsolete.length) {
      try {
        const db = await this.mongo.db();
        const ids = obsolete
          .map((f) => String((f as { id?: string }).id || ''))
          .filter(Boolean);
        if (ids.length) {
          await db.collection('flags').deleteMany({ id: { $in: ids } });
        }
        for (const f of obsolete) {
          const flag = f as {
            fromVisit?: boolean;
            wid?: string;
            expert?: string;
            status?: string;
          };
          if (flag.fromVisit && flag.wid && flag.expert) {
            await db.collection('worklist_items').updateOne(
              { id: flag.wid, expertId: flag.expert },
              { $set: { status: 'validada', updatedAt: new Date() } },
            );
          }
        }
      } catch {
        /* list still returns filtered */
      }
    }
    return { ...result, flags: kept };
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
