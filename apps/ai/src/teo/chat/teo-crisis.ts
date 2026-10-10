// Igual que APP_STATE_KEY de @nara/common (patterns.ts). Sin alias para que `node --test` cargue este archivo.
const APP_STATE_KEY = 'app_state';

/**
 * H-001 (reporte TRL 2026-10-10, SPEC-001): la crisis que detecta TEO se escala en el servidor.
 * Antes solo la escalaba el navegador, con el id de la cuenta, y el servidor la descartaba.
 */

// Misma lista que `CRISIS_TERMS` de nara-web (lib/store/store.js), para que el servidor escale
// aunque el proveedor de IA no responda.
export const CRISIS_TERMS = [
  'suicid', 'suisid', 'matarme', 'matarm', 'quitarme la vida', 'kitarme la vida', 'acabar con mi vida', 'acabar con todo', 'no quiero vivir', 'ya no quiero vivir', 'no kiero vivir',
  'quiero morir', 'kiero morir', 'me quiero morir', 'mejor muert', 'estaria mejor muert', 'estaría mejor muert', 'me muero', 'morirme', 'hacerme da', 'hacerme dano', 'cortarme',
  'ya no aguanto mas', 'ya no aguanto más', 'no aguanto mas', 'no aguanto más', 'quisiera desaparecer', 'quiero desaparecer', 'desaparecer para siempre', 'no quiero seguir', 'no le veo sentido', 'mejor sin mi', 'mejor sin mí', 'ser una carga', 'despedirme',
];

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Término de riesgo que aparece en el texto, o null. */
export function crisisCheck(text: string): string | null {
  const n = norm(String(text || ''));
  if (/^\s*ayuda\s*!*$/.test(n)) return 'AYUDA';
  return CRISIS_TERMS.find((k) => n.includes(norm(k))) || null;
}

/** El prompt de TEO pide responder solo «CRISIS» ante riesgo (teo-voice.ts). */
export function esRespuestaCrisis(text: string): boolean {
  return /^\W*crisis\W*$/i.test(String(text || '').trim());
}

/** Texto para la persona. Solo promete la llamada si el servidor guardó la alerta (FR-004). */
export function textoDeCrisis(nombre: string, escalada: boolean): string {
  const lineas =
    'Si está en peligro ahora, llame al 123. Si necesita hablar con alguien, marque la Línea 192, opción 4.';
  return escalada
    ? `${nombre}, gracias por contármelo. Lo que siente es importante y no tiene que pasarlo sola. Voy a pausar esta conversación para que una persona del equipo le llame en menos de 30 minutos. ${lineas}`
    : `${nombre}, gracias por contármelo. Lo que siente es importante. ${lineas}`;
}

type Db = {
  collection: (name: string) => {
    findOne: (q: Record<string, unknown>, o?: Record<string, unknown>) => Promise<Record<string, any> | null>;
    updateOne: (q: Record<string, unknown>, u: Record<string, unknown>, o?: Record<string, unknown>) => Promise<unknown>;
  };
};

/**
 * Crea la alerta de crisis (`a-<patientId>`), el evento `created` de crisisLog y el aviso al clínico,
 * y deja a la persona en Crisis. Si ya hay una alerta abierta para ese paciente, no crea otra.
 */
export async function escalarCrisis(
  db: Db,
  p: {
    patientId: string;
    patient: Record<string, any> | null;
    nombre: string;
    dicho: string;
    termino: string;
  },
): Promise<{ alertId: string; nueva: boolean }> {
  const now = new Date();
  const at = now.getTime();
  const alertId = `a-${p.patientId}`;
  const abierta = await db
    .collection('program_settings')
    .findOne({ key: APP_STATE_KEY, 'alerts.id': alertId }, { projection: { _id: 1 } });

  // Estado Crisis, igual que «Estoy en crisis» del paciente (people.service.ts).
  await db.collection('patients').updateOne(
    { id: p.patientId },
    {
      $set: {
        status: 'Crisis',
        signal: 'Crisis',
        crisisLock: true,
        inactiveLock: false,
        crisisAttendedAt: null,
        crisisAttendedOutcome: null,
        crisisBtnReady: false,
        updatedAt: now,
      },
    },
  );
  await db
    .collection('people')
    .updateOne({ id: p.patientId }, { $set: { status: 'Crisis', inactiveLock: false, updatedAt: now } });
  if (abierta) return { alertId, nueva: false };

  const pa = p.patient || {};
  const place = String(pa.place || '').split(',')[0];
  const what = `Escribió a TEO: «${p.dicho.slice(0, 280)}». TEO le dio la línea 123, pausó la conversación y levantó la alerta.`;
  const alerta = {
    at,
    status: 'new',
    id: alertId,
    sev: 'crisis',
    pid: p.patientId,
    name: p.nombre,
    age: pa.age,
    place,
    profile: pa.profile || '',
    what,
    term: p.termino,
    source: 'Conversación con TEO (IA)',
    phone: pa.phone || '',
    createdBy: 'TEO (servidor)',
    createdByRole: 'sistema',
  };
  const evento = {
    id: `cl${at}${Math.random().toString(36).slice(2, 6)}`,
    at,
    type: 'created',
    alertId,
    pid: p.patientId,
    name: p.nombre,
    age: pa.age,
    place,
    profile: pa.profile || '',
    by: 'TEO (servidor)',
    byRole: 'sistema',
    source: alerta.source,
    what,
    detail: alerta.phone ? `Teléfono: ${alerta.phone}` : '',
    status: 'new',
  };
  const aviso = {
    id: `n${at}${Math.random().toString(36).slice(2, 5)}`,
    text: `Nueva alerta de crisis: ${p.nombre}`,
    link: '/clinico/crisis',
    at,
    read: false,
  };
  await db.collection('program_settings').updateOne(
    { key: APP_STATE_KEY },
    {
      $push: {
        alerts: { $each: [alerta], $position: 0 },
        crisisLog: { $each: [evento], $position: 0, $slice: 800 },
        'notifs.clin': { $each: [aviso], $position: 0 },
      },
      $set: { updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
  return { alertId, nueva: true };
}
