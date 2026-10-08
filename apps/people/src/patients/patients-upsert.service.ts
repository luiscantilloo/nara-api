import { Injectable } from '@nestjs/common';
import { normalizeModuleIds } from '@nara/common';
import { MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { requireRoles } from '../shared/require-roles';
import { publicPatient } from '../shared/mappers/patient.mapper';

@Injectable()
export class PatientsUpsertService {
  constructor(
    private readonly mongo: MongoStore,
    private readonly sessions: SessionService,
  ) {}

  async upsert(data: { token: string | null; body: Record<string, unknown> }) {
    const auth = await requireRoles(this.sessions, data.token, [
      'admin',
      'experto',
      'clinico',
    ]);
    if ('error' in auth) return auth.error;

    const body = data.body || {};
    const id = String(body.id || '').trim();
    const name = String(body.name || '').trim();
    if (!id || !name)
      return { ok: false, status: 400, error: 'id y name son obligatorios.' };
    const now = new Date();
    const modulesEnabled = normalizeModuleIds(body.modulesEnabled);
    const modulesVisible = normalizeModuleIds(
      body.modulesVisible ?? modulesEnabled,
    ).filter((m) => modulesEnabled.includes(m));
    const doc = {
      id,
      name,
      email: String(body.email || '')
        .trim()
        .toLowerCase(),
      age: Number(body.age) || 0,
      place: String(body.place || ''),
      terr: String(body.terr || body.place || ''),
      departamento: String(body.departamento || ''),
      municipio: String(body.municipio || ''),
      profile:
        body.profile && /^P\d+$/i.test(String(body.profile))
          ? String(body.profile)
          : null,
      phone: String(body.phone || ''),
      sexo: String(body.sexo || ''),
      genero: String(body.genero || ''),
      estadoCivil: String(body.estadoCivil || ''),
      estrato: String(body.estrato || ''),
      phq: Array.isArray(body.phq) ? body.phq : [],
      phqDates: Array.isArray(body.phqDates) ? body.phqDates : ['Hoy'],
      expert: String(body.expert || ''),
      clin: body.clin || null,
      next: String(body.next || 'Primera llamada dentro de 7 días'),
      nextShort: String(body.nextShort || 'Primera llamada'),
      consent: body.consent !== false,
      signal: String(body.signal || 'Nueva'),
      summary: body.summary || null,
      adherence: body.adherence ?? null,
      sleep: body.sleep ?? null,
      braceletStatus: String(body.braceletStatus || ''),
      audios: Number(body.audios) || 0,
      timeline: Array.isArray(body.timeline) ? body.timeline : [],
      ctx: body.ctx || { dano: 0, perdida: 0 },
      modulesEnabled,
      modulesVisible: modulesVisible.length ? modulesVisible : modulesEnabled,
      source: String(body.source || ''),
      accountId: body.accountId || null,
      updatedAt: now,
    };
    const db = await this.mongo.db();
    await db
      .collection('patients')
      .updateOne(
        { id },
        { $set: doc, $setOnInsert: { createdAt: now } },
        { upsert: true },
      );
    return { ok: true, status: 200, patient: publicPatient(doc) };
  }
}
