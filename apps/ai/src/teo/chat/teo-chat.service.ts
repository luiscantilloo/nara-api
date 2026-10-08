import { Injectable } from '@nestjs/common';
import { MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { llmComplete, isLlmConfigured } from '@nara/ai';
import { requireRoles } from '../../shared/require-roles';
import { TEO_VOICE } from '../prompts/teo-voice';

@Injectable()
export class TeoChatService {
  constructor(
    private readonly mongo: MongoStore,
    private readonly sessions: SessionService,
  ) {}

  async chat(data: {
    token: string | null;
    message?: string;
    history?: string;
    patientName?: string;
    place?: string;
    profile?: string;
    age?: number | string;
    messages?: unknown[];
    system?: string;
  }) {
    const auth = await requireRoles(this.sessions, data.token, ['paciente']);
    if ('error' in auth) return auth.error;

    try {
      const message = String(data.message || '').trim();
      if (!message && !Array.isArray(data.messages)) {
        return { ok: false, status: 400, error: 'Escriba un mensaje.' };
      }

      const db = await this.mongo.db();
      const account = await db
        .collection('accounts')
        .findOne({ id: auth.user.id });
      const patientId = account?.patientId
        ? String(account.patientId)
        : auth.user.id;
      const patient =
        (await db
          .collection('patients')
          .findOne({ accountId: auth.user.id })) ||
        (await db.collection('patients').findOne({ id: patientId })) ||
        null;

      const name = String(
        data.patientName || patient?.name || auth.user.name || 'Paciente',
      );
      const fname = name.split(/\s+/)[0] || 'Paciente';
      const place = String(data.place || patient?.place || 'Quindío').split(
        ',',
      )[0];
      const profile = String(data.profile || patient?.profile || 'P01');
      const age = data.age ?? patient?.age ?? '—';
      const history = String(data.history || '').slice(-2000);
      const patientSnap = patient
        ? JSON.stringify({
            id: patient.id,
            name: patient.name,
            age: patient.age,
            place: patient.place,
            profile: patient.profile,
            status: patient.status,
            modulesEnabled: patient.modulesEnabled,
          })
        : '(sin ficha en Mongo)';

      if (!isLlmConfigured()) {
        return { ok: true, status: 200, fallback: true, text: '' };
      }

      const system = `${TEO_VOICE}

También: si la persona pregunta algo fuera de NARA, su ruta, su ánimo o su acompañamiento, diga con amabilidad que solo puede ayudar con el programa NARA.
Use la ficha del paciente de la base; no invente datos clínicos.`;

      const prompt = `Hablas con ${name}, ${age} años, de ${place}. Perfil ${profile}.
Ficha (Mongo): ${patientSnap}
Puedes ofrecer la respiración 4-6, anotar un tema para la sesión o un recurso de Mi ruta.
Si solo saluda (hola, buenas), responde el saludo y pregunta cómo se siente, sin decir «gracias por contármelo».

Historial reciente:
${history || '(inicio de conversación)'}

${fname}: ${message}
TEO:`;

      const { text, model, provider } = await llmComplete(prompt, {
        system,
        temperature: 0.55,
        maxTokens: 400,
      });
      return { ok: true, status: 200, text: text.trim(), model, provider };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error en TEO';
      return {
        ok: true,
        status: 200,
        fallback: true,
        text: '',
        error: message,
      };
    }
  }
}
