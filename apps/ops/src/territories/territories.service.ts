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
      {
        sort: { name: 1 },
        // H-006: solo el admin ve los territorios desactivados.
        filterFor: (roleId) => (roleId === 'admin' ? {} : { active: { $ne: false } }),
      },
    );
  }

  async upsert(token: string | null, body: Record<string, unknown>) {
    const auth = await requireRoles(this.sessions, token, ['admin']);
    if ('error' in auth) return auth.error;
    const name = String(body.name || '').trim();
    if (!name)
      return { ok: false, status: 400, error: 'El nombre es obligatorio.' };
    const now = new Date();
    // A-01 (TRL 2026-10-10): solo se actualizan los campos que llegan; así pausar o cambiar la línea de
    // crisis no deja en cero el resto. Un territorio nuevo recibe los valores por defecto.
    const num = (k: string, alt?: string) => Number(body[k] ?? (alt ? body[alt] : undefined)) || 0;
    const campos: Record<string, () => unknown> = {
      dep: () => String(body.dep || ''),
      level: () => String(body.level || ''),
      experts: () => num('experts'),
      cap: () => num('cap'),
      goal: () => num('goal'),
      rural: () => num('rural'),
      ruralG: () => num('ruralG'),
      sixty: () => num('sixty'),
      sixtyG: () => num('sixtyG'),
      br: () => num('br'),
      brA: () => num('brA', 'br'),
      brD: () => num('brD'),
      brAv: () => num('brAv', 'br'),
      insts: () => body.insts ?? 0,
      content: () => (Array.isArray(body.content) ? body.content : []),
      places: () => (Array.isArray(body.places) ? body.places : []),
      isNew: () => !!body.isNew,
      pace: () => num('pace'),
      crisisLine: () => String(body.crisisLine || '').slice(0, 60),
    };
    const doc: Record<string, unknown> = { name, updatedAt: now };
    const setOnInsert: Record<string, unknown> = { createdAt: now };
    for (const [k, valor] of Object.entries(campos)) {
      const llega = k in body || (k === 'brA' && 'br' in body) || (k === 'brAv' && 'br' in body);
      if (llega) doc[k] = valor();
      else if (k !== 'crisisLine') setOnInsert[k] = valor();
    }
    // H-006: `active` solo cambia si viene explícito; un territorio nuevo nace activo.
    if (typeof body.active === 'boolean') doc.active = body.active;
    else setOnInsert.active = true;
    const db = await this.mongo.db();
    await db
      .collection('territories')
      .updateOne(
        { name },
        { $set: doc, $setOnInsert: setOnInsert },
        { upsert: true },
      );
    // Devuelve el territorio completo tal como quedó guardado (no solo los campos enviados).
    const guardado = await db.collection('territories').findOne({ name }, { projection: { _id: 0 } });
    return { ok: true, status: 200, territory: guardado || doc };
  }
}
