import type { Db } from 'mongodb';
import { APP_STATE_KEY, pickAppStateSlices } from '@nara/common';
import { APP_OVERVIEW } from '../prompts/app-overview';

async function agg(
  db: Db,
  col: string,
  pipeline: Record<string, unknown>[],
) {
  return db
    .collection(col)
    .aggregate(pipeline)
    .toArray()
    .catch(() => []);
}

function fmtGroup(
  rows: { _id?: unknown; n?: unknown }[],
  empty = '—',
) {
  return rows
    .map((r) => `${r._id != null && r._id !== '' ? r._id : empty}: ${r.n}`)
    .join('; ');
}

/** Solo agregados — nunca nombres, correos ni teléfonos. */
export async function buildObserverContext(db: Db, roleId: string) {
  const [
    nPeople,
    nPatients,
    nExperts,
    nTerr,
    peopleByStatus,
    peopleByTerr,
    peopleByProfile,
    patientsByStatus,
    crisisLocked,
    inactiveLocked,
    pendingEval,
    terrProgress,
    flagsByStatus,
    workByStatus,
    assetsByKind,
    appStateDoc,
  ] = await Promise.all([
    db.collection('people').countDocuments(),
    db.collection('patients').countDocuments(),
    db.collection('experts').countDocuments(),
    db.collection('territories').countDocuments(),
    agg(db, 'people', [
      { $group: { _id: '$status', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]),
    agg(db, 'people', [
      { $group: { _id: '$terr', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 20 },
    ]),
    agg(db, 'people', [
      { $group: { _id: '$profile', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 15 },
    ]),
    agg(db, 'patients', [
      { $group: { _id: '$status', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]),
    db.collection('patients').countDocuments({ crisisLock: true }).catch(() => 0),
    db
      .collection('patients')
      .countDocuments({
        $or: [
          { inactiveLock: true },
          { status: { $regex: /^inactivo$/i } },
        ],
      })
      .catch(() => 0),
    db
      .collection('people')
      .countDocuments({
        $or: [
          { pendingEval: true },
          { status: { $regex: /por\s*aprobar/i } },
        ],
      })
      .catch(() => 0),
    agg(db, 'territories', [
      {
        $project: {
          name: 1,
          dep: 1,
          cap: 1,
          goal: 1,
          pct: {
            $cond: [
              { $gt: ['$goal', 0] },
              {
                $round: [
                  { $multiply: [{ $divide: ['$cap', '$goal'] }, 100] },
                  1,
                ],
              },
              0,
            ],
          },
        },
      },
      { $sort: { pct: 1 } },
      { $limit: 40 },
    ]),
    agg(db, 'flags', [
      { $group: { _id: '$status', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]),
    agg(db, 'worklist_items', [
      { $group: { _id: '$status', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]),
    agg(db, 'assets', [
      {
        $group: {
          _id: {
            kind: { $ifNull: ['$kind', '$type'] },
            status: '$status',
          },
          n: { $sum: 1 },
        },
      },
      { $sort: { n: -1 } },
      { $limit: 20 },
    ]),
    db
      .collection('program_settings')
      .findOne({ key: APP_STATE_KEY })
      .catch(() => null),
  ]);

  const parts = [
    APP_OVERVIEW,
    `Quién pregunta: observador (${roleId}). Solo datos agregados; nunca diga nombres, correos ni teléfonos.`,
    `Totales: ${nPeople} personas captadas, ${nPatients} fichas de paciente, ${nExperts} expertos, ${nTerr} territorios.`,
    `En crisis (bloqueo): ${crisisLocked}. Inactivos: ${inactiveLocked}. Evaluaciones por aprobar: ${pendingEval}.`,
  ];

  if (peopleByStatus.length) {
    parts.push('Personas por estado: ' + fmtGroup(peopleByStatus));
  }
  if (patientsByStatus.length) {
    parts.push('Pacientes por estado: ' + fmtGroup(patientsByStatus));
  }
  if (peopleByTerr.length) {
    parts.push(
      'Personas por territorio: ' + fmtGroup(peopleByTerr, 'Sin territorio'),
    );
  }
  if (peopleByProfile.length) {
    parts.push(
      'Personas por perfil de ruta: ' + fmtGroup(peopleByProfile, 'sin perfil'),
    );
  }
  if (terrProgress.length) {
    const ranked = [...terrProgress].sort(
      (a, b) => Number(a.pct) - Number(b.pct),
    );
    parts.push(
      'Avance de captación: ' +
        ranked
          .map((t) => `${t.name} ${t.pct}% (${t.cap || 0}/${t.goal || 0})`)
          .join('; '),
    );
  }
  if (flagsByStatus.length) {
    parts.push(
      'Revisiones de calidad por estado: ' + fmtGroup(flagsByStatus),
    );
  }
  if (workByStatus.length) {
    parts.push('Cola de campo por estado: ' + fmtGroup(workByStatus));
  }
  if (assetsByKind.length) {
    parts.push(
      'Activos (agregado, sin seriales ni asignaciones): ' +
        JSON.stringify(assetsByKind),
    );
  }

  // Agregados seguros del estado operativo (sin PII)
  if (appStateDoc && typeof appStateDoc === 'object') {
    const st = pickAppStateSlices(appStateDoc as Record<string, unknown>);
    const pathRequests = Array.isArray(st.pathRequests) ? st.pathRequests : [];
    const pendingPaths = pathRequests.filter(
      (r: { status?: string }) =>
        !r?.status || String(r.status).toLowerCase() === 'pending',
    );
    const openAlerts = Array.isArray(st.alerts)
      ? st.alerts.filter(
          (a: { status?: string }) => a && a.status !== 'closed',
        )
      : [];
    const crisisLogN = Array.isArray(st.crisisLog) ? st.crisisLog.length : 0;
    const closedTodayN = Array.isArray(st.closedToday)
      ? st.closedToday.length
      : 0;
    const reportsN = Array.isArray(st.reports) ? st.reports.length : 0;
    const visitsN = Array.isArray(st.visits)
      ? st.visits.length
      : st.visits && typeof st.visits === 'object'
        ? Object.keys(st.visits as object).length
        : 0;
    parts.push(
      `Cambios de ruta pendientes (conteo): ${pendingPaths.length}.`,
      `Alertas operativas abiertas (conteo): ${openAlerts.length}.`,
      `Entradas en historial de crisis (conteo): ${crisisLogN}. Cerradas hoy: ${closedTodayN}.`,
      `Informes registrados (conteo): ${reportsN}. Claves/listas de visitas: ${visitsN}.`,
      st.rules && typeof st.rules === 'object' && (st.rules as { pending?: unknown }).pending
        ? 'Hay un cambio de reglas pendiente de aprobación clínica (sin detalle personal).'
        : 'No hay cambio de reglas pendiente.',
    );
  }

  return parts.join('\n\n');
}
