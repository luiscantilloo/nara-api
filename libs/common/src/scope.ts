/**
 * Alcance de datos por rol (SPEC-02): lo calcula siempre el servidor.
 * - admin: todo.
 * - experto y clínico: solo su territorio (hoy hay un clínico por territorio).
 * - observador y paciente: ningún registro individual por estas rutas.
 */
export type ScopeUser = { id: string; roleId: string; terr?: string | null };

/** Roles que ven registros individuales filtrados por territorio. */
export const TERR_SCOPED_ROLES = ['experto', 'clinico'];

/** Filtro de Mongo para colecciones con campo `terr` (patients, people). `null` = sin acceso. */
export function terrFilter(user: ScopeUser): Record<string, unknown> | null {
  if (user.roleId === 'admin') return {};
  if (TERR_SCOPED_ROLES.includes(user.roleId)) {
    const terr = String(user.terr || '').trim();
    return terr ? { terr } : null;
  }
  return null;
}

/** ¿El documento (con `terr`) está dentro del alcance del usuario? */
export function inScope(user: ScopeUser, doc: { terr?: unknown } | null | undefined): boolean {
  const f = terrFilter(user);
  if (!f) return false;
  if (!('terr' in f)) return true;
  return !!doc && String(doc.terr || '') === f.terr;
}

/** Une un filtro del cliente con el alcance: el cliente solo puede reducir el resultado. */
export function andScope(
  scope: Record<string, unknown>,
  client: Record<string, unknown>,
): Record<string, unknown> {
  if (!Object.keys(scope).length) return client;
  if (!Object.keys(client).length) return scope;
  return { $and: [scope, client] };
}
