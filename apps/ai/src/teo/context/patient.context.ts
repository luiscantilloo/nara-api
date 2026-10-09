import type { Db } from 'mongodb';
import { APP_OVERVIEW } from '../prompts/app-overview';

export async function buildPatientContext(
  db: Db,
  userId: string,
  question: string,
) {
  const account = await db.collection('accounts').findOne({ id: userId });
  const patientId = account?.patientId ? String(account.patientId) : userId;
  const patient =
    (await db.collection('patients').findOne({ accountId: userId })) ||
    (await db.collection('patients').findOne({ id: patientId })) ||
    null;

  const snap = patient
    ? {
        name: patient.name,
        age: patient.age,
        place: patient.place,
        profile: patient.profile,
        status: patient.status,
        modulesEnabled: patient.modulesEnabled,
        week: patient.week,
        weeks: patient.weeks,
        crisisLock: patient.crisisLock,
        inactiveLock: patient.inactiveLock,
        signal: patient.signal,
      }
    : null;

  return [
    APP_OVERVIEW,
    'Quién pregunta: paciente. Solo puede ver su propia información. No hay datos de otras personas.',
    'Su situación en el programa: ' + JSON.stringify(snap),
    'Explíquele con naturalidad su estado, módulos o ruta. Si pregunta por otros pacientes o del programa en general, diga con amabilidad que solo puede hablar de su acompañamiento.',
    'Pregunta: ' + question,
  ].join('\n\n');
}
