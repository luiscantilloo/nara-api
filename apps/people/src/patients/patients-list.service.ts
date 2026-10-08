import { Inject, Injectable } from '@nestjs/common';
import type { DocumentStore } from '@nara/common';
import { DOCUMENT_STORE } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { requireRoles } from '../shared/require-roles';
import { publicPatient } from '../shared/mappers/patient.mapper';

@Injectable()
export class PatientsListService {
  constructor(
    @Inject(DOCUMENT_STORE) private readonly store: DocumentStore,
    private readonly sessions: SessionService,
  ) {}

  async list(data: { token: string | null }) {
    const auth = await requireRoles(this.sessions, data.token, [
      'admin',
      'clinico',
      'experto',
    ]);
    if ('error' in auth) return auth.error;
    const rows = await this.store.findMany('patients', {}, { limit: 20000 });
    return { ok: true, status: 200, patients: rows.map(publicPatient) };
  }
}
