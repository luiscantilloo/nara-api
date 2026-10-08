export function publicPerson(doc: Record<string, unknown>) {
  return {
    id: doc.id,
    code: doc.code || '',
    name: doc.name,
    age: doc.age || 0,
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
    clin: doc.clin || null,
    phone: doc.phone || '',
    email: doc.email || '',
  };
}
