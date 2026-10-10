/** Proyección clínica para TEO (sin teléfono ni nombre; se usa código). */
export function toTeoPatient(doc: Record<string, unknown>) {
  const modulesEnabled = Array.isArray(doc.modulesEnabled)
    ? doc.modulesEnabled
    : [];
  return {
    id: doc.id,
    code: doc.code || '',
    age: doc.age || 0,
    place: doc.place || '',
    terr: doc.terr || '',
    municipio: doc.municipio || '',
    departamento: doc.departamento || '',
    profile: doc.profile || null,
    phq: doc.phq || [],
    phqDates: doc.phqDates || [],
    expert: doc.expert || '',
    expertId: doc.expertId || null,
    clin: doc.clin || null,
    signal: doc.signal || doc.status || 'Nueva',
    status: doc.status || doc.signal || 'Nueva',
    pendingEval: doc.pendingEval === true,
    previousProfile: doc.previousProfile || null,
    evalAt: doc.evalAt || null,
    evalBy: doc.evalBy || null,
    evalPhq: doc.evalPhq ?? null,
    evalDig: doc.evalDig ?? null,
    finalEvalAt: doc.finalEvalAt || null,
    summary: doc.summary || null,
    adherence: doc.adherence ?? null,
    sleep: doc.sleep ?? null,
    braceletStatus: doc.braceletStatus || '',
    audios: doc.audios || 0,
    timeline: doc.timeline || [],
    ctx: doc.ctx || null,
    modulesEnabled,
    modulesVisible: doc.modulesVisible || modulesEnabled,
    crisisLock: doc.crisisLock === true,
    inactiveLock: doc.inactiveLock === true,
    activeAt: doc.activeAt != null ? Number(doc.activeAt) || null : null,
    crisisAttendedAt:
      doc.crisisAttendedAt != null ? Number(doc.crisisAttendedAt) || null : null,
    crisisAttendedOutcome: doc.crisisAttendedOutcome
      ? String(doc.crisisAttendedOutcome)
      : null,
    crisisBtnReady: doc.crisisBtnReady === true,
    week: doc.week ?? null,
    weeks: doc.weeks ?? null,
    next: doc.next || null,
    nextShort: doc.nextShort || null,
  };
}
