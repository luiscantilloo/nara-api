import { Injectable } from '@nestjs/common';
import { MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { geminiComplete, isGeminiConfigured } from '@nara/ai';
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

      if (!isGeminiConfigured()) {
        return { ok: true, status: 200, fallback: true, text: '' };
      }

      const prompt = `${TEO_VOICE}

Hablas con ${name}, ${age} años, de ${place}. Perfil ${profile}.
Puedes ofrecer la respiración 4-6, anotar un tema para la sesión o un recurso de Mi ruta.
Si solo saluda (hola, buenas), responde el saludo y pregunta cómo se siente, sin decir «gracias por contármelo».

Historial reciente:
${history || '(inicio de conversación)'}

${fname}: ${message}
TEO:`;

      const { text, model } = await geminiComplete(prompt, {
        temperature: 0.55,
        maxTokens: 400,
      });
      return { ok: true, status: 200, text: text.trim(), model };
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
