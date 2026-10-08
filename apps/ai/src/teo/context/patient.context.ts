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
        id: patient.id,
        name: patient.name,
        age: patient.age,
        place: patient.place,
        profile: patient.profile,
        status: patient.status,
        modulesEnabled: patient.modulesEnabled,
      }
    : null;

  return [
    APP_OVERVIEW,
    'Rol del usuario que pregunta: paciente',
    'Solo puede ver su propia ficha. No hay datos de otras personas.',
    'Su ficha: ' + JSON.stringify(snap),
    'Pregunta: ' + question,
  ].join('\n\n');
}
