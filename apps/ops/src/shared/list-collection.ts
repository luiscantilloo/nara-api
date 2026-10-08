import type { DocumentStore } from '@nara/common';
import type { SessionService } from '@nara/auth-core';
import { requireRoles } from './require-roles';

export async function listCollection(
  store: DocumentStore,
  sessions: SessionService,
  token: string | null,
  collection: string,
  roles: string[],
  key: string,
  sort?: Record<string, 1 | -1>,
) {
  const auth = await requireRoles(sessions, token, roles);
  if ('error' in auth) return auth.error;
  const rows = await store.findMany(collection, {}, { sort, limit: 20000 });
  const cleaned =
    collection === 'accounts'
      ? rows.map(({ passwordHash: _p, ...rest }) => rest)
      : rows;
  return { ok: true, status: 200, [key]: cleaned };
}
