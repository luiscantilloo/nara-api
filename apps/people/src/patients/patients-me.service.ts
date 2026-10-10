import { Injectable } from '@nestjs/common';
import { MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { requireRoles } from '../shared/require-roles';
import { publicPatient } from '../shared/mappers/patient.mapper';

@Injectable()
export class PatientsMeService {
  constructor(
    private readonly mongo: MongoStore,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Ficha propia del paciente. SPEC-02 FR-02.3 (P-10): el vínculo es solo por `accounts.patientId`
   * o, como respaldo, `patients.accountId`. Ya no se busca por correo, teléfono ni nombre, porque
   * podía ligar la cuenta a la ficha de otra persona.
   */
  async me(data: { token: string | null }) {
    const auth = await requireRoles(this.sessions, data.token, [
      'paciente',
      'admin',
      'clinico',
    ]);
    if ('error' in auth) return auth.error;

    const user = auth.user;
    const db = await this.mongo.db();
    const account = await db.collection('accounts').findOne({ id: user.id });
    if (!account)
      return { ok: false, status: 401, error: 'Cuenta no disponible.' };

    const patientId = account.patientId ? String(account.patientId) : '';
    const patient =
      (patientId
        ? await db.collection('patients').findOne({ id: patientId })
        : null) ||
      (await db.collection('patients').findOne({ accountId: user.id }));

    if (!patient)
      return { ok: false, status: 404, error: 'Sin ficha vinculada.' };

    if (!patientId) {
      await db
        .collection('accounts')
        .updateOne(
          { id: user.id },
          { $set: { patientId: patient.id, updatedAt: new Date() } },
        );
    }
    return {
      ok: true,
      status: 200,
      patient: publicPatient(patient),
    };
  }
}
