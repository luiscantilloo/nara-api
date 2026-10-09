import { DEFAULT_PATIENT_MODULES, normalizeModuleIds } from '@nara/common';

export function publicPatient(doc: Record<string, unknown>) {
  const modulesEnabled = Array.isArray(doc.modulesEnabled)
    ? normalizeModuleIds(doc.modulesEnabled, [])
    : DEFAULT_PATIENT_MODULES.slice();
  const modulesVisible = normalizeModuleIds(
    doc.modulesVisible ?? modulesEnabled,
    modulesEnabled,
  ).filter((id) => modulesEnabled.includes(id));
  return {
    id: doc.id,
    name: doc.name,
    email: doc.email || '',
    age: doc.age || 0,
    place: doc.place || '',
    terr: doc.terr || '',
    departamento: doc.departamento || '',
    municipio: doc.municipio || '',
    profile:
      doc.profile && /^P\d+$/i.test(String(doc.profile))
        ? String(doc.profile)
        : null,
    phone: doc.phone || '',
    firstName: doc.firstName || '',
    lastName: doc.lastName || '',
    birthDate: doc.birthDate || '',
    sexo: doc.sexo || '',
    genero: doc.genero || '',
    estadoCivil: doc.estadoCivil || '',
    estrato: doc.estrato || '',
    phq: doc.phq || [],
    phqDates: doc.phqDates || [],
    expert: doc.expert || '',
    clin: doc.clin || null,
    next: doc.next || 'Primera llamada dentro de 7 días',
    nextShort: doc.nextShort || 'Primera llamada',
    consent: doc.consent !== false,
    signal: doc.signal || doc.status || 'Nueva',
    status: doc.status || doc.signal || 'Nueva',
    pendingEval: doc.pendingEval === true,
    previousProfile:
      doc.previousProfile && /^P\d+$/i.test(String(doc.previousProfile))
        ? String(doc.previousProfile)
        : null,
    evalAt: doc.evalAt || null,
    evalBy: doc.evalBy || null,
    evalPhq: doc.evalPhq ?? null,
    evalDig: doc.evalDig ?? null,
    finalEvalAt: doc.finalEvalAt || null,
    code: doc.code || '',
    summary: doc.summary || null,
    adherence: doc.adherence ?? null,
    sleep: doc.sleep ?? null,
    braceletStatus: doc.braceletStatus || '',
    audios: doc.audios || 0,
    timeline: doc.timeline || [],
    ctx: doc.ctx || { dano: 0, perdida: 0 },
    modulesEnabled,
    modulesVisible: modulesVisible.length ? modulesVisible : modulesEnabled,
    source: doc.source || '',
    accountId: doc.accountId || null,
    crisisLock: doc.crisisLock === true,
    inactiveLock: doc.inactiveLock === true,
    activeAt: doc.activeAt != null ? Number(doc.activeAt) || null : null,
    crisisAttendedAt:
      doc.crisisAttendedAt != null ? Number(doc.crisisAttendedAt) || null : null,
    crisisAttendedOutcome: doc.crisisAttendedOutcome
      ? String(doc.crisisAttendedOutcome)
      : null,
    crisisBtnReady: doc.crisisBtnReady === true,
  };
}

export function digits(s: unknown) {
  return String(s || '').replace(/\D/g, '');
}
