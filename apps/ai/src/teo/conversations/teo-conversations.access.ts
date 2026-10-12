/**
 * Matriz de acceso a conversaciones TEO (6.11 / S-2).
 * - paciente: solo las suyas (ignora patientId/name del cliente).
 * - experto/clínico: solo pids de su territorio.
 * - admin: todas (o filtro opcional).
 * - observador / otros: sin acceso (lo aplica requireRoles).
 */
import type { Db } from 'mongodb';
import { inScope, terrFilter } from '@nara/common';

export type ScopeUser = { id: string; roleId: string; terr?: string | null; patientId?: string };

export type ListScopeOk = {
  ok: true;
  /** null = admin sin filtro (todas). */
  filter: Record<string, unknown> | null;
};
export type ListScopeErr = { ok: false; status: number; error: string };

/** Claves (id, accountId, code) de patients/people en un territorio. */
export async function territoryPersonKeys(
  db: Db,
  terr: string,
): Promise<string[]> {
  const keys = new Set<string>();
  for (const col of ['patients', 'people'] as const) {
    const rows = await db
      .collection(col)
      .find({ terr }, { projection: { id: 1, accountId: 1, code: 1 } })
      .toArray()
      .catch(() => []);
    for (const r of rows) {
      if (r.id) keys.add(String(r.id));
      if (r.accountId) keys.add(String(r.accountId));
      if (r.code) keys.add(String(r.code));
    }
  }
  return [...keys];
}

export function conversationsByKeysFilter(keys: string[]): Record<string, unknown> {
  return {
    $or: [
      { patientId: { $in: keys } },
      { accountId: { $in: keys } },
    ],
  };
}

export function patientOwnConversationsFilter(user: ScopeUser): Record<string, unknown> {
  const pid = String(user.patientId || user.id);
  return {
    $or: [{ accountId: user.id }, { patientId: pid }],
  };
}

/** Resuelve ficha y comprueba territorio (experto/clínico/admin). */
export async function resolveScopedPatient(
  db: Db,
  user: ScopeUser,
  opts: { patientId?: string; patientName?: string },
): Promise<
  | { ok: true; keys: string[] }
  | { ok: false; status: number; error: string }
> {
  const scope = terrFilter(user);
  if (!scope) {
    return { ok: false, status: 403, error: 'Sin permiso para esta acción.' };
  }
  const adminAll = !('terr' in scope);
  const terrQ = adminAll ? {} : { terr: scope.terr };

  const patientId = String(opts.patientId || '').trim();
  const patientName = String(opts.patientName || '').trim();

  if (patientId) {
    const hit =
      (await db.collection('patients').findOne({
        $and: [
          terrQ,
          {
            $or: [
              { id: patientId },
              { accountId: patientId },
              { code: patientId },
            ],
          },
        ],
      })) ||
      (await db.collection('people').findOne({
        $and: [
          terrQ,
          {
            $or: [
              { id: patientId },
              { accountId: patientId },
              { code: patientId },
            ],
          },
        ],
      }));
    if (!hit) {
      return {
        ok: false,
        status: 404,
        error: 'Paciente no encontrado en su territorio.',
      };
    }
    if (!adminAll && !inScope(user, hit as { terr?: unknown })) {
      return { ok: false, status: 403, error: 'Sin permiso para esta acción.' };
    }
    const keys = [
      String(hit.id || ''),
      hit.accountId ? String(hit.accountId) : '',
      hit.code ? String(hit.code) : '',
      patientId,
    ].filter(Boolean);
    return { ok: true, keys: Array.from(new Set(keys)) };
  }

  if (patientName) {
    const rx = {
      $regex: `^${patientName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      $options: 'i',
    };
    const [fromPatients, fromPeople] = await Promise.all([
      db
        .collection('patients')
        .find({ ...terrQ, name: rx })
        .project({ id: 1, accountId: 1, code: 1, terr: 1 })
        .limit(20)
        .toArray(),
      db
        .collection('people')
        .find({ ...terrQ, name: rx })
        .project({ id: 1, accountId: 1, code: 1, terr: 1 })
        .limit(20)
        .toArray(),
    ]);
    const keys = new Set<string>();
    for (const hit of [...fromPatients, ...fromPeople]) {
      if (!adminAll && !inScope(user, hit as { terr?: unknown })) continue;
      if (hit.id) keys.add(String(hit.id));
      if (hit.accountId) keys.add(String(hit.accountId));
      if (hit.code) keys.add(String(hit.code));
    }
    if (!keys.size) {
      return {
        ok: false,
        status: 404,
        error: 'Paciente no encontrado en su territorio.',
      };
    }
    return { ok: true, keys: Array.from(keys) };
  }

  return {
    ok: false,
    status: 400,
    error: 'Indique patientId o patientName.',
  };
}

/**
 * Filtro de listado según rol.
 * El paciente ignora patientId/patientName del cliente (no escalar).
 */
export async function resolveConversationsListScope(
  db: Db,
  user: ScopeUser,
  opts: { patientId?: string; patientName?: string },
): Promise<ListScopeOk | ListScopeErr> {
  const role = user.roleId;
  if (role === 'paciente') {
    return { ok: true, filter: patientOwnConversationsFilter(user) };
  }
  if (role === 'admin') {
    const patientId = String(opts.patientId || '').trim();
    const patientName = String(opts.patientName || '').trim();
    if (!patientId && !patientName) {
      return { ok: true, filter: null };
    }
    const scoped = await resolveScopedPatient(db, user, { patientId, patientName });
    if (!scoped.ok) return scoped;
    return { ok: true, filter: conversationsByKeysFilter(scoped.keys) };
  }
  if (role === 'experto' || role === 'clinico') {
    const scope = terrFilter(user);
    if (!scope || !('terr' in scope)) {
      return { ok: false, status: 403, error: 'Sin permiso para esta acción.' };
    }
    const patientId = String(opts.patientId || '').trim();
    const patientName = String(opts.patientName || '').trim();
    if (patientId || patientName) {
      const scoped = await resolveScopedPatient(db, user, {
        patientId,
        patientName,
      });
      if (!scoped.ok) return scoped;
      let filter: Record<string, unknown> = conversationsByKeysFilter(scoped.keys);
      if (patientName && !patientId) {
        filter = {
          $and: [
            filter,
            {
              patientName: {
                $regex: `^${patientName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
                $options: 'i',
              },
            },
          ],
        };
      }
      return { ok: true, filter };
    }
    const keys = await territoryPersonKeys(db, String(scope.terr));
    if (!keys.length) {
      // Sin personas en territorio: lista vacía (filtro imposible).
      return { ok: true, filter: { patientId: '__ninguno__' } };
    }
    return { ok: true, filter: conversationsByKeysFilter(keys) };
  }
  return { ok: false, status: 403, error: 'Sin permiso para esta acción.' };
}

/**
 * ¿Puede escribir sobre una conversación existente? (punto 5 · T1)
 * Solo el dueño (`accountId` de la sesión). Ningún rol (clínico, experto, admin)
 * puede sobrescribir la conversación de otra cuenta.
 */
export function canWriteConversation(
  user: ScopeUser,
  existing: { patientId?: unknown; accountId?: unknown },
  _ownerKeys: string[] = [],
): boolean {
  const existingAcc = String(existing.accountId || '');
  if (existingAcc) return existingAcc === user.id;
  // Legado sin accountId: solo el paciente dueño por patientId.
  if (user.roleId === 'paciente') {
    const pid = String(user.patientId || user.id);
    const existingPid = String(existing.patientId || '');
    return existingPid === pid || existingPid === user.id;
  }
  return false;
}
