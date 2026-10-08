import { Injectable } from '@nestjs/common';
import { normalizeModuleIds } from '@nara/common';
import { MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { requireRoles } from '../shared/require-roles';

@Injectable()
export class PatientsModulesService {
  constructor(
    private readonly mongo: MongoStore,
    private readonly sessions: SessionService,
  ) {}

  async modules(data: {
    token: string | null;
    body?: Record<string, unknown>;
    method?: string;
  }) {
    const auth = await requireRoles(this.sessions, data.token, [
      'paciente',
      'admin',
      'clinico',
      'experto',
    ]);
    if ('error' in auth) return auth.error;

    const body = data.body || {};
    const user = auth.user;
    const isStaff = ['admin', 'clinico', 'experto'].includes(user.roleId);
    const db = await this.mongo.db();

    let patient = isStaff
      ? body.patientId
        ? await db.collection('patients').findOne({ id: body.patientId })
        : null
      : (await db.collection('patients').findOne({ accountId: user.id })) ||
        (await db.collection('patients').findOne({ email: user.email })) ||
        (body.patientId
          ? await db.collection('patients').findOne({ id: body.patientId })
          : null);

    if (!patient && isStaff && body.patientId) {
      const person = await db.collection('people').findOne({
        $or: [{ id: body.patientId }, { code: body.patientId }],
      });
      if (person) {
        const now = new Date();
        const id = String(person.id || body.patientId);
        const modulesEnabled = normalizeModuleIds(body.modulesEnabled, []);
        await db.collection('patients').updateOne(
          { id },
          {
            $set: {
              id,
              name: person.name || id,
              age: person.age || 0,
              place: person.place || '',
              terr: person.terr || '',
              phone: person.phone || '',
              email: person.email || '',
              profile:
                person.profile && /^P\d+$/i.test(String(person.profile))
                  ? String(person.profile)
                  : null,
              expert: person.expert || '',
              clin: person.clin || null,
              modulesEnabled,
              modulesVisible: modulesEnabled.slice(),
              signal: person.status || 'Activa',
              ctx: person.ctx || { dano: 0, perdida: 0 },
              phq: [],
              timeline: [],
              updatedAt: now,
            },
            $setOnInsert: { createdAt: now },
          },
          { upsert: true },
        );
        patient = await db.collection('patients').findOne({ id });
      }
    }

    if (!patient)
      return {
        ok: false,
        status: 404,
        error: 'Ficha de paciente no encontrada.',
      };

    if (
      !Array.isArray(body.modulesEnabled) &&
      !Array.isArray(body.modulesVisible)
    ) {
      return {
        ok: true,
        status: 200,
        id: patient.id,
        modulesEnabled: normalizeModuleIds(patient.modulesEnabled),
        modulesVisible: normalizeModuleIds(
          patient.modulesVisible,
          normalizeModuleIds(patient.modulesEnabled),
        ),
      };
    }

    const now = new Date();
    let modulesEnabled = Array.isArray(patient.modulesEnabled)
      ? normalizeModuleIds(patient.modulesEnabled, [])
      : normalizeModuleIds(undefined);
    let modulesVisible = normalizeModuleIds(
      patient.modulesVisible,
      modulesEnabled,
    ).filter((id) => modulesEnabled.includes(id));

    if (isStaff && Array.isArray(body.modulesEnabled)) {
      const prevEnabled = modulesEnabled;
      modulesEnabled = normalizeModuleIds(body.modulesEnabled, []);
      if (!modulesEnabled.length) {
        return {
          ok: false,
          status: 400,
          error: 'Deje al menos un módulo activo en el programa.',
        };
      }
      const newlyOn = modulesEnabled.filter((id) => !prevEnabled.includes(id));
      const keepVisible = modulesVisible.filter((id) =>
        modulesEnabled.includes(id),
      );
      modulesVisible = Array.from(new Set([...keepVisible, ...newlyOn]));
      if (!modulesVisible.length) modulesVisible = modulesEnabled.slice();
    } else if (Array.isArray(body.modulesVisible)) {
      modulesVisible = normalizeModuleIds(body.modulesVisible, []).filter(
        (id) => modulesEnabled.includes(id),
      );
      if (!modulesVisible.length) {
        return {
          ok: false,
          status: 400,
          error: 'Deje visible al menos un módulo habilitado.',
        };
      }
    }

    await db
      .collection('patients')
      .updateOne(
        { id: patient.id },
        { $set: { modulesEnabled, modulesVisible, updatedAt: now } },
      );

    return {
      ok: true,
      status: 200,
      id: patient.id,
      modulesEnabled,
      modulesVisible,
    };
  }
}
