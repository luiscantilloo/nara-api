export const NARA_ROLES = [
  {
    id: 'admin',
    slug: 'admin',
    name: 'Administrador',
    href: '/inicio',
    nk: 'admin',
  },
  {
    id: 'experto',
    slug: 'experto',
    name: 'Experto de campo',
    href: '/experto',
    nk: null,
  },
  {
    id: 'clinico',
    slug: 'clinico',
    name: 'Clínico',
    href: '/clinico',
    nk: 'clin',
  },
  {
    id: 'paciente',
    slug: 'paciente',
    name: 'Paciente',
    href: '/paciente',
    nk: null,
  },
  {
    id: 'observador',
    slug: 'observador',
    name: 'Observador',
    href: '/observador',
    nk: null,
  },
] as const;

export type NaraRoleId = (typeof NARA_ROLES)[number]['id'];

export const ROLE_LABEL_TO_ID: Record<string, NaraRoleId> = {
  Administrador: 'admin',
  Administradora: 'admin',
  'Experto de campo': 'experto',
  'Experta de campo': 'experto',
  Clínico: 'clinico',
  Clínica: 'clinico',
  Observador: 'observador',
  Paciente: 'paciente',
};

export const PATIENT_MODULE_IDS = [
  'mood',
  'ia',
  'cursos',
  'videos',
  'tech',
  'wa',
  'call',
  'revisit',
  'group',
  'social',
  'clin',
  'bracelet',
  'hist',
] as const;

export type PatientModuleId = (typeof PATIENT_MODULE_IDS)[number];

export const DEFAULT_PATIENT_MODULES: PatientModuleId[] = [
  'mood',
  'ia',
  'cursos',
  'videos',
  'tech',
  'hist',
];

const ALLOWED_MODULES = new Set<string>(PATIENT_MODULE_IDS);

export function normalizeModuleIds(
  raw: unknown,
  fallback: readonly PatientModuleId[] = DEFAULT_PATIENT_MODULES,
): PatientModuleId[] {
  if (!Array.isArray(raw)) return fallback.slice();
  const out = raw
    .map(String)
    .filter((id): id is PatientModuleId => ALLOWED_MODULES.has(id));
  return Array.from(new Set(out));
}

export function hrefForRoleId(roleId?: string | null) {
  return NARA_ROLES.find((r) => r.id === roleId)?.href || '/ingreso';
}

export function resolveNotifKey(
  roleId: string | null | undefined,
  accountId: string,
) {
  const role = NARA_ROLES.find((r) => r.id === roleId);
  if (!role) return accountId;
  if (role.nk) return role.nk;
  return accountId;
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  roleId: string;
  terr: string;
  org: string;
  contact: string;
  status: string;
  href: string;
  nk: string | null;
  patientId?: string;
  /** @deprecated Observador ya no usa tipos; se ignora al guardar. */
  orgType?: string;
  modules?: string[];
};
