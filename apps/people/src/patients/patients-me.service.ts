import { Injectable } from '@nestjs/common';
import { DEFAULT_PATIENT_MODULES } from '@nara/common';
import { MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { requireRoles } from '../shared/require-roles';
import { digits, publicPatient } from '../shared/mappers/patient.mapper';

@Injectable()
export class PatientsMeService {
  constructor(
    private readonly mongo: MongoStore,
    private readonly sessions: SessionService,
  ) {}

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

    const email = String(account.email || '').toLowerCase();
    const contactDigits = digits(account.contact || account.email);
    const patientId = account.patientId ? String(account.patientId) : '';
    const name = String(account.name || '')
      .trim()
      .toLowerCase();

    let patient =
      (patientId
        ? await db.collection('patients').findOne({ id: patientId })
        : null) ||
      (await db.collection('patients').findOne({ accountId: user.id })) ||
      (email ? await db.collection('patients').findOne({ email }) : null);

    if (!patient) {
      const people = await db
        .collection('people')
        .find({})
        .limit(1200)
        .toArray();
      const person =
        people.find((p) => {
          const ph = digits(p.phone);
          return (
            contactDigits.length >= 7 &&
            ph.length >= 7 &&
            (ph === contactDigits ||
              ph.endsWith(contactDigits) ||
              contactDigits.endsWith(ph))
          );
        }) ||
        (name.length >= 5
          ? people.find(
              (p) =>
                String(p.name || '')
                  .trim()
                  .toLowerCase() === name,
            )
          : null);
      if (person?.id) {
        patient = await db.collection('patients').findOne({ id: person.id });
        if (!patient) {
          const now = new Date();
          const modulesEnabled = DEFAULT_PATIENT_MODULES.slice();
          await db.collection('patients').updateOne(
            { id: person.id },
            {
              $set: {
                id: person.id,
                name: person.name,
                age: person.age || 0,
                place: person.place || '',
                terr: person.terr || '',
                phone: person.phone || '',
                profile:
                  person.profile && /^P\d+$/i.test(String(person.profile))
                    ? String(person.profile)
                    : null,
                expert: person.expert || '',
                modulesEnabled,
                modulesVisible: modulesEnabled,
                accountId: user.id,
                email,
                updatedAt: now,
              },
              $setOnInsert: {
                createdAt: now,
                phq: [],
                timeline: [],
                ctx: { dano: 0, perdida: 0 },
              },
            },
            { upsert: true },
          );
          patient = await db.collection('patients').findOne({ id: person.id });
        }
      }
    }

    if (!patient)
      return { ok: false, status: 404, error: 'Sin ficha vinculada.' };

    const now = new Date();
    await db
      .collection('accounts')
      .updateOne(
        { id: user.id },
        { $set: { patientId: patient.id, updatedAt: now } },
      );
    await db.collection('patients').updateOne(
      { id: patient.id },
      {
        $set: {
          accountId: user.id,
          email: email || patient.email || '',
          updatedAt: now,
        },
      },
    );
    return {
      ok: true,
      status: 200,
      patient: publicPatient(patient),
    };
  }
}
