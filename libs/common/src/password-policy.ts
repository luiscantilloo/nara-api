/**
 * Política de claves (punto 5 · T2).
 * API /api/accounts y cambio de clave deben responder 400.
 */

const SHARED_PRIVILEGED = ['naraprueba#2026', 'adminnara2026'];

function norm(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

function fragments(email: string, name: string): string[] {
  const out: string[] = [];
  const em = norm(email);
  if (em) {
    out.push(em);
    const local = em.split('@')[0] || '';
    if (local.length >= 3) out.push(local);
  }
  const nm = norm(name);
  if (nm) {
    out.push(nm);
    for (const part of nm.split(/\s+/).filter((p) => p.length >= 3)) out.push(part);
  }
  return [...new Set(out.filter(Boolean))];
}

function isAdminOrClinico(role: string, roleId?: string) {
  const r = norm(role);
  const id = norm(roleId || '');
  return (
    id === 'admin' ||
    id === 'clinico' ||
    r === 'administrador' ||
    r === 'administradora' ||
    r === 'clinico' ||
    r === 'clínico'
  );
}

function isPrivileged(role: string, roleId?: string) {
  const r = norm(role);
  const id = norm(roleId || '');
  return (
    isAdminOrClinico(role, roleId) ||
    id === 'experto' ||
    r === 'experto de campo' ||
    r === 'experto'
  );
}

export type PasswordPolicyInput = {
  password: string;
  email?: string;
  name?: string;
  role?: string;
  roleId?: string;
};

/** Mensaje de error o null si la clave es válida. */
export function passwordPolicyError(input: PasswordPolicyInput): string | null {
  const password = String(input.password || '');
  if (!password) return null;

  const minLen = isAdminOrClinico(input.role || '', input.roleId) ? 12 : 8;
  if (password.length < minLen) {
    return isAdminOrClinico(input.role || '', input.roleId)
      ? 'La contraseña de Administrador o Clínico debe tener al menos 12 caracteres.'
      : 'La contraseña debe tener al menos 8 caracteres.';
  }

  const passN = norm(password);
  for (const frag of fragments(String(input.email || ''), String(input.name || ''))) {
    if (frag && passN.includes(frag)) {
      return 'La contraseña no puede contener el correo, la parte antes de @ ni el nombre de la cuenta.';
    }
  }

  if (isPrivileged(input.role || '', input.roleId) && SHARED_PRIVILEGED.includes(passN)) {
    return 'Esa clave es compartida entre cuentas de prueba. Use una distinta para cada rol privilegiado.';
  }

  return null;
}
