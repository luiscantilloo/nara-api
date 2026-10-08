import { Injectable } from '@nestjs/common';
import { MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { geminiComplete, isGeminiConfigured } from '@nara/ai';
import { requireRoles } from '../../shared/require-roles';
import { buildContext } from '../context/context.builder';

@Injectable()
export class TeoAskService {
  constructor(
    private readonly mongo: MongoStore,
    private readonly sessions: SessionService,
  ) {}

  async ask(data: {
    token: string | null;
    question?: string;
    text?: string;
    role?: string;
  }) {
    const auth = await requireRoles(this.sessions, data.token, [
      'admin',
      'experto',
      'clinico',
      'observador',
    ]);
    if ('error' in auth) return auth.error;

    const question = String(data.question || data.text || '').trim();
    if (!question)
      return { ok: false, status: 400, error: 'Escriba una pregunta.' };

    if (!isGeminiConfigured()) {
      return {
        ok: true,
        status: 200,
        fallback: true,
        text: 'TEO con Gemini aún no está configurado. Agregue GEMINI_API_KEY en nara-api/.env. Mientras tanto use las consultas rápidas del panel.',
      };
    }

    try {
      const context = await buildContext(
        this.mongo,
        auth.user.roleId,
        question,
      );
      const prompt = `Eres TEO, el asistente de datos de NARA (salud mental). Responde en español, claro y breve (máx. ~180 palabras).
Usa SOLO el contexto y tu conocimiento general de la app. Si no hay dato suficiente, dilo.
No inventes cifras. No des diagnósticos clínicos. No reveles contraseñas ni hashes.
Para observadores: solo datos agregados, nunca nombres ni contactos.

CONTEXTO:
${context}

PREGUNTA:
${question}`;
      const { text, model } = await geminiComplete(prompt);
      return { ok: true, status: 200, text, model };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error en TEO';
      return {
        ok: true,
        status: 200,
        fallback: true,
        text: message.includes('saturado')
          ? message
          : `No pude consultar a Gemini ahora: ${message}. Intente de nuevo o use las consultas rápidas.`,
      };
    }
  }
}
