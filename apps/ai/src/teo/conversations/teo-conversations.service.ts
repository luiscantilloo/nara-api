import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { requireRoles } from '../../shared/require-roles';
import {
  canWriteConversation,
  resolveConversationsListScope,
  type ScopeUser,
} from './teo-conversations.access';

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
    // Observador y otros roles → 403 (no están en la lista).
    const auth = await requireRoles(this.sessions, data.token, [
      'paciente',
      'clinico',
      'admin',
      'experto',
    ]);
    if ('error' in auth) return auth.error;

    const db = await this.mongo.db();
    const user: ScopeUser = {
      id: auth.user.id,
      roleId: auth.user.roleId,
      terr: auth.user.terr,
      patientId: (auth.user as { patientId?: string }).patientId,
    };

    const scope = await resolveConversationsListScope(db, user, {
      patientId: data.patientId,
      patientName: data.patientName,
    });
    if (!scope.ok) {
      void this.sessions.logAccess({
        action: `http_${scope.status}`,
        status: scope.status,
        accountId: auth.user.id,
        email: auth.user.email,
        path: '/teo/conversations',
      });
      return { ok: false, status: scope.status, error: scope.error };
    }

    const filter = scope.filter ?? {};

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
      'experto',
    ]);
    if ('error' in auth) return auth.error;

    const body = data.body || {};
    // UUID opaco (cliente o servidor); evita ids predecibles tipo tc-<Date.now>.
    let id = String(body.id || '').trim();
    if (!id) id = randomUUID();
    else if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      ) &&
      !/^tc-[0-9a-z]+$/i.test(id)
    ) {
      return { ok: false, status: 400, error: 'Id de conversación inválido.' };
    }

    const messages = Array.isArray(body.messages)
      ? (body.messages as Turn[])
      : [];
    const flujo =
      body.flujoRespiracion === true ||
      messages.some(
        (m) => m.role === 'teo' && /respir/i.test(String(m.text || '')),
      );
    const { resumen, estadoMental } = buildRecord(messages, flujo);
    const startedAt = Number(body.startedAt) || Date.now();
    const close = body.close === true;
    const now = Date.now();

    const db = await this.mongo.db();
    const user: ScopeUser = {
      id: auth.user.id,
      roleId: auth.user.roleId,
      terr: auth.user.terr,
      patientId: (auth.user as { patientId?: string }).patientId,
    };

    // Punto 5 · T1: dueño = accountId de la sesión. Nunca del body.
    const accountId = auth.user.id;
    let patientId = '';
    let patientName = String(
      (auth.user as { name?: string }).name || '',
    ).trim();

    // Cargar existente por id (cualquier dueño) para denegar ajenas.
    const existing =
      (await db.collection(COL).findOne({ id })) ||
      (await db.collection(LEGACY).findOne({ id }).catch(() => null));

    if (existing) {
      if (
        !canWriteConversation(
          user,
          existing as { patientId?: unknown; accountId?: unknown },
        )
      ) {
        void this.sessions.logAccess({
          action: 'http_403',
          status: 403,
          accountId: auth.user.id,
          email: auth.user.email,
          path: `/teo/conversations#${id}`,
        });
        return {
          ok: false,
          status: 403,
          error: 'Sin permiso para esta conversación.',
        };
      }
      patientId = String(existing.patientId || '');
      if (!patientName && existing.patientName) {
        patientName = String(existing.patientName);
      }
    }

    if (auth.user.roleId === 'paciente') {
      // Punto 5 · T5: patientId solo de ficha/sesión; nunca del body.
      const account = await db
        .collection('accounts')
        .findOne({ id: auth.user.id });
      const linked = account?.patientId ? String(account.patientId) : '';
      const fromSession = String(user.patientId || '');
      const fromFicha = await db.collection('patients').findOne({
        accountId: auth.user.id,
      });
      patientId =
        linked ||
        fromSession ||
        (fromFicha?.id ? String(fromFicha.id) : '');
      if (!patientId) {
        void this.sessions.logAccess({
          action: 'http_403',
          status: 403,
          accountId: auth.user.id,
          email: auth.user.email,
          path: `/teo/conversations#sin-ficha`,
        });
        return {
          ok: false,
          status: 403,
          error: 'Sin ficha vinculada',
        };
      }
      if (!patientName) {
        patientName = String(
          account?.name ||
            (auth.user as { name?: string }).name ||
            'Paciente',
        );
      }
    } else {
      // Personal: conversaciones propias con TEO (su accountId). No usa patientId del body.
      patientId = existing ? String(existing.patientId || '') : accountId;
      if (!patientName) {
        patientName = String(
          (auth.user as { name?: string }).name || auth.user.roleId,
        );
      }
    }

    const doc = {
      id,
      patientId,
      patientName,
      accountId,
      startedAt: existing ? Number(existing.startedAt) || startedAt : startedAt,
      fecha: fechaDe(
        existing ? Number(existing.startedAt) || startedAt : startedAt,
      ),
      messages,
      resumen,
      estadoMental,
      flujoRespiracion: flujo,
      status: close ? 'cerrada' : 'abierta',
      closedAt: close ? now : null,
      updatedAt: now,
    };

    // Upsert solo sobre el documento del dueño de la sesión.
    const writeFilter: Record<string, unknown> = { id, accountId };

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
        path: `/teo/conversations#${id}`,
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
