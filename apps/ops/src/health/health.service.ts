import { Inject, Injectable } from '@nestjs/common';
import type { DocumentStore } from '@nara/common';
import { DOCUMENT_STORE } from '@nara/database';

@Injectable()
export class HealthService {
  constructor(@Inject(DOCUMENT_STORE) private readonly store: DocumentStore) {}

  async healthDb() {
    try {
      const r = await this.store.ping();
      return { ok: true, status: 200, db: r.db };
    } catch (e) {
      return {
        ok: false,
        status: 500,
        error: e instanceof Error ? e.message : 'DB error',
      };
    }
  }
}
