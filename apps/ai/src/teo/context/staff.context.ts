import type { Db } from 'mongodb';
import { APP_STATE_KEY } from '@nara/common';
import { APP_OVERVIEW } from '../prompts/app-overview';
import { summarizeAppStateForTeo } from './staff-app-state';
import { toTeoPatient } from './teo-patient';

function nameHintFrom(question: string) {
  return (
    question.match(/["«]([^"»]+)["»]/)?.[1] ||
    question.match(
      /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+){0,3})\b/,
    )?.[1]
  );
}

async function agg(
  db: Db,
  col: string,
  pipeline: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  try {
    const rows = await db.collection(col).aggregate(pipeline).toArray();
    return rows as Record<string, unknown>[];
  } catch {
    return [];
  }
}

function fmtGroup(
  rows: { _id?: unknown; n?: unknown }[],
  empty = '—',
) {
  return rows
    .map((r) => `${r._id != null && r._id !== '' ? r._id : empty}: ${r.n}`)
    .join('; ');
}

type Scope = {
  expertKeys: string[];
  expertName: string | null;
  terr: string | null;
  accountName: string | null;
};

async function resolveScope(
  db: Db,
  roleId: string,
  userId?: string,
): Promise<Scope> {
  const empty: Scope = {
    expertKeys: [],
    expertName: null,
    terr: null,
    accountName: null,
  };
  if (!userId) return empty;
  const account = await db
    .collection('accounts')
    .findOne({ id: userId })
    .catch(() => null);
  const accountName = account?.name ? String(account.name) : null;
  const accountTerr = account?.terr ? String(account.terr) : null;
  if (roleId === 'clinico') return { ...empty, accountName, terr: accountTerr };
  if (roleId !== 'experto') {
    return { ...empty, accountName };
  }
  const expert =
    (await db.collection('experts').findOne({ accountId: userId })) ||
    (accountName
      ? await db.collection('experts').findOne({ name: accountName })
      : null);
  if (!expert) {
    return { ...empty, accountName, expertKeys: [userId] };
  }
  const keys = new Set<string>();
  if (expert.id) keys.add(String(expert.id));
  if (expert.accountId) keys.add(String(expert.accountId));
  if (expert.name) keys.add(String(expert.name));
  keys.add(userId);
  return {
    expertKeys: [...keys],
    expertName: expert.name ? String(expert.name) : accountName,
    terr: accountTerr || (expert.terr ? String(expert.terr) : null),
    accountName,
  };
}

/** SPEC-02 FR-02.7: experto y clínico solo ven en el contexto de TEO lo de su territorio. */
// H-005 (reporte TRL 2026-10-10): TEO cuenta lo mismo que /api/people y /api/patients (sin archivados).
const VIGENTES = { archived: { $ne: true } };

function scopePatientFilter(scope: Scope, roleId: string): Record<string, unknown> {
  if (roleId !== 'experto' && roleId !== 'clinico') return { ...VIGENTES };
  return { terr: scope.terr || '__sin_territorio__', ...VIGENTES };
}

/** Une filtro de alcance con otra condición sin pisar $or. */
function andFilter(
  scopeFilter: Record<string, unknown>,
  extra: Record<string, unknown>,
) {
  if (!Object.keys(scopeFilter).length) return extra;
  return { $and: [scopeFilter, extra] };
}

/** Contexto amplio: admin / clínico / experto (no paciente). */
export async function buildStaffContext(
  db: Db,
  roleId: string,
  question: string,
  userId?: string,
) {
  const q = question.toLowerCase();
  const nameHint = nameHintFrom(question);
  const scope = await resolveScope(db, roleId, userId);
  const scopeFilter = scopePatientFilter(scope, roleId);
  const scoped = roleId === 'experto' || roleId === 'clinico'; // con territorio (ver scopePatientFilter)
  const terrIds = scoped
    ? (await db.collection('people').find(scopeFilter, { projection: { id: 1 } }).toArray()).map((p) => p.id)
    : [];
  const terrOnly = scoped ? scopeFilter : {};
  const personIn = scoped ? { $or: [{ personId: { $in: terrIds } }, { person: { $in: terrIds } }, { pid: { $in: terrIds } }] } : {};

  const parts: string[] = [
    APP_OVERVIEW,
    `Quién pregunta: rol ${roleId}` +
      (scope.accountName ? ` (${scope.accountName})` : '') +
      (scope.expertName ? `, experto «${scope.expertName}»` : '') +
      (scope.terr ? `, territorio ${scope.terr}` : '') +
      '. Conteste con datos del programa; si falta algo, dígalo con naturalidad.',
  ];
  if (roleId === 'experto' && scope.expertKeys.length) {
    parts.push(
      'Priorice la información de su territorio, su cola de visitas y las personas a su cargo. También puede hablar del panorama general del programa.',
    );
  }
  if (roleId === 'clinico') {
    parts.push(
      'Puede hablar de caseload, PHQ, sueño, notas, remisiones, crisis, aprobaciones de rutas/reglas y evaluaciones pendientes.',
    );
  }

  const [
    nAccounts,
    nPatients,
    nPeople,
    nExperts,
    nTerr,
    nAlerts,
    nFlags,
    nAssets,
    nWorkItems,
  ] = await Promise.all([
    db.collection('accounts').countDocuments(),
    db.collection('patients').countDocuments(scopeFilter),
    db.collection('people').countDocuments(scopeFilter),
    db.collection('experts').countDocuments(),
    db.collection('territories').countDocuments(),
    db.collection('alerts').countDocuments().catch(() => 0),
    db.collection('flags').countDocuments().catch(() => 0),
    db.collection('assets').countDocuments().catch(() => 0),
    db.collection('worklist_items').countDocuments().catch(() => 0),
  ]);

  parts.push(
    roleId === 'experto' && scope.expertKeys.length
      ? `Panorama (su alcance / programa): ${nPeople} personas a su cargo o en su zona (filtro aplicado), ${nPatients} fichas; en el programa hay ${nExperts} expertos, ${nTerr} territorios, ${nAccounts} cuentas, ${nAlerts} alertas, ${nFlags} revisiones de calidad, ${nAssets} activos, ${nWorkItems} ítems en cola de campo.`
      : `Panorama: ${nPeople} personas captadas, ${nPatients} fichas de paciente, ${nExperts} expertos, ${nTerr} territorios, ${nAccounts} cuentas, ${nAlerts} alertas, ${nFlags} revisiones de calidad, ${nAssets} activos (manillas/tabletas), ${nWorkItems} pendientes en cola de campo.`,
  );

  const [
    byRole,
    peopleByStatus,
    peopleByProfile,
    peopleByTerr,
    patientsByStatus,
    patientsBySignal,
    patientsByProfile,
    patientsByPlace,
    crisisLocked,
    inactiveLocked,
    pendingEvalCount,
    terrProgress,
    experts,
    flagsByExpert,
    workByStatus,
    assetsByKind,
    alerts,
    appStateDoc,
    pendingFlags,
    workItems,
    assetsDetail,
  ] = await Promise.all([
    agg(db, 'accounts', [
      { $group: { _id: { $ifNull: ['$roleId', '$role'] }, n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]),
    agg(db, 'people', [
      ...(Object.keys(scopeFilter).length ? [{ $match: scopeFilter }] : []),
      { $group: { _id: '$status', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]),
    agg(db, 'people', [
      ...(Object.keys(scopeFilter).length ? [{ $match: scopeFilter }] : []),
      { $group: { _id: '$profile', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 20 },
    ]),
    agg(db, 'people', [
      ...(Object.keys(scopeFilter).length ? [{ $match: scopeFilter }] : []),
      { $group: { _id: '$terr', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 30 },
    ]),
    agg(db, 'patients', [
      ...(Object.keys(scopeFilter).length ? [{ $match: scopeFilter }] : []),
      { $group: { _id: '$status', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]),
    agg(db, 'patients', [
      ...(Object.keys(scopeFilter).length ? [{ $match: scopeFilter }] : []),
      { $group: { _id: '$signal', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 20 },
    ]),
    agg(db, 'patients', [
      ...(Object.keys(scopeFilter).length ? [{ $match: scopeFilter }] : []),
      { $group: { _id: '$profile', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 20 },
    ]),
    agg(db, 'patients', [
      ...(Object.keys(scopeFilter).length ? [{ $match: scopeFilter }] : []),
      { $group: { _id: '$place', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 25 },
    ]),
    db
      .collection('patients')
      .countDocuments(andFilter(scopeFilter, { crisisLock: true }))
      .catch(() => 0),
    db
      .collection('patients')
      .countDocuments(
        andFilter(scopeFilter, {
          $or: [
            { inactiveLock: true },
            { status: { $regex: /^inactivo$/i } },
          ],
        }),
      )
      .catch(() => 0),
    db
      .collection('people')
      .countDocuments(
        andFilter(scopeFilter, {
          $or: [
            { pendingEval: true },
            { status: { $regex: /por\s*aprobar/i } },
          ],
        }),
      )
      .catch(() => 0),
    agg(db, 'territories', [
      {
        $project: {
          name: 1,
          dep: 1,
          cap: 1,
          goal: 1,
          experts: 1,
          rural: 1,
          ruralG: 1,
          sixty: 1,
          sixtyG: 1,
          level: 1,
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
      { $sort: { pct: 1, cap: 1 } },
      { $limit: 80 },
    ]),
    db
      .collection('experts')
      .find(terrOnly)
      .project({
        id: 1,
        name: 1,
        terr: 1,
        active: 1,
        target: 1,
        today: 1,
        week: 1,
        training: 1,
        tablet: 1,
        accountId: 1,
      })
      .limit(100)
      .toArray()
      .catch(() => []),
    agg(db, 'flags', [
      {
        $group: {
          _id: {
            expert: { $ifNull: ['$expertName', '$expert'] },
            status: '$status',
          },
          n: { $sum: 1 },
        },
      },
      { $sort: { n: -1 } },
      { $limit: 50 },
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
      { $limit: 40 },
    ]),
    db
      .collection('alerts')
      .find(personIn)
      .project({
        id: 1,
        name: 1,
        sev: 1,
        status: 1,
        what: 1,
        place: 1,
        profile: 1,
        source: 1,
        at: 1,
      })
      .sort({ at: -1 })
      .limit(50)
      .toArray()
      .catch(() => []),
    db
      .collection('program_settings')
      .findOne({ key: APP_STATE_KEY })
      .catch(() => null),
    db
      .collection('flags')
      .find(
        scoped && roleId === 'clinico'
          ? personIn
          : roleId === 'experto' && scope.expertKeys.length
          ? {
              $or: [
                { expertId: { $in: scope.expertKeys } },
                { expert: { $in: scope.expertKeys } },
                { expertName: { $in: scope.expertKeys } },
                { status: 'pending' },
              ],
            }
          : { status: { $in: ['pending', 'pendiente', 'open', 'abierta'] } },
      )
      .project({
        id: 1,
        name: 1,
        person: 1,
        personName: 1,
        expert: 1,
        expertName: 1,
        expertId: 1,
        status: 1,
        reason: 1,
        note: 1,
        place: 1,
        terr: 1,
        at: 1,
        when: 1,
      })
      .sort({ at: -1 })
      .limit(50)
      .toArray()
      .catch(() => []),
    db
      .collection('worklist_items')
      .find(
        scoped && roleId === 'clinico'
          ? personIn
          : roleId === 'experto' && scope.expertKeys.length
          ? {
              $or: [
                { expertId: { $in: scope.expertKeys } },
                { expert: { $in: scope.expertKeys } },
                { ownerId: { $in: scope.expertKeys } },
                { owner: { $in: scope.expertKeys } },
              ],
            }
          : {},
      )
      .project({
        id: 1,
        code: 1,
        status: 1,
        place: 1,
        terr: 1,
        rural: 1,
        expert: 1,
        expertId: 1,
        owner: 1,
        ownerId: 1,
        when: 1,
        why: 1,
        profile: 1,
        age: 1,
      })
      .limit(80)
      .toArray()
      .catch(() => []),
    db
      .collection('assets')
      .find(terrOnly)
      .project({
        id: 1,
        serial: 1,
        code: 1,
        kind: 1,
        type: 1,
        status: 1,
        terr: 1,
        expert: 1,
        expertId: 1,
        expertName: 1,
        assignedTo: 1,
        person: 1,
        personName: 1,
      })
      .limit(80)
      .toArray()
      .catch(() => []),
  ]);

  if (byRole.length) parts.push('Cuentas por rol: ' + fmtGroup(byRole));
  if (peopleByStatus.length) {
    parts.push('Personas captadas por estado: ' + fmtGroup(peopleByStatus));
  }
  parts.push(
    `Evaluaciones pendientes de aprobación clínica: ${pendingEvalCount}.`,
    `Pacientes en crisis (bloqueo activo): ${crisisLocked}.`,
    `Pacientes inactivos (o con bloqueo de inactividad): ${inactiveLocked}.`,
  );
  if (peopleByProfile.length) {
    parts.push('Personas por perfil de ruta: ' + fmtGroup(peopleByProfile));
  }
  if (peopleByTerr.length) {
    parts.push(
      'Personas por territorio: ' + fmtGroup(peopleByTerr, 'Sin territorio'),
    );
  }
  if (patientsByStatus.length) {
    parts.push('Fichas de paciente por estado: ' + fmtGroup(patientsByStatus));
  }
  if (patientsBySignal.length) {
    parts.push('Señales clínicas: ' + fmtGroup(patientsBySignal));
  }
  if (patientsByProfile.length) {
    parts.push('Pacientes por perfil: ' + fmtGroup(patientsByProfile));
  }
  if (patientsByPlace.length) {
    parts.push(
      'Pacientes por lugar: ' + fmtGroup(patientsByPlace, 'sin lugar'),
    );
  }

  if (terrProgress.length) {
    const ranked = [...terrProgress].sort(
      (a, b) => Number(a.pct) - Number(b.pct),
    );
    const worst = ranked.slice(0, 5);
    const best = ranked.slice(-5).reverse();
    const show =
      roleId === 'experto' && scope.terr
        ? terrProgress.filter(
            (t) =>
              String(t.name).toLowerCase() === scope.terr!.toLowerCase() ||
              String(t.name)
                .toLowerCase()
                .includes(scope.terr!.toLowerCase()),
          )
        : terrProgress;
    parts.push(
      'Captación por territorio (cap=evaluadas, goal=meta, pct=%):',
      JSON.stringify(show.length ? show : terrProgress),
      'Más atrasados: ' +
        worst
          .map(
            (t) =>
              `${t.name} ${t.pct}% (${t.cap || 0}/${t.goal || 0}, ${t.experts || 0} expertos)`,
          )
          .join('; '),
      'Más avanzados: ' +
        best
          .map((t) => `${t.name} ${t.pct}% (${t.cap || 0}/${t.goal || 0})`)
          .join('; '),
    );
  }

  if (experts.length) {
    parts.push('Expertos de campo:', JSON.stringify(experts));
  }
  if (flagsByExpert.length) {
    parts.push(
      'Control de calidad por experto:',
      JSON.stringify(flagsByExpert),
    );
  }
  if (pendingFlags.length) {
    parts.push(
      'Visitas / banderas de calidad a revisar:',
      JSON.stringify(pendingFlags),
    );
  }
  if (workByStatus.length) {
    parts.push('Cola de trabajo (por estado): ' + fmtGroup(workByStatus));
  }
  if (workItems.length) {
    // 6.36: sin nombre; usar código de persona.
    const safeWork = workItems.map((w) => {
      const row = { ...(w as Record<string, unknown>) };
      delete row.name;
      delete row.phone;
      if (!row.code && row.id) row.code = row.id;
      return row;
    });
    parts.push(
      roleId === 'experto'
        ? 'Su cola de visitas / pendientes:'
        : 'Cola de campo (muestra de ítems):',
      JSON.stringify(safeWork),
    );
  }
  if (assetsByKind.length) {
    parts.push('Activos por tipo/estado:', JSON.stringify(assetsByKind));
  }
  if (assetsDetail.length) {
    parts.push(
      'Activos (manillas/tabletas) con asignación:',
      JSON.stringify(assetsDetail),
    );
  }
  if (alerts.length) {
    parts.push('Alertas recientes (colección):', JSON.stringify(alerts));
  }

  // Estado operativo completo (slices)
  parts.push(
    ...summarizeAppStateForTeo(
      appStateDoc as Record<string, unknown> | null,
      {
        roleId,
        nameHint: nameHint && nameHint.length > 2 ? nameHint : null,
        expertKeys: scope.expertKeys,
      },
    ),
  );

  // Fichas clínicas completas
  const wantsClinical =
    /paciente|persona|caseload|ficha|perfil|phq|sue[nñ]o|sleep|timeline|nota|crisis|alerta|nombre|inactiv|activo|aprob|adheren|remisi|evaluac|curso|cuento|check.?in|ánimo|animo/i.test(
      q,
    ) ||
    !!nameHint ||
    roleId === 'clinico' ||
    roleId === 'experto';

  const nameFilter: Record<string, unknown> = {};
  if (nameHint && nameHint.length > 2) {
    nameFilter.$or = [
      { name: { $regex: nameHint, $options: 'i' } },
      { email: { $regex: nameHint, $options: 'i' } },
      { place: { $regex: nameHint, $options: 'i' } },
      { municipio: { $regex: nameHint, $options: 'i' } },
      { profile: { $regex: nameHint, $options: 'i' } },
      { code: { $regex: nameHint, $options: 'i' } },
    ];
  }

  const andParts: Record<string, unknown>[] = [];
  if (Object.keys(scopeFilter).length) andParts.push(scopeFilter);
  if (Object.keys(nameFilter).length) andParts.push(nameFilter);
  const filter =
    andParts.length === 0
      ? {}
      : andParts.length === 1
        ? andParts[0]
        : { $and: andParts };

  const patientLimit = nameHint
    ? 15
    : roleId === 'clinico'
      ? 60
      : roleId === 'experto'
        ? 50
        : wantsClinical
          ? 45
          : 30;

  if (wantsClinical || nameHint) {
    const rows = await db
      .collection('patients')
      .find(filter)
      .limit(patientLimit)
      .toArray()
      .catch(() => []);
    if (rows.length) {
      const mapped = rows.map((r) =>
        toTeoPatient(r as Record<string, unknown>),
      );
      // Recortar timelines muy largos
      const compact = mapped.map((p) => ({
        ...p,
        timeline: Array.isArray(p.timeline)
          ? p.timeline.slice(-12)
          : p.timeline,
        sleep: Array.isArray(p.sleep) ? p.sleep.slice(-14) : p.sleep,
        phq: Array.isArray(p.phq) ? p.phq.slice(-8) : p.phq,
        phqDates: Array.isArray(p.phqDates)
          ? p.phqDates.slice(-8)
          : p.phqDates,
      }));
      parts.push(
        nameHint
          ? 'Fichas clínicas que coinciden (PHQ, sueño, timeline, módulos, crisis):'
          : `Fichas clínicas del programa (hasta ${patientLimit}, con PHQ/sueño/timeline):`,
        JSON.stringify(compact),
      );
    }
  }

  if (
    nameHint ||
    /persona|captad|evaluac|aprobar|rechaz/i.test(q) ||
    roleId === 'admin' ||
    roleId === 'experto'
  ) {
    const peRows = await db
      .collection('people')
      .find(filter)
      .project({
        id: 1,
        code: 1,
        age: 1,
        place: 1,
        terr: 1,
        profile: 1,
        status: 1,
        expert: 1,
        expertId: 1,
        clin: 1,
        pendingEval: 1,
        week: 1,
        weeks: 1,
        activeAt: 1,
        inactiveLock: 1,
        crisisLock: 1,
        evalPhq: 1,
        evalDig: 1,
        evalAt: 1,
        previousProfile: 1,
      })
      .limit(nameHint ? 20 : 70)
      .toArray()
      .catch(() => []);
    if (peRows.length) {
      // 6.36: sin nombre/teléfono/correo; identificar por código.
      const safePeople = peRows.map((r) => ({
        id: r.id,
        code: r.code || '',
        age: r.age,
        place: r.place,
        terr: r.terr,
        profile: r.profile,
        status: r.status,
        expert: r.expert,
        expertId: r.expertId,
        clin: r.clin,
        pendingEval: r.pendingEval,
        week: r.week,
        weeks: r.weeks,
        activeAt: r.activeAt,
        inactiveLock: r.inactiveLock,
        crisisLock: r.crisisLock,
        evalPhq: r.evalPhq,
        evalDig: r.evalDig,
        evalAt: r.evalAt,
        previousProfile: r.previousProfile,
      }));
      parts.push(
        nameHint
          ? 'Personas captadas que coinciden:'
          : 'Listado de personas (muestra):',
        JSON.stringify(safePeople),
      );
    }
  }

  if (
    /usuario|cuenta|admin|experto|cl[ií]nico|rol|permiso|observador/i.test(q) ||
    roleId === 'admin'
  ) {
    const accounts = await db
      .collection('accounts')
      .find({})
      .project({
        id: 1,
        name: 1,
        email: 1,
        role: 1,
        roleId: 1,
        status: 1,
        terr: 1,
        org: 1,
        lastLoginAt: 1,
      })
      .limit(120)
      .toArray()
      .catch(() => []);
    if (accounts.length) {
      parts.push(
        'Cuentas del programa (sin contraseñas):',
        JSON.stringify(accounts),
      );
    }
  }

  return parts.filter(Boolean).join('\n\n');
}
