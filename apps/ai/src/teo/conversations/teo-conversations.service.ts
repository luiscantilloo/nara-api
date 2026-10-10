import { Injectable } from '@nestjs/common';
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

    // Paciente: solo las suyas
    let filter: Record<string, unknown> = {};
    if (auth.user.roleId === 'paciente') {
      const pid = String(
        (auth.user as { patientId?: string }).patientId || auth.user.id,
      );
      filter = {
        $or: [{ accountId: auth.user.id }, { patientId: pid }],
      };
    } else if (patientId) {
      filter = {
        $or: [
          { patientId },
          { accountId: patientId },
        ],
      };
    } else if (patientName) {
      filter = {
        patientName: {
          $regex: `^${patientName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          $options: 'i',
        },
      };
    } else {
      return {
        ok: false,
        status: 400,
        error: 'Indique patientId o patientName.',
      };
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
    const id = String(body.id || '').trim();
    if (!id) return { ok: false, status: 400, error: 'Falta id de conversación.' };

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

    if (auth.user.roleId === 'paciente') {
      accountId = auth.user.id;
      const db0 = await this.mongo.db();
      const account = await db0
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

    const db = await this.mongo.db();
    await db.collection(COL).updateOne(
      { id },
      { $set: doc },
      { upsert: true },
    );
    // Mantener legado sincronizado
    await db
      .collection(LEGACY)
      .updateOne({ id }, { $set: doc }, { upsert: true })
      .catch(() => undefined);

    return { ok: true, conversation: publicRow(doc) };
  }
}
