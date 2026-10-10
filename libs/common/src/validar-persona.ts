/**
 * H-007 (reporte TRL 2026-10-10, SPEC-005): reglas del alta de una persona. Las mismas que aplica el
 * formulario «Nueva persona» del experto (nara-web, useExpertoScreen.ts).
 */
export function errorFechaNacimiento(valor: unknown, hoy = new Date()): string | null {
  const v = String(valor ?? '').trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!m || !d || Number.isNaN(d.getTime()) || d.getUTCDate() !== +m[3]) return 'La fecha de nacimiento no es válida.';
  if (d.getTime() > hoy.getTime()) return 'La fecha de nacimiento no puede ser futura.';
  let edad = hoy.getUTCFullYear() - d.getUTCFullYear();
  if (hoy.getUTCMonth() < d.getUTCMonth() || (hoy.getUTCMonth() === d.getUTCMonth() && hoy.getUTCDate() < d.getUTCDate())) edad--;
  if (edad < 18 || edad > 110) return 'La edad debe estar entre 18 y 110 años.';
  return null;
}

export function errorTelefono(valor: unknown): string | null {
  const v = String(valor ?? '').trim();
  if (!v) return null;
  const digitos = v.replace(/[\s-]/g, '');
  return /^3\d{9}$/.test(digitos) ? null : 'El teléfono debe tener 10 dígitos y empezar por 3.';
}
