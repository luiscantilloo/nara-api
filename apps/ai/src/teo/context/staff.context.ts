import type { Db } from 'mongodb';
import { APP_OVERVIEW } from '../prompts/app-overview';

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
) {
  return db
    .collection(col)
    .aggregate(pipeline)
    .toArray()
    .catch(() => []);
}

/** Contexto amplio para que TEO interprete el programa (admin / clínico / experto). */
export async function buildStaffContext(
  db: Db,
  roleId: string,
  question: string,
) {
  const q = question.toLowerCase();
  const nameHint = nameHintFrom(question);
  const parts: string[] = [
    APP_OVERVIEW,
    `Rol del usuario que pregunta: ${roleId}`,
    'A continuación tiene datos reales del programa (Mongo). Interprételos y responda con cifras concretas. Si un dato no aparece, diga con naturalidad que aún no lo tiene registrado — sin mencionar bases de datos ni Mongo.',
  ];

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
    nRevisits,
  ] = await Promise.all([
    db.collection('accounts').countDocuments(),
    db.collection('patients').countDocuments(),
    db.collection('people').countDocuments(),
    db.collection('experts').countDocuments(),
    db.collection('territories').countDocuments(),
    db.collection('alerts').countDocuments().catch(() => 0),
    db.collection('flags').countDocuments().catch(() => 0),
    db.collection('assets').countDocuments().catch(() => 0),
    db.collection('worklist_items').countDocuments().catch(() => 0),
    db.collection('revisits').countDocuments().catch(() => 0),
  ]);

  parts.push(
    `Totales del programa: ${nPatients} pacientes, ${nPeople} personas captadas, ${nExperts} expertos, ${nTerr} territorios, ${nAccounts} cuentas, ${nAlerts} alertas, ${nFlags} banderas/QC, ${nAssets} activos, ${nWorkItems} ítems en cola de trabajo, ${nRevisits} revisitas.`,
  );

  const byRole = await agg(db, 'accounts', [
    { $group: { _id: '$role', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]);
  if (byRole.length) {
    parts.push(
      'Cuentas por rol: ' +
        byRole.map((r) => `${r._id || 'sin rol'}: ${r.n}`).join('; '),
    );
  }

  // Captación por territorio (cap/goal) — clave para «quién va atrasado»
  const terrProgress = await agg(db, 'territories', [
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
        brAv: 1,
        brA: 1,
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
  ]);
  if (terrProgress.length) {
    const ranked = [...terrProgress].sort(
      (a, b) => Number(a.pct) - Number(b.pct),
    );
    const worst = ranked.slice(0, 5);
    const best = ranked.slice(-5).reverse();
    parts.push(
      'Avance de captación por territorio (cap=personas evaluadas, goal=meta, pct=% avance). Ordenados del más atrasado al más avanzado:',
      JSON.stringify(terrProgress),
      'Los 5 más atrasados: ' +
        worst
          .map(
            (t) =>
              `${t.name} ${t.pct}% (${t.cap || 0}/${t.goal || 0}, ${t.experts || 0} expertos)`,
          )
          .join('; '),
      'Los 5 más avanzados: ' +
        best
          .map(
            (t) =>
              `${t.name} ${t.pct}% (${t.cap || 0}/${t.goal || 0})`,
          )
          .join('; '),
    );
  }

  const peopleByTerr = await agg(db, 'people', [
    { $group: { _id: '$terr', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 25 },
  ]);
  if (peopleByTerr.length) {
    parts.push(
      'Personas captadas por territorio: ' +
        peopleByTerr
          .map((t) => `${t._id || 'Sin territorio'}: ${t.n}`)
          .join('; '),
    );
  }

  const peopleByStatus = await agg(db, 'people', [
    { $group: { _id: '$status', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]);
  if (peopleByStatus.length) {
    parts.push(
      'Personas por estado: ' +
        peopleByStatus
          .map((s) => `${s._id || '—'}: ${s.n}`)
          .join('; '),
    );
  }

  const patientsByPlace = await agg(db, 'patients', [
    { $group: { _id: '$place', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 20 },
  ]);
  if (patientsByPlace.length) {
    parts.push(
      'Pacientes por lugar: ' +
        patientsByPlace
          .map((p) => `${p._id || 'sin lugar'}: ${p.n}`)
          .join('; '),
    );
  }

  const patientsByProfile = await agg(db, 'patients', [
    { $group: { _id: '$profile', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 20 },
  ]);
  if (patientsByProfile.length) {
    parts.push(
      'Pacientes por perfil/ruta: ' +
        patientsByProfile
          .map((p) => `${p._id || 'sin perfil'}: ${p.n}`)
          .join('; '),
    );
  }

  const experts = await db
    .collection('experts')
    .find({})
    .project({
      id: 1,
      name: 1,
      terr: 1,
      phone: 1,
      active: 1,
      target: 1,
      today: 1,
      week: 1,
      training: 1,
      tablet: 1,
    })
    .limit(80)
    .toArray()
    .catch(() => []);
  if (experts.length) {
    parts.push('Expertos de campo:', JSON.stringify(experts));
  }

  const flagsByExpert = await agg(db, 'flags', [
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
    { $limit: 40 },
  ]);
  if (flagsByExpert.length) {
    parts.push(
      'Banderas / control de calidad por experto (pueden equivaler a visitas observadas o rechazadas):',
      JSON.stringify(flagsByExpert),
    );
  }

  const workByStatus = await agg(db, 'worklist_items', [
    { $group: { _id: '$status', n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]);
  if (workByStatus.length) {
    parts.push(
      'Cola de trabajo por estado: ' +
        workByStatus
          .map((w) => `${w._id || '—'}: ${w.n}`)
          .join('; '),
    );
  }

  const assetsByKind = await agg(db, 'assets', [
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
    { $limit: 30 },
  ]);
  if (assetsByKind.length) {
    parts.push('Activos (manillas/tabletas):', JSON.stringify(assetsByKind));
  }

  const alerts = await db
    .collection('alerts')
    .find({})
    .project({
      id: 1,
      name: 1,
      sev: 1,
      status: 1,
      what: 1,
      place: 1,
      profile: 1,
      at: 1,
    })
    .sort({ at: -1 })
    .limit(25)
    .toArray()
    .catch(() => []);
  if (alerts.length) {
    parts.push('Alertas recientes:', JSON.stringify(alerts));
  }

  const wantsPatientDetail =
    /paciente|persona|usuario|correo|email|tel[eé]fono|municipio|edad|caseload|ficha|perfil|phq|ruta|crisis|alerta|nombre/i.test(
      q,
    ) || !!nameHint;

  if (wantsPatientDetail || roleId === 'clinico' || roleId === 'experto') {
    const filter: Record<string, unknown> = {};
    if (nameHint && nameHint.length > 2) {
      filter.$or = [
        { name: { $regex: nameHint, $options: 'i' } },
        { email: { $regex: nameHint, $options: 'i' } },
        { place: { $regex: nameHint, $options: 'i' } },
        { municipio: { $regex: nameHint, $options: 'i' } },
        { profile: { $regex: nameHint, $options: 'i' } },
      ];
    }
    const rows = await db
      .collection('patients')
      .find(filter)
      .project({
        id: 1,
        name: 1,
        age: 1,
        place: 1,
        email: 1,
        phone: 1,
        profile: 1,
        signal: 1,
        status: 1,
        expert: 1,
        modulesEnabled: 1,
        source: 1,
      })
      .limit(nameHint ? 15 : 50)
      .toArray();
    parts.push(
      nameHint
        ? 'Pacientes que coinciden con la pregunta:'
        : 'Muestra de pacientes (hasta 50):',
      JSON.stringify(rows),
    );
  }

  if (
    /usuario|cuenta|admin|experto|cl[ií]nico|rol|permiso|observador/i.test(q)
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
      })
      .limit(100)
      .toArray();
    parts.push('Cuentas (sin contraseñas):', JSON.stringify(accounts));
  }

  return parts.join('\n\n');
}
