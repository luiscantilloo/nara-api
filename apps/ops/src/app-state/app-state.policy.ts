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
/** Apartados guardados como mapa { idPaciente: [...] } (se filtran por clave al territorio). */
const MAPA_POR_PACIENTE = ['notes', 'pathAdjust', 'consents'];
const esMapa = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
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

/** H-003 (SPEC-003): claves de `notifs` que lee cada rol (su id y la clave de su rol). */
const NOTIFS_DEL_ROL: Record<string, string[]> = { clinico: ['clin', 'clinico'], experto: ['exp', 'experto'] };
const clavesNotifs = (user: PolicyUser) => [user.id, ...(NOTIFS_DEL_ROL[user.roleId] || [])];

/** H-003: `recursos` sin el avance de otras personas (`people`) ni la asignación (`assigned`) que no le toca. */
function filtrarRecursos(rec: unknown, deja: (clave: string) => boolean, conAsignados: boolean): unknown {
  if (!esMapa(rec)) return rec;
  const out: Record<string, unknown> = { ...rec };
  if (esMapa(rec.people)) out.people = Object.fromEntries(Object.entries(rec.people).filter(([k]) => deja(k)));
  // `assigned` es una lista de { pid, id, kind, … }.
  if (!conAsignados) delete out.assigned;
  else if (Array.isArray(rec.assigned)) out.assigned = (rec.assigned as Row[]).filter((x) => deja(pidDe(x)));
  return out;
}

/** Une los avisos por id, para que devolver la lista filtrada no borre los avisos de otros usuarios. */
function unirNotifs(previo: unknown, nuevo: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = esMapa(previo) ? { ...previo } : {};
  if (!esMapa(nuevo)) return out;
  for (const [k, lista] of Object.entries(nuevo)) {
    if (!Array.isArray(lista)) continue;
    const porId = new Map<string, Row>();
    for (const n of [...(Array.isArray(out[k]) ? (out[k] as Row[]) : []), ...(lista as Row[])]) porId.set(String(n?.id ?? JSON.stringify(n)), n);
    out[k] = [...porId.values()].sort((a, b) => Number(b?.at || 0) - Number(a?.at || 0)).slice(0, 200);
  }
  return out;
}


/**
 * IDs y códigos de los pacientes del territorio del usuario.
 * H-002 (SPEC-002 FR-001): incluye las personas de `people` que todavía no son pacientes, para que la
 * alerta y el consentimiento de una persona recién registrada en campo no se descarten.
 */
export async function idsDelTerritorio(db: Db, terr: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const col of ['patients', 'people']) {
    const rows = await db.collection(col).find({ terr }, { projection: { id: 1, code: 1, accountId: 1 } }).toArray();
    for (const r of rows) {
      if (r.id) ids.add(String(r.id));
      if (r.code) ids.add(String(r.code));
      // H-003: `recursos.people` usa el id de la cuenta del paciente como clave.
      if (r.accountId) ids.add(String(r.accountId));
    }
  }
  return ids;
}

/** Lo que `restringirEscritura` no guardó (H-002, SPEC-002 FR-003). */
export type Descarte = { apartado: string; id?: string };
const idDe = (r: Row) => String(r?.id ?? pidDe(r) ?? '');

const enAlcance = (r: Row, ids: Set<string>) => { const p = pidDe(r); return !p || ids.has(p) || ids.has(String(r?.code ?? '')); };

export function filtrarLectura(slices: Slices, user: PolicyUser, ids: Set<string> | null): Slices {
  const r = user.roleId;
  if (r === 'admin') return slices;
  const out: Slices = {};
  if (r === 'observador') {
    for (const k of OBSERVADOR_LEE) if (k in slices) out[k] = slices[k];
    // H-003 (SPEC-003 FR-002): el observador no recibe el avance por persona.
    if ('recursos' in out) out.recursos = filtrarRecursos(out.recursos, () => false, false);
    return out;
  }
  if (r === 'paciente') {
    for (const k of PACIENTE_LEE) if (k in slices) out[k] = slices[k];
    // H-003 (SPEC-003 FR-001): solo su propia entrada de `recursos.people`.
    const suyas = new Set([user.id, user.patientId].filter(Boolean).map(String));
    if ('recursos' in out) out.recursos = filtrarRecursos(out.recursos, (k) => suyas.has(k), true);
    const propio = (k: string) => (Array.isArray(slices[k]) ? (slices[k] as Row[]).filter((x) => user.patientId && pidDe(x) === user.patientId) : []);
    out.alerts = propio('alerts'); out.crisisLog = propio('crisisLog'); out.closedToday = propio('closedToday');
    // P-01: el paciente ve solo su propio consentimiento (para aceptarlo o retirarlo desde su app).
    const cons = slices.consents;
    out.consents = esMapa(cons) && user.patientId && cons[user.patientId] !== undefined ? { [user.patientId]: cons[user.patientId] } : {};
    const n = slices.notifs as Record<string, unknown> | undefined;
    out.notifs = n && n[user.id] ? { [user.id]: n[user.id] } : {};
    return out;
  }
  // experto y clínico
  for (const [k, v] of Object.entries(slices)) {
    if (SOLO_ADMIN_LEE.includes(k)) continue;
    // H-003 (SPEC-003 FR-003): avisos propios y avance por persona solo del territorio.
    if (k === 'notifs') {
      out[k] = esMapa(v) ? Object.fromEntries(clavesNotifs(user).filter((c) => v[c] !== undefined).map((c) => [c, v[c]])) : v;
      continue;
    }
    if (k === 'recursos' && ids) { out[k] = filtrarRecursos(v, (c) => ids.has(c), true); continue; }
    if (MAPA_POR_PACIENTE.includes(k) && esMapa(v) && ids) {
      // Reporte TRL 2026-10-10: las notas y ajustes de ruta de otros territorios no se leen.
      out[k] = Object.fromEntries(Object.entries(v).filter(([pid]) => ids.has(pid)));
      continue;
    }
    out[k] = POR_PACIENTE.includes(k) && Array.isArray(v) && ids ? (v as Row[]).filter((x) => enAlcance(x, ids)) : v;
  }
  return out;
}

/**
 * Deja en `incoming` solo lo que el rol puede escribir. Para experto y clínico, en los apartados por
 * paciente conserva los registros de otros territorios que ya existían (el navegador los recibió
 * filtrados y no debe borrarlos al devolver el apartado).
 */
export function restringirEscritura(
  incoming: Slices,
  existing: Slices | null,
  user: PolicyUser,
  ids: Set<string> | null,
  descartes: Descarte[] = [],
): Slices {
  const r = user.roleId;
  if (r === 'admin') return incoming;
  const out: Slices = {};
  // Un registro ajeno que ya estaba igual en la base no cuenta como descarte: el navegador solo lo devolvió.
  const yaEstaba = (k: string, x: Row) =>
    Array.isArray(existing?.[k]) && (existing![k] as Row[]).some((e) => idDe(e) === idDe(x) && JSON.stringify(e) === JSON.stringify(x));
  const anotar = (k: string, rows: Row[]) => { for (const x of rows) if (!yaEstaba(k, x)) descartes.push({ apartado: k, id: idDe(x) || undefined }); };
  if (r === 'paciente') {
    const mios = (k: string) => (Array.isArray(incoming[k]) ? (incoming[k] as Row[]).filter((x) => user.patientId && pidDe(x) === user.patientId) : undefined);
    for (const k of ['alerts', 'crisisLog', 'closedToday']) {
      const v = mios(k); if (v && v.length) out[k] = v;
      if (Array.isArray(incoming[k])) anotar(k, (incoming[k] as Row[]).filter((x) => !(user.patientId && pidDe(x) === user.patientId)));
    }
    const n = incoming.notifs as Record<string, unknown> | undefined;
    if (n && n[user.id] !== undefined) out.notifs = { ...((existing?.notifs as Record<string, unknown>) || {}), [user.id]: n[user.id] };
    // P-01: solo su propia entrada de consentimiento; las de otras personas se conservan tal cual.
    const c = incoming.consents;
    if (esMapa(c) && user.patientId && c[user.patientId] !== undefined) {
      out.consents = { ...(esMapa(existing?.consents) ? (existing!.consents as Record<string, unknown>) : {}), [user.patientId]: c[user.patientId] };
    }
    return out;
  }
  const prohibidos = r === 'experto' ? EXPERTO_NO_ESCRIBE : r === 'clinico' ? CLINICO_NO_ESCRIBE : Object.keys(incoming);
  for (const [k, v] of Object.entries(incoming)) {
    if (prohibidos.includes(k) || SOLO_ADMIN_LEE.includes(k)) { descartes.push({ apartado: k }); continue; }
    if (k === 'notifs') { out[k] = unirNotifs(existing?.notifs, v); continue; }
    if (k === 'recursos' && esMapa(v) && ids) {
      // El clínico recibió `recursos.people` filtrado: se conservan las entradas de otros territorios.
      const previo = esMapa(existing?.recursos) ? (existing!.recursos as Record<string, unknown>) : {};
      const gente = (x: unknown) => (esMapa(x) && esMapa(x.people) ? (x.people as Record<string, unknown>) : {});
      const ajenas = Object.fromEntries(Object.entries(gente(previo)).filter(([c]) => !ids.has(c)));
      const propias = Object.fromEntries(Object.entries(gente(v)).filter(([c]) => ids.has(c)));
      const asig = (x: unknown) => (esMapa(x) && Array.isArray(x.assigned) ? (x.assigned as Row[]) : []);
      const asignados = [...asig(previo).filter((x) => !ids.has(pidDe(x))), ...asig(v).filter((x) => ids.has(pidDe(x)))];
      out[k] = { ...v, people: { ...ajenas, ...propias }, assigned: asignados };
      continue;
    }
    if (MAPA_POR_PACIENTE.includes(k) && esMapa(v) && ids) {
      // Conserva las claves de otros territorios y solo acepta las del propio.
      const previo = esMapa(existing?.[k]) ? (existing![k] as Record<string, unknown>) : {};
      const ajenos = Object.fromEntries(Object.entries(previo).filter(([pid]) => !ids.has(pid)));
      const propios = Object.fromEntries(Object.entries(v).filter(([pid]) => ids.has(pid)));
      for (const [pid, x] of Object.entries(v)) {
        if (!ids.has(pid) && JSON.stringify(previo[pid]) !== JSON.stringify(x)) descartes.push({ apartado: k, id: pid });
      }
      out[k] = { ...ajenos, ...propios };
      continue;
    }
    if (POR_PACIENTE.includes(k) && Array.isArray(v) && ids) {
      const ajenos = Array.isArray(existing?.[k]) ? (existing![k] as Row[]).filter((x) => !enAlcance(x, ids)) : [];
      anotar(k, (v as Row[]).filter((x) => !enAlcance(x, ids)));
      out[k] = [...ajenos, ...(v as Row[]).filter((x) => enAlcance(x, ids))];
    } else out[k] = v;
  }
  return out;
}
