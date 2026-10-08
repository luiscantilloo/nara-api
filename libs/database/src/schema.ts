/** Índices críticos para ~500k personas. */
export const PEOPLE_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { code: 1 }, unique: true, sparse: true },
  { key: { terr: 1 } },
  { key: { expertId: 1 }, sparse: true },
  { key: { name: 1 } },
  { key: { status: 1, terr: 1 } },
] as const;
