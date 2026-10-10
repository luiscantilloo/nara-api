/**
 * SPEC-02 FR-02.5 y FR-02.6: qué apartados del estado compartido (`program_settings.app_state`)
 * lee y escribe cada rol. Antes todos los roles leían todo y paciente, experto y clínico escribían todo.
 */
import type { Db } from 'mongodb';

type Slices = Record<string, unknown>;
type Row = Record<string, unknown>;
export type PolicyUser = { id: string; roleId: string; terr?: string | null; patientId?: string };

/** Apartados con un registro por paciente (se filtran al territorio para experto y clínico). */
const POR_PACIENTE = ['alerts', 'crisisLog', 'closedToday', 'notes', 'referrals', 'consents', 'visits', 'revisits', 'falsePositives', 'pendingSync', 'pathAdjust', 'rejected'];
/** Registros internos: solo el admin los lee. */
const SOLO_ADMIN_LEE = ['accessLog', 'agentLog', 'aiLog', 'activity'];
/** Configuración que el experto no escribe. */
const EXPERTO_NO_ESCRIBE = ['rules', 'pathOverrides', 'pathRequests', 'recursos', 'terrOv', 'expertOv', 'personOv', 'assetOv', 'assets', 'weekBase', 'reports', 'customReports', 'schedules'];
/** Configuración que el clínico no escribe. */
const CLINICO_NO_ESCRIBE = ['terrOv', 'expertOv', 'personOv', 'assetOv', 'assets', 'weekBase'];
/** Lo único que lee el observador (sin datos personales). */
const OBSERVADOR_LEE = ['rules', 'recursos', 'weekBase', 'terrOv'];
/** Lo que lee el paciente para pintar su app. */
const PACIENTE_LEE = ['rules', 'recursos', 'pathOverrides'];

const pidDe = (r: Row) => String(r?.pid ?? r?.personId ?? r?.patientId ?? '');

/** IDs y códigos de los pacientes del territorio del usuario. */
export async function idsDelTerritorio(db: Db, terr: string): Promise<Set<string>> {
  const rows = await db.collection('patients').find({ terr }, { projection: { id: 1, code: 1 } }).toArray();
  const ids = new Set<string>();
  for (const r of rows) { if (r.id) ids.add(String(r.id)); if (r.code) ids.add(String(r.code)); }
  return ids;
}

const enAlcance = (r: Row, ids: Set<string>) => { const p = pidDe(r); return !p || ids.has(p) || ids.has(String(r?.code ?? '')); };

export function filtrarLectura(slices: Slices, user: PolicyUser, ids: Set<string> | null): Slices {
  const r = user.roleId;
  if (r === 'admin') return slices;
  const out: Slices = {};
  if (r === 'observador') { for (const k of OBSERVADOR_LEE) if (k in slices) out[k] = slices[k]; return out; }
  if (r === 'paciente') {
    for (const k of PACIENTE_LEE) if (k in slices) out[k] = slices[k];
    const propio = (k: string) => (Array.isArray(slices[k]) ? (slices[k] as Row[]).filter((x) => user.patientId && pidDe(x) === user.patientId) : []);
    out.alerts = propio('alerts'); out.crisisLog = propio('crisisLog'); out.closedToday = propio('closedToday');
    const n = slices.notifs as Record<string, unknown> | undefined;
    out.notifs = n && n[user.id] ? { [user.id]: n[user.id] } : {};
    return out;
  }
  // experto y clínico
  for (const [k, v] of Object.entries(slices)) {
    if (SOLO_ADMIN_LEE.includes(k)) continue;
    out[k] = POR_PACIENTE.includes(k) && Array.isArray(v) && ids ? (v as Row[]).filter((x) => enAlcance(x, ids)) : v;
  }
  return out;
}

/**
 * Deja en `incoming` solo lo que el rol puede escribir. Para experto y clínico, en los apartados por
 * paciente conserva los registros de otros territorios que ya existían (el navegador los recibió
 * filtrados y no debe borrarlos al devolver el apartado).
 */
export function restringirEscritura(incoming: Slices, existing: Slices | null, user: PolicyUser, ids: Set<string> | null): Slices {
  const r = user.roleId;
  if (r === 'admin') return incoming;
  const out: Slices = {};
  if (r === 'paciente') {
    const mios = (k: string) => (Array.isArray(incoming[k]) ? (incoming[k] as Row[]).filter((x) => user.patientId && pidDe(x) === user.patientId) : undefined);
    for (const k of ['alerts', 'crisisLog', 'closedToday']) { const v = mios(k); if (v && v.length) out[k] = v; }
    const n = incoming.notifs as Record<string, unknown> | undefined;
    if (n && n[user.id] !== undefined) out.notifs = { ...((existing?.notifs as Record<string, unknown>) || {}), [user.id]: n[user.id] };
    return out;
  }
  const prohibidos = r === 'experto' ? EXPERTO_NO_ESCRIBE : r === 'clinico' ? CLINICO_NO_ESCRIBE : Object.keys(incoming);
  for (const [k, v] of Object.entries(incoming)) {
    if (prohibidos.includes(k) || SOLO_ADMIN_LEE.includes(k)) continue;
    if (POR_PACIENTE.includes(k) && Array.isArray(v) && ids) {
      const ajenos = Array.isArray(existing?.[k]) ? (existing![k] as Row[]).filter((x) => !enAlcance(x, ids)) : [];
      out[k] = [...ajenos, ...(v as Row[]).filter((x) => enAlcance(x, ids))];
    } else out[k] = v;
  }
  return out;
}
