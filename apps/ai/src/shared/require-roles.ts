import { SessionService, verifySessionToken } from '@nara/auth-core';

export type AccessMeta = { ip?: string | null; path?: string | null };

export type AuthOk = {
  user: NonNullable<Awaited<ReturnType<SessionService['loadUser']>>>;
};
export type AuthErr = { error: { ok: false; status: number; error: string } };

export async function requireRoles(
  sessions: SessionService,
  token: string | null,
  roles?: string[],
  meta?: AccessMeta,
): Promise<AuthOk | AuthErr> {
  const id = verifySessionToken(token);
  if (!id) {
    void sessions.logAccess({
      action: 'http_401',
      status: 401,
      path: meta?.path,
      ip: meta?.ip,
    });
    return { error: { ok: false, status: 401, error: 'No autenticado.' } };
  }
  const user = await sessions.loadUser(id, token);
  if (!user) {
    void sessions.logAccess({
      action: 'http_401',
      status: 401,
      accountId: id,
      path: meta?.path,
      ip: meta?.ip,
    });
    return { error: { ok: false, status: 401, error: 'No autenticado.' } };
  }
  // SPEC-01 FR-01.5: con clave temporal solo se puede crear la clave nueva.
  if ((user as { mustChangePassword?: boolean }).mustChangePassword) {
    void sessions.logAccess({
      action: 'http_403',
      status: 403,
      accountId: user.id,
      email: user.email,
      path: meta?.path,
      ip: meta?.ip,
    });
    return { error: { ok: false, status: 403, error: 'Debe cambiar su clave.' } };
  }
  if (roles?.length && !roles.includes(user.roleId)) {
    void sessions.logAccess({
      action: 'http_403',
      status: 403,
      accountId: user.id,
      email: user.email,
      path: meta?.path,
      ip: meta?.ip,
    });
    return {
      error: { ok: false, status: 403, error: 'Sin permiso para esta acción.' },
    };
  }
  return { user };
}

/** 403/404 por alcance (territorio / dueño). */
export function logScopeDenied(
  sessions: SessionService,
  opts: {
    status: 403 | 404;
    accountId?: string | null;
    email?: string | null;
    path?: string | null;
    ip?: string | null;
  },
) {
  void sessions.logAccess({
    action: `http_${opts.status}`,
    status: opts.status,
    accountId: opts.accountId,
    email: opts.email,
    path: opts.path,
    ip: opts.ip,
  });
}
