/**
 * H-002 (reporte TRL 2026-10-10, SPEC-002 FR-002): `POST /api/alerts` guarda una alerta al momento, sin
 * esperar a que se guarde la visita ni a que la persona ya sea paciente. Lo usan la pregunta 9 del PHQ-9
 * (experto) y la app del paciente.
 */
import type { Db } from 'mongodb';
import type { PolicyUser } from './app-state.policy';

// Igual que APP_STATE_KEY de @nara/common. Sin alias para que `node --test` cargue este archivo.
const APP_STATE_KEY = 'app_state';
const SEV = ['crisis', 'alta', 'media', 'baja', 'info', 'open'];
const texto = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);

export async function guardarAlerta(db: Db, body: Record<string, unknown>, user: PolicyUser, ids: Set<string> | null) {
  const pid = texto(body.pid, 80);
  const sev = texto(body.sev, 20) || 'crisis';
  if (!pid) return { ok: false, status: 400, error: 'Falta la persona (pid).' };
  if (!SEV.includes(sev)) return { ok: false, status: 400, error: 'Severidad no válida.' };
  const permitido =
    user.roleId === 'admin' ||
    (user.roleId === 'paciente' && !!user.patientId && pid === user.patientId) ||
    (['experto', 'clinico'].includes(user.roleId) && !!ids && ids.has(pid));
  if (!permitido) return { ok: false, status: 403, error: 'La persona no está en su alcance.' };

  const now = new Date();
  const at = now.getTime();
  const id = texto(body.id, 80) || `a-${pid}`;
  const alerta = {
    at,
    status: sev === 'crisis' ? 'new' : 'open',
    id,
    sev,
    pid,
    name: texto(body.name, 120),
    age: body.age ?? null,
    place: texto(body.place, 120),
    profile: texto(body.profile, 10),
    what: texto(body.what),
    term: texto(body.term, 120),
    source: texto(body.source, 120),
    phone: texto(body.phone, 20),
    expert: texto(body.expert, 80) || undefined,
    createdBy: user.id,
    createdByRole: user.roleId,
  };
  const col = db.collection('program_settings');
  const ya = await col.findOne({ key: APP_STATE_KEY, 'alerts.id': id }, { projection: { _id: 1 } });
  if (ya) return { ok: true, status: 200, alert: alerta, nueva: false };

  const push: Record<string, any> = { alerts: { $each: [alerta], $position: 0 } };
  if (sev === 'crisis') {
    push.crisisLog = {
      $each: [{
        id: `cl${at}${Math.random().toString(36).slice(2, 6)}`,
        at,
        type: 'created',
        alertId: id,
        pid,
        name: alerta.name || 'Sin nombre',
        age: alerta.age,
        place: alerta.place,
        profile: alerta.profile,
        by: user.id,
        byRole: user.roleId,
        source: alerta.source,
        what: alerta.what || 'Alerta de crisis creada',
        detail: alerta.phone ? `Teléfono: ${alerta.phone}` : '',
        status: 'new',
      }],
      $position: 0,
      $slice: 800,
    };
    push['notifs.clin'] = {
      $each: [{ id: `n${at}${Math.random().toString(36).slice(2, 5)}`, text: `Nueva alerta de crisis: ${alerta.name || pid}`, link: '/clinico/crisis', at, read: false }],
      $position: 0,
    };
  }
  await col.updateOne(
    { key: APP_STATE_KEY },
    { $push: push, $set: { updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true },
  );
  if (sev === 'crisis') {
    // La persona queda en Crisis aunque todavía no sea paciente (antes POST /api/patients daba 403 al experto).
    await db.collection('people').updateOne({ id: pid }, { $set: { status: 'Crisis', updatedAt: now } });
    await db.collection('patients').updateOne(
      { id: pid },
      { $set: { status: 'Crisis', signal: 'Crisis', crisisLock: true, crisisAttendedAt: null, crisisAttendedOutcome: null, updatedAt: now } },
    );
  }
  return { ok: true, status: 201, alert: alerta, nueva: true };
}
