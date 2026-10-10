import { Injectable } from '@nestjs/common';
import {
  APP_STATE_KEY,
  APP_STATE_SLICES,
  mergeAppStateById,
  mergePathOverrides,
  mergePathRequests,
  mergeRulesSlice,
  pickAppStateSlices,
} from '@nara/common';
import { MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { requireRoles } from '../shared/require-roles';
import { filtrarLectura, idsDelTerritorio, restringirEscritura } from './app-state.policy';

@Injectable()
export class AppStateService {
  constructor(
    private readonly mongo: MongoStore,
    private readonly sessions: SessionService,
  ) {}

  async get(token: string | null) {
    const auth = await requireRoles(this.sessions, token, [
      'admin',
      'experto',
      'clinico',
      'observador',
      'paciente',
    ]);
    if ('error' in auth) return auth.error;
    const db = await this.mongo.db();
    const doc = await db
      .collection('program_settings')
      .findOne({ key: APP_STATE_KEY });
    const slices = doc ? pickAppStateSlices(doc) : {};
    if (!slices.rules) {
      const main = await db
        .collection('program_settings')
        .findOne({ key: 'main' });
      if (main?.rules) slices.rules = main.rules;
    }
    const ids = ['experto', 'clinico'].includes(auth.user.roleId)
      ? await idsDelTerritorio(db, String(auth.user.terr || ''))
      : null;
    return { ok: true, status: 200, slices: filtrarLectura(slices, auth.user, ids), keys: [...APP_STATE_SLICES] };
  }

  async put(token: string | null, body: Record<string, unknown>) {
    const auth = await requireRoles(this.sessions, token, [
      'admin',
      'experto',
      'clinico',
      'paciente',
    ]);
    if ('error' in auth) return auth.error;
    if (!body.slices || typeof body.slices !== 'object') {
      return { ok: false, status: 400, error: 'slices obligatorio' };
    }
    const db = await this.mongo.db();
    const now = new Date();
    const existing = await db
      .collection('program_settings')
      .findOne({ key: APP_STATE_KEY });
    const ids = ['experto', 'clinico'].includes(auth.user.roleId)
      ? await idsDelTerritorio(db, String(auth.user.terr || ''))
      : null;
    const slices = restringirEscritura(
      pickAppStateSlices(body.slices as Record<string, unknown>),
      existing as Record<string, unknown> | null,
      auth.user,
      ids,
    );
    if (!Object.keys(slices).length) {
      // H-011: si nada de lo enviado le está permitido a este rol, se rechaza en vez de fingir que se guardó.
      return { ok: false, status: 403, error: 'Sin permiso para guardar estos datos.' };
    }

    // Multi-cliente: unir alertas/log/cerradas para que «Estoy en crisis» del
    // paciente no lo pise un persist viejo del clínico (y viceversa al cerrar).
    if (slices.closedToday !== undefined || existing?.closedToday) {
      slices.closedToday = mergeAppStateById(
        existing?.closedToday,
        slices.closedToday,
      );
    }
    if (slices.crisisLog !== undefined || existing?.crisisLog) {
      slices.crisisLog = mergeAppStateById(
        existing?.crisisLog,
        slices.crisisLog,
      );
    }
    if (slices.alerts !== undefined || existing?.alerts) {
      const closedIds = new Set(
        (Array.isArray(slices.closedToday)
          ? slices.closedToday
          : Array.isArray(existing?.closedToday)
            ? existing.closedToday
            : []
        )
          .map((c: { id?: unknown }) => String(c?.id || ''))
          .filter(Boolean),
      );
      slices.alerts = mergeAppStateById(existing?.alerts, slices.alerts).filter(
        (a) => !closedIds.has(String(a.id || '')),
      );
    }

    // Aprobaciones admin→clínico: no pisar con persist vacío de otro rol.
    if (slices.pathRequests !== undefined || existing?.pathRequests) {
      slices.pathRequests = mergePathRequests(
        existing?.pathRequests,
        slices.pathRequests,
      );
    }
    if (slices.pathOverrides !== undefined || existing?.pathOverrides) {
      slices.pathOverrides = mergePathOverrides(
        existing?.pathOverrides,
        slices.pathOverrides,
      );
    }
    if (slices.rules !== undefined || existing?.rules) {
      slices.rules = mergeRulesSlice(existing?.rules, slices.rules);
    }

    await db.collection('program_settings').updateOne(
      { key: APP_STATE_KEY },
      {
        $set: { ...slices, key: APP_STATE_KEY, updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    if (slices.rules && typeof slices.rules === 'object') {
      await db
        .collection('program_settings')
        .updateOne(
          { key: 'main' },
          { $set: { rules: slices.rules, updatedAt: now } },
          { upsert: true },
        );
    }
    return { ok: true, status: 200, saved: Object.keys(slices).length };
  }
}
