import { Injectable } from '@nestjs/common';
import { MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { requireRoles } from '../shared/require-roles';

/** Colecciones que la app espera en la base (criterio TRL 4.2: `missing: []`). */
const EXPECTED = ['accounts', 'roles', 'people', 'patients', 'experts', 'territories', 'program_settings', 'worklist_items'];

@Injectable()
export class HealthService {
  constructor(
    private readonly mongo: MongoStore,
    private readonly sessions: SessionService,
  ) {}

  /** SPEC-05 FR-05.2 (P-5): solo para admin; informa las colecciones que faltan. */
  async healthDb(token: string | null) {
    const auth = await requireRoles(this.sessions, token, ['admin']);
    if ('error' in auth) return auth.error;
    try {
      const db = await this.mongo.db();
      const have = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
      const missing = EXPECTED.filter((c) => !have.has(c));
      return { ok: missing.length === 0, status: 200, db: db.databaseName, missing };
    } catch (e) {
      return { ok: false, status: 500, error: 'DB error' };
    }
  }
}
