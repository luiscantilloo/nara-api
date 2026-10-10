import { SessionService, verifySessionToken } from '@nara/auth-core';

export type AuthOk = {
  user: NonNullable<Awaited<ReturnType<SessionService['loadUser']>>>;
};
export type AuthErr = { error: { ok: false; status: number; error: string } };

export async function requireRoles(
  sessions: SessionService,
  token: string | null,
  roles?: string[],
): Promise<AuthOk | AuthErr> {
  const id = verifySessionToken(token);
  if (!id) {
    void sessions.logAccess({ action: 'http_401', status: 401 });
    return { error: { ok: false, status: 401, error: 'No autenticado.' } };
  }
  const user = await sessions.loadUser(id, token);
  if (!user) {
    void sessions.logAccess({
      action: 'http_401',
      status: 401,
      accountId: id,
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
    });
    return { error: { ok: false, status: 403, error: 'Debe cambiar su clave.' } };
  }
  if (roles?.length && !roles.includes(user.roleId)) {
    void sessions.logAccess({
      action: 'http_403',
      status: 403,
      accountId: user.id,
      email: user.email,
    });
    return {
      error: { ok: false, status: 403, error: 'Sin permiso para esta acción.' },
    };
  }
  return { user };
}
