export function publicPerson(doc: Record<string, unknown>) {
  return {
    id: doc.id,
    code: doc.code || '',
    name: doc.name,
    firstName: doc.firstName || '',
    lastName: doc.lastName || '',
    age: doc.age || 0,
    birthDate: doc.birthDate || '',
    place: doc.place || '',
    rural: !!doc.rural,
    terr: doc.terr || '',
    profile:
      doc.profile && /^P\d+$/i.test(String(doc.profile))
        ? String(doc.profile)
        : null,
    week: doc.week || 0,
    weeks: doc.weeks || 13,
    expert: doc.expert || '',
    expertId: doc.expertId || null,
    status: doc.status || 'Sin evaluación',
    inactiveLock: doc.inactiveLock === true,
    activeAt: doc.activeAt != null ? Number(doc.activeAt) || null : null,
    clin: doc.clin || null,
    phone: doc.phone || '',
    email: doc.email || '',
    sexo: doc.sexo || '',
    genero: doc.genero || '',
    estadoCivil: doc.estadoCivil || '',
    estrato: doc.estrato || '',
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
  };
}
