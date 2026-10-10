import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Db } from 'mongodb';
import { inScope, terrFilter } from '@nara/common';
import { MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { requireRoles } from '../../shared/require-roles';

/** Colección pedida + legado con datos previos. */
const COL = 'conversacion';
const LEGACY = 'teo_conversations';

const MALO =
  /miedo|mal|triste|cansad|angust|dolor|ansie|llor|peor|no puedo|sola|solo|replica|réplica/i;
const CRISIS =
  /suicid|matarme|quitarme la vida|no quiero vivir|hacerme daño|hacerme dano|\bcrisis\b/i;
const FLUJO =
  'Se registró el flujo de respiración 4-6: inhalar 4 segundos, exhalar 6 segundos, tres ciclos.';

type Turn = { role?: string; text?: string; crisis?: boolean };

function fechaDe(ms: number) {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(new Date(ms));
}

function buildRecord(messages: Turn[], flujo: boolean) {
  const patient = messages
    .filter((m) => m.role === 'paciente')
    .map((m) => String(m.text || ''));
  const joined = messages.map((m) => String(m.text || '')).join('\n');
  let estadoMental: 'bueno' | 'malo' | 'crisis' = 'bueno';
  if (messages.some((m) => m.crisis) || CRISIS.test(joined))
    estadoMental = 'crisis';
  else if (MALO.test(patient.join(' '))) estadoMental = 'malo';
  const spoken = messages
    .map(
      (m) =>
        `${m.role === 'paciente' ? 'Paciente' : 'TEO'}: ${String(m.text || '')}`,
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
  let resumen = spoken || 'Conversación con TEO.';
  if (!/[.!?]$/.test(resumen)) resumen = `${resumen}.`;
  if (flujo) resumen = `${resumen} ${FLUJO}`;
  if (estadoMental === 'crisis') resumen = `Crisis. ${resumen}`;
  return { resumen, estadoMental };
}

function publicRow(doc: Record<string, unknown>) {
  return {
    id: String(doc.id || ''),
    patientId: String(doc.patientId || ''),
    patientName: String(doc.patientName || ''),
    accountId: doc.accountId ? String(doc.accountId) : undefined,
    startedAt: Number(doc.startedAt) || 0,
    fecha: String(doc.fecha || ''),
    resumen: String(doc.resumen || ''),
    estadoMental: (doc.estadoMental as string) || 'bueno',
    flujoRespiracion: doc.flujoRespiracion === true,
    status: String(doc.status || 'abierta'),
    closedAt: doc.closedAt != null ? Number(doc.closedAt) : null,
    messages: Array.isArray(doc.messages) ? doc.messages : [],
    updatedAt: Number(doc.updatedAt) || 0,
  };
}

type ScopeUser = { id: string; roleId: string; terr?: string | null };

/** Resuelve ficha people/patients y comprueba territorio (experto/clínico). */
async function resolveScopedPatient(
  db: Db,
  user: ScopeUser,
  opts: { patientId?: string; patientName?: string },
): Promise<
  | { ok: true; keys: string[] }
  | { ok: false; status: number; error: string }
> {
  const scope = terrFilter(user);
  if (!scope) {
    return { ok: false, status: 403, error: 'Sin permiso para esta acción.' };
  }
  const adminAll = !('terr' in scope);
  const terrQ = adminAll ? {} : { terr: scope.terr };

  const patientId = String(opts.patientId || '').trim();
  const patientName = String(opts.patientName || '').trim();

  if (patientId) {
    const hit =
      (await db.collection('patients').findOne({
        $and: [
          terrQ,
          {
            $or: [
              { id: patientId },
              { accountId: patientId },
              { code: patientId },
            ],
          },
        ],
      })) ||
      (await db.collection('people').findOne({
        $and: [
          terrQ,
          {
            $or: [
              { id: patientId },
              { accountId: patientId },
              { code: patientId },
            ],
          },
        ],
      }));
    if (!hit) {
      return {
        ok: false,
        status: 404,
        error: 'Paciente no encontrado en su territorio.',
      };
    }
    if (!adminAll && !inScope(user, hit as { terr?: unknown })) {
      return { ok: false, status: 403, error: 'Sin permiso para esta acción.' };
    }
    const keys = [
      String(hit.id || ''),
      hit.accountId ? String(hit.accountId) : '',
      hit.code ? String(hit.code) : '',
      patientId,
    ].filter(Boolean);
    return { ok: true, keys: Array.from(new Set(keys)) };
  }

  if (patientName) {
    const rx = {
      $regex: `^${patientName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      $options: 'i',
    };
    const [fromPatients, fromPeople] = await Promise.all([
      db
        .collection('patients')
        .find({ ...terrQ, name: rx })
        .project({ id: 1, accountId: 1, code: 1, terr: 1 })
        .limit(20)
        .toArray(),
      db
        .collection('people')
        .find({ ...terrQ, name: rx })
        .project({ id: 1, accountId: 1, code: 1, terr: 1 })
        .limit(20)
        .toArray(),
    ]);
    const keys = new Set<string>();
    for (const hit of [...fromPatients, ...fromPeople]) {
      if (!adminAll && !inScope(user, hit as { terr?: unknown })) continue;
      if (hit.id) keys.add(String(hit.id));
      if (hit.accountId) keys.add(String(hit.accountId));
      if (hit.code) keys.add(String(hit.code));
    }
    if (!keys.size) {
      return {
        ok: false,
        status: 404,
        error: 'Paciente no encontrado en su territorio.',
      };
    }
    return { ok: true, keys: Array.from(keys) };
  }

  return {
    ok: false,
    status: 400,
    error: 'Indique patientId o patientName.',
  };
}

@Injectable()
export class TeoConversationsService {
  constructor(
    private readonly mongo: MongoStore,
    private readonly sessions: SessionService,
  ) {}

  async list(data: {
    token: string | null;
    patientId?: string;
    patientName?: string;
  }) {
    const auth = await requireRoles(this.sessions, data.token, [
      'paciente',
      'clinico',
      'admin',
      'experto',
    ]);
    if ('error' in auth) return auth.error;

    const db = await this.mongo.db();
    const patientId = String(data.patientId || '').trim();
    const patientName = String(data.patientName || '').trim();

    // Paciente: solo las suyas. Experto/clínico: solo su territorio (6.11 / 5.11 / 6.22).
    let filter: Record<string, unknown> = {};
    if (auth.user.roleId === 'paciente') {
      const pid = String(
        (auth.user as { patientId?: string }).patientId || auth.user.id,
      );
      filter = {
        $or: [{ accountId: auth.user.id }, { patientId: pid }],
      };
    } else {
      const scoped = await resolveScopedPatient(db, auth.user, {
        patientId,
        patientName,
      });
      if (!scoped.ok) {
        return { ok: false, status: scoped.status, error: scoped.error };
      }
      filter = {
        $or: [
          { patientId: { $in: scoped.keys } },
          { accountId: { $in: scoped.keys } },
        ],
      };
      // Si pidieron por nombre, también acotar patientName (mismo territorio ya validado).
      if (patientName && !patientId) {
        filter = {
          $and: [
            filter,
            {
              patientName: {
                $regex: `^${patientName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
                $options: 'i',
              },
            },
          ],
        };
      }
    }

    const [a, b] = await Promise.all([
      db.collection(COL).find(filter).sort({ startedAt: -1 }).limit(200).toArray(),
      db
        .collection(LEGACY)
        .find(filter)
        .sort({ startedAt: -1 })
        .limit(200)
        .toArray()
        .catch(() => []),
    ]);

    const map = new Map<string, Record<string, unknown>>();
    for (const doc of [...b, ...a]) {
      const id = String(doc.id || doc._id || '');
      if (!id) continue;
      map.set(id, doc as Record<string, unknown>);
    }
    const conversations = Array.from(map.values())
      .map(publicRow)
      .sort((x, y) => y.startedAt - x.startedAt);

    return { ok: true, conversations };
  }

  async upsert(data: {
    token: string | null;
    body: Record<string, unknown>;
  }) {
    const auth = await requireRoles(this.sessions, data.token, [
      'paciente',
      'clinico',
      'admin',
    ]);
    if ('error' in auth) return auth.error;

    const body = data.body || {};
    // UUID opaco (cliente o servidor); evita ids predecibles tipo tc-<Date.now>.
    let id = String(body.id || '').trim();
    if (!id) id = randomUUID();
    else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) && !/^tc-[0-9a-z]+$/i.test(id)) {
      // Acepta UUID o ids legado tc-*; rechaza basura.
      return { ok: false, status: 400, error: 'Id de conversación inválido.' };
    }

    const messages = Array.isArray(body.messages)
      ? (body.messages as Turn[])
      : [];
    const flujo =
      body.flujoRespiracion === true ||
      messages.some(
        (m) =>
          m.role === 'teo' && /respir/i.test(String(m.text || '')),
      );
    const { resumen, estadoMental } = buildRecord(messages, flujo);
    const startedAt = Number(body.startedAt) || Date.now();
    const close = body.close === true;
    const now = Date.now();

    let patientId = String(body.patientId || '').trim();
    let patientName = String(body.patientName || '').trim();
    let accountId = String(body.accountId || '').trim();
    let ownerKeys: string[] = [];

    const db = await this.mongo.db();

    if (auth.user.roleId === 'paciente') {
      accountId = auth.user.id;
      const account = await db
        .collection('accounts')
        .findOne({ id: auth.user.id });
      const linked = account?.patientId ? String(account.patientId) : '';
      const fromSession = String(
        (auth.user as { patientId?: string }).patientId || '',
      );
      patientId = linked || fromSession || patientId || auth.user.id;
      if (!patientName) {
        patientName = String(
          account?.name ||
            (auth.user as { name?: string }).name ||
            'Paciente',
        );
      }
      ownerKeys = [accountId, patientId].filter(Boolean);
    } else if (auth.user.roleId === 'clinico' || auth.user.roleId === 'experto') {
      const scoped = await resolveScopedPatient(db, auth.user, {
        patientId: patientId || accountId,
        patientName: patientId || accountId ? undefined : patientName,
      });
      if (!scoped.ok) {
        void this.sessions.logAccess({
          action: 'http_' + scoped.status,
          status: scoped.status,
          accountId: auth.user.id,
          email: auth.user.email,
          path: '/teo/conversations',
        });
        return { ok: false, status: scoped.status, error: scoped.error };
      }
      ownerKeys = scoped.keys;
      if (!patientId && scoped.keys[0]) patientId = scoped.keys[0];
    } else if (auth.user.roleId === 'admin') {
      ownerKeys = [patientId, accountId].filter(Boolean);
    }

    // 6.11: si el id ya existe y no es del dueño / territorio → 403 sin escribir.
    const existing =
      (await db.collection(COL).findOne({ id })) ||
      (await db.collection(LEGACY).findOne({ id }).catch(() => null));
    if (existing) {
      const existingPid = String(existing.patientId || '');
      const existingAcc = String(existing.accountId || '');
      const owns =
        auth.user.roleId === 'admin' ||
        (auth.user.roleId === 'paciente' &&
          (existingAcc === auth.user.id ||
            existingPid === patientId ||
            ownerKeys.includes(existingPid) ||
            ownerKeys.includes(existingAcc))) ||
        ((auth.user.roleId === 'clinico' || auth.user.roleId === 'experto') &&
          (ownerKeys.includes(existingPid) ||
            ownerKeys.includes(existingAcc) ||
            (!existingPid && !existingAcc)));
      if (!owns) {
        void this.sessions.logAccess({
          action: 'http_403',
          status: 403,
          accountId: auth.user.id,
          email: auth.user.email,
          path: '/teo/conversations',
        });
        return {
          ok: false,
          status: 403,
          error: 'Sin permiso para esta conversación.',
        };
      }
      // Conservar dueño original si el body no lo trae.
      if (!patientId && existingPid) patientId = existingPid;
      if (!accountId && existingAcc) accountId = existingAcc;
      if (!patientName && existing.patientName) {
        patientName = String(existing.patientName);
      }
    }

    const doc = {
      id,
      patientId,
      patientName,
      accountId: accountId || undefined,
      startedAt,
      fecha: fechaDe(startedAt),
      messages,
      resumen,
      estadoMental,
      flujoRespiracion: flujo,
      status: close ? 'cerrada' : 'abierta',
      closedAt: close ? now : null,
      updatedAt: now,
    };

    // Dueño en el filtro al actualizar; upsert solo si no existía (ya validado arriba).
    const writeFilter: Record<string, unknown> = existing
      ? auth.user.roleId === 'paciente'
        ? {
            id,
            $or: [{ accountId: auth.user.id }, { patientId }],
          }
        : auth.user.roleId === 'admin'
          ? { id }
          : {
              id,
              $or: [
                { patientId: { $in: ownerKeys } },
                { accountId: { $in: ownerKeys } },
              ],
            }
      : { id };

    const r = await db.collection(COL).updateOne(
      writeFilter,
      { $set: doc },
      { upsert: !existing },
    );
    if (existing && r.matchedCount === 0) {
      void this.sessions.logAccess({
        action: 'http_403',
        status: 403,
        accountId: auth.user.id,
        email: auth.user.email,
        path: '/teo/conversations',
      });
      return {
        ok: false,
        status: 403,
        error: 'Sin permiso para esta conversación.',
      };
    }
    await db
      .collection(LEGACY)
      .updateOne(writeFilter, { $set: doc }, { upsert: !existing })
      .catch(() => undefined);

    return { ok: true, conversation: publicRow(doc) };
  }
}
