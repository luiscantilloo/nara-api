import { Injectable } from '@nestjs/common';
import { MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { llmComplete, isLlmConfigured } from '@nara/ai';
import { requireRoles } from '../../shared/require-roles';
import { buildContext } from '../context/context.builder';

const SYSTEM = `Eres TEO, el asistente de NARA (plataforma de salud mental post-sismo en Colombia).
Habla como un colega del programa: español natural, claro, breve (máx. ~220 palabras), de usted.

Formato de la respuesta (importante):
- Use markdown ligero: **negrita** para cifras y nombres clave, listas con "- " cuando enumere, párrafos cortos separados por una línea en blanco.
- No use títulos con #. No use tablas. No deje asteriscos sueltos.

Reglas de contenido:
1) Interpreta el CONTEXTO DEL PROGRAMA que te pasan: resume, compara y explica. No inventes cifras, nombres ni estados.
2) Si algo no aparece en el contexto, dilo con naturalidad («Eso aún no lo tengo registrado en el programa» o «Por ahora no veo ese detalle»). NUNCA digas «base», «base de datos», «Mongo», «en la base», «figuran en la base» ni jerga técnica similar.
3) Prioriza cifras concretas y una breve interpretación (por qué, qué implica, qué conviene mirar).
4) Saludos y cortesía: responde con naturalidad y ofrece ayuda con NARA. No rechaces un saludo.
5) Si la pregunta es claramente ajena a NARA, responde exactamente:
«Solo puedo ayudar con temas del programa NARA. Reformule su pregunta sobre la plataforma o los datos del programa.»
6) Temas válidos: programa NARA, pacientes, personas captadas, territorios, captación, expertos, rutas, roles, activos, alertas, banderas, informes, TEO.
7) No des diagnósticos clínicos ni cambie rutas. No reveles contraseñas ni secretos.
8) Observadores: solo agregados, nunca datos personales identificables.`;

/** Saludos / presentación — no pasar por el rechazo de tema. */
function greetingReply(question: string): string | null {
  const t = question
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[¡!¿?.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t.length > 48) return null;
  const greeting =
    /^(hola|holi|hey|hi|hello|buenas|buenos dias|buenas tardes|buenas noches|saludos)(\s+(teo|nara))?(\s+(como estas|que tal|que hay))?$/.test(
      t,
    );
  const who =
    /^(quien eres|quien es teo|que eres|que haces|como te llamas|presentate|que puedes hacer)$/.test(
      t,
    );
  const thanks = /^(gracias|muchas gracias|ok gracias|perfecto gracias)$/.test(
    t,
  );
  if (greeting) {
    return '¡Hola! Soy TEO. ¿En qué le puedo ayudar hoy con el programa?';
  }
  if (who) {
    return 'Soy TEO, su asistente en NARA. Puedo orientarle sobre pacientes, captación, territorios, equipos y operaciones. ¿Qué necesita?';
  }
  if (thanks) {
    return 'Con gusto. Cuando quiera, pregunte por pacientes, territorios, equipos o rutas.';
  }
  return null;
}

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
      'paciente',
    ]);
    if ('error' in auth) return auth.error;

    const question = String(data.question || data.text || '').trim();
    if (!question)
      return { ok: false, status: 400, error: 'Escriba una pregunta.' };

    const hello = greetingReply(question);
    if (hello) {
      return { ok: true, status: 200, text: hello, model: 'local', provider: 'teo' };
    }

    if (!isLlmConfigured()) {
      return {
        ok: true,
        status: 200,
        fallback: true,
        text: 'TEO aún no está configurado. Agregue OPENAI_API_KEY (o GEMINI_API_KEY) en nara-api/.env y reinicie el servicio ai.',
      };
    }

    try {
      const context = await buildContext(
        this.mongo,
        auth.user.roleId,
        question,
        auth.user.id,
      );
      const prompt = `CONTEXTO DEL PROGRAMA (use solo esto; no mencione que viene de un sistema técnico):
${context}

PREGUNTA (${auth.user.role || auth.user.roleId}):
${question}

Responda como TEO, interpretando el contexto. Sin jerga técnica:`;
      const { text, model, provider } = await llmComplete(prompt, {
        system: SYSTEM,
        temperature: 0.35,
        maxTokens: 1800,
      });
      const clean = text
        .replace(/\b(en la base( de datos)?|en la base de datos|MongoDB|Mongo)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([.,;:])/g, '$1')
        .trim();
      return { ok: true, status: 200, text: clean || text, model, provider };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error en TEO';
      return {
        ok: true,
        status: 200,
        fallback: true,
        text: message.includes('saturado')
          ? message
          : `No pude consultar al modelo ahora: ${message}. Intente de nuevo en unos segundos.`,
      };
    }
  }
}
