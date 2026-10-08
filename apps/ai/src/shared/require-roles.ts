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
  if (!id)
    return { error: { ok: false, status: 401, error: 'No autenticado.' } };
  const user = await sessions.loadUser(id);
  if (!user)
    return { error: { ok: false, status: 401, error: 'No autenticado.' } };
  if (roles?.length && !roles.includes(user.roleId)) {
    return {
      error: { ok: false, status: 403, error: 'Sin permiso para esta acción.' },
    };
  }
  return { user };
}
