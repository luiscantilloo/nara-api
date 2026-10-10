/**
 * H-009 (reporte TRL 2026-10-10): el clínico de una ficha nueva es la cuenta Clínico activa de su
 * territorio, no un nombre fijo en el código («Dra. Lucía Marín» para todo lo que no fuera Risaralda o Caldas).
 * Si el territorio no tiene clínico, la ficha queda sin clínico (null) y no con un nombre inventado.
 */
export type BuscarUno = (
  coleccion: string,
  filtro: Record<string, unknown>,
) => Promise<Record<string, unknown> | null>;

export async function clinicoDelTerritorio(buscar: BuscarUno, terr: string): Promise<string | null> {
  const t = String(terr || '').trim();
  if (!t) return null;
  const cuenta = await buscar('accounts', { roleId: 'clinico', terr: t, status: { $ne: 'Inactivo' } });
  return cuenta?.name ? String(cuenta.name) : null;
}
