import type { Db } from 'mongodb';
import { APP_OVERVIEW } from '../prompts/app-overview';

export async function buildObserverContext(db: Db, roleId: string) {
  const nPeople = await db.collection('people').countDocuments();
  const nPatients = await db.collection('patients').countDocuments();
  const byTerr = await db
    .collection('people')
    .aggregate([
      { $group: { _id: '$terr', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 12 },
    ])
    .toArray();

  return [
    APP_OVERVIEW,
    `Rol del usuario que pregunta: ${roleId}`,
    'Datos agregados (sin PII):',
    `people=${nPeople}, patients=${nPatients}`,
    'territorios top: ' +
      byTerr.map((t) => `${t._id || '—'}:${t.n}`).join(', '),
  ].join('\n');
}
