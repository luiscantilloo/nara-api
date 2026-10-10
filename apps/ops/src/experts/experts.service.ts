import { Inject, Injectable } from '@nestjs/common';
import type { DocumentStore } from '@nara/common';
import { DOCUMENT_STORE, MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { requireRoles } from '../shared/require-roles';
import { listCollection } from '../shared/list-collection';

@Injectable()
export class ExpertsService {
  constructor(
    @Inject(DOCUMENT_STORE) private readonly store: DocumentStore,
    private readonly mongo: MongoStore,
    private readonly sessions: SessionService,
  ) {}

  list(token: string | null) {
    return listCollection(
      this.store,
      this.sessions,
      token,
      'experts',
      ['admin', 'experto', 'clinico', 'observador'],
      'experts',
      {
        sort: { name: 1 },
        // H-004: el observador solo ve cuántos expertos hay por territorio, sin nombre ni contacto.
        mapFor: (roleId) =>
          roleId === 'observador'
            ? (r, i) => ({ id: `anon-${i + 1}`, terr: r.terr ?? null, active: r.active !== false })
            : null,
      },
    );
  }

  /** Un experto de campo = un solo territorio (sin «Todos» ni listas). */
  private normalizeSingleTerr(raw: unknown): string | null {
    if (Array.isArray(raw)) {
      const first = raw.map(String).map((s) => s.trim()).filter(Boolean)[0];
      return first || null;
    }
    const s = String(raw || '').trim();
    if (!s || /^todos$/i.test(s)) return null;
    const parts = s
      .split(/\s*[,;/|]\s*|\s+y\s+/i)
      .map((x) => x.trim())
      .filter(Boolean);
    return parts[0] || null;
  }

  async upsert(token: string | null, body: Record<string, unknown>) {
    const auth = await requireRoles(this.sessions, token, ['admin']);
    if ('error' in auth) return auth.error;
    const name = String(body.name || '').trim();
    const phoneDigits = String(body.phone || '').replace(/\D/g, '');
    const terr = this.normalizeSingleTerr(body.terr);
    const dbPreview = await this.mongo.db();
    const settings =
      (await dbPreview.collection('program_settings').findOne({ key: 'app_state' })) ||
      (await dbPreview.collection('program_settings').findOne({ key: 'main' }));
    const goals = (settings?.rules as { goals?: { daily?: number; weekly?: number } } | undefined)
      ?.goals;
    const defaultDaily = Number(goals?.daily) > 0 ? Number(goals?.daily) : 9;
    const defaultWeekly = Number(goals?.weekly) > 0 ? Number(goals?.weekly) : 45;
    const target = Number(body.target) > 0 ? Number(body.target) : defaultDaily;
    if (!name)
      return { ok: false, status: 400, error: 'El nombre es obligatorio.' };
    if (phoneDigits.length < 10 && !body.id)
      return {
        ok: false,
        status: 400,
        error: 'Escriba un celular de 10 dígitos.',
      };
    if (!terr)
      return {
        ok: false,
        status: 400,
        error: 'Seleccione un único territorio (no «Todos»).',
      };

    const db = dbPreview;
    if (!(await db.collection('territories').findOne({ name: terr }))) {
      return {
        ok: false,
        status: 400,
        error: 'Ese territorio no existe en la base de datos.',
      };
    }
    const now = new Date();
    const existing = body.id
      ? await db.collection('experts').findOne({ id: String(body.id) })
      : body.name
        ? await db.collection('experts').findOne({ name })
        : null;

    /** Un solo experto activo por territorio. */
    const occupied = await db.collection('experts').findOne({
      terr,
      active: { $ne: false },
      ...(existing?.id ? { id: { $ne: existing.id } } : {}),
    });
    if (occupied) {
      return {
        ok: false,
        status: 409,
        error:
          'El territorio «' +
          terr +
          '» ya tiene experto asignado (' +
          String(occupied.name || occupied.id) +
          '). Cada territorio solo puede tener uno.',
      };
    }

    if (existing) {
      const prevTerr = String(existing.terr || '');
      const phone =
        phoneDigits.length === 10
          ? `${phoneDigits.slice(0, 3)} ${phoneDigits.slice(3, 6)} ${phoneDigits.slice(6)}`
          : String(body.phone || existing.phone || '');
      const setDoc: Record<string, unknown> = {
        terr,
        updatedAt: now,
      };
      if (name) setDoc.name = name;
      if (phone) setDoc.phone = phone;
      if (body.target != null) setDoc.target = target;
      await db.collection('experts').updateOne({ id: existing.id }, { $set: setDoc });
      if (prevTerr && prevTerr !== terr) {
        await db
          .collection('territories')
          .updateOne(
            { name: prevTerr },
            { $inc: { experts: -1 }, $set: { updatedAt: now } },
          );
        await db
          .collection('territories')
          .updateOne(
            { name: terr },
            { $inc: { experts: 1 }, $set: { updatedAt: now } },
          );
      }
      if (existing.accountId) {
        await db
          .collection('accounts')
          .updateOne(
            { id: existing.accountId },
            { $set: { terr, updatedAt: now } },
          );
      }
      const expert = { ...existing, ...setDoc };
      return { ok: true, status: 200, expert };
    }

    const id = String(body.id || `e${Date.now().toString(36)}`);
    const phone =
      phoneDigits.length === 10
        ? `${phoneDigits.slice(0, 3)} ${phoneDigits.slice(3, 6)} ${phoneDigits.slice(6)}`
        : String(body.phone || '');
    const doc = {
      id,
      name,
      phone,
      terr,
      target,
      weekT: defaultWeekly,
      today: 0,
      week: 0,
      training: 'Pendiente',
      active: true,
      isNew: true,
      accountId: null as string | null,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await db.collection('experts').insertOne(doc);
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        return {
          ok: false,
          status: 409,
          error:
            'El territorio «' +
            terr +
            '» ya tiene un experto. Cada territorio solo puede tener uno.',
        };
      }
      throw err;
    }
    await db
      .collection('territories')
      .updateOne(
        { name: terr },
        { $inc: { experts: 1 }, $set: { updatedAt: now } },
      );
    return { ok: true, status: 201, expert: doc };
  }

  /**
   * Metas de captación del equipo: diaria y semanal para todos los expertos.
   * Persiste en program_settings (rules.goals) y actualiza experts.target.
   */
  async setGoals(token: string | null, body: Record<string, unknown>) {
    const auth = await requireRoles(this.sessions, token, ['admin']);
    if ('error' in auth) return auth.error;

    const dailyRaw = Number(body.daily);
    const weeklyRaw = Number(body.weekly);
    if (!Number.isFinite(dailyRaw) || !Number.isFinite(weeklyRaw) || dailyRaw < 1 || weeklyRaw < 1) {
      return {
        ok: false,
        status: 400,
        error: 'Indique metas diarias y semanales válidas (mínimo 1).',
      };
    }
    const daily = Math.min(50, Math.max(1, Math.round(dailyRaw)));
    const weekly = Math.min(200, Math.max(1, Math.round(weeklyRaw)));
    if (weekly < daily) {
      return {
        ok: false,
        status: 400,
        error: 'La meta semanal no puede ser menor que la diaria.',
      };
    }

    const now = new Date();
    const goals = { daily, weekly };
    const db = await this.mongo.db();

    const bulk = await db
      .collection('experts')
      .updateMany({}, { $set: { target: daily, weekT: weekly, updatedAt: now } });

    for (const key of ['app_state', 'main'] as const) {
      const doc = await db.collection('program_settings').findOne({ key });
      const prevRules =
        doc?.rules && typeof doc.rules === 'object' && !Array.isArray(doc.rules)
          ? (doc.rules as Record<string, unknown>)
          : {};
      await db.collection('program_settings').updateOne(
        { key },
        {
          $set: {
            rules: { ...prevRules, goals },
            updatedAt: now,
          },
          $setOnInsert: { key, createdAt: now },
        },
        { upsert: true },
      );
    }

    return {
      ok: true,
      status: 200,
      goals,
      updatedExperts: bulk.modifiedCount,
    };
  }
}
