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

/**
 * SPEC-02 FR-02.4: lo que recibe el observador. Sirve para los conteos del tablero, sin datos
 * identificables: sin nombre, apellidos, teléfono, correo, código, fecha de nacimiento ni id real.
 */
export function observerPerson(doc: Record<string, unknown>, index: number) {
  const p = publicPerson(doc);
  return {
    id: `anon-${index + 1}`,
    code: '',
    name: '',
    firstName: '',
    lastName: '',
    age: p.age,
    birthDate: '',
    place: '',
    rural: p.rural,
    terr: p.terr,
    profile: p.profile,
    week: p.week,
    weeks: p.weeks,
    expert: '',
    expertId: null,
    status: p.status,
    inactiveLock: p.inactiveLock,
    activeAt: p.activeAt,
    clin: null,
    phone: '',
    email: '',
    sexo: p.sexo,
    genero: p.genero,
    estadoCivil: '',
    estrato: p.estrato,
    pendingEval: p.pendingEval,
    previousProfile: p.previousProfile,
    evalAt: p.evalAt,
    evalBy: null,
    evalPhq: p.evalPhq,
    evalDig: p.evalDig,
    finalEvalAt: p.finalEvalAt,
  };
}
