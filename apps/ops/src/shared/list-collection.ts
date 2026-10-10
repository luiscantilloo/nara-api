import type { DocumentStore } from '@nara/common';
import type { SessionService } from '@nara/auth-core';
import { requireRoles } from './require-roles';

export type ListOptions = {
  sort?: Record<string, 1 | -1>;
  /** Filtro extra según el rol de quien lista (p. ej. ocultar territorios inactivos). */
  filterFor?: (roleId: string) => Record<string, unknown>;
  /** Proyección por rol (p. ej. el observador no recibe datos personales). */
  mapFor?: (roleId: string) => ((row: Record<string, unknown>, i: number) => Record<string, unknown>) | null;
};

export async function listCollection(
  store: DocumentStore,
  sessions: SessionService,
  token: string | null,
  collection: string,
  roles: string[],
  key: string,
  sortOrOpts?: Record<string, 1 | -1> | ListOptions,
) {
  const opts: ListOptions =
    sortOrOpts && ('sort' in sortOrOpts || 'filterFor' in sortOrOpts || 'mapFor' in sortOrOpts)
      ? (sortOrOpts as ListOptions)
      : { sort: sortOrOpts as Record<string, 1 | -1> | undefined };
  const auth = await requireRoles(sessions, token, roles);
  if ('error' in auth) return auth.error;
  const roleId = auth.user.roleId;
  const filter = opts.filterFor?.(roleId) ?? {};
  const rows = await store.findMany(collection, filter, { sort: opts.sort, limit: 20000 });
  const cleaned =
    collection === 'accounts'
      ? rows.map(({ passwordHash: _p, ...rest }) => rest)
      : rows;
  const map = opts.mapFor?.(roleId);
  return { ok: true, status: 200, [key]: map ? cleaned.map(map) : cleaned };
}
