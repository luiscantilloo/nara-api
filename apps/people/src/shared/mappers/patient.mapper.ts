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
    signal: doc.signal || 'Nueva',
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
  };
}

export function digits(s: unknown) {
  return String(s || '').replace(/\D/g, '');
}
