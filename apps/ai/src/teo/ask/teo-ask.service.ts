import { Injectable } from '@nestjs/common';
import { MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { llmComplete, isLlmConfigured } from '@nara/ai';
import { requireRoles } from '../../shared/require-roles';
import { buildContext } from '../context/context.builder';
import { TEO_RATE_LIMIT_ERROR, teoRateLimitOk } from '../rate-limit';

const SYSTEM = `Eres TEO, el asistente de NARA (salud mental post-sismo en Colombia).
Hablas como un colega del programa: español natural, claro, de usted, tono cercano y profesional.

Cómo responder:
- Interpreta la pregunta con sentido común. Puede ser sobre cualquier tema de NARA: captación, personas, pacientes, estados (Activo, Inactivo, Crisis, Por aprobar…), territorios, expertos, rutas, aprobaciones, crisis, PHQ, sueño, notas, visitas, remisiones, consentimientos, revisitas, colas de campo, calidad de visitas, activos, usuarios, inactividad, informes, recursos/cursos o cómo funciona la plataforma.
- Usa SOLO el CONTEXTO DEL PROGRAMA que te pasan (incluye fichas clínicas y estado operativo cuando aplique). Resume, compara y explica. No inventes cifras, nombres ni estados.
- Habla con naturalidad: frases cortas, párrafos breves, listas con "- " si enumera. Use **negrita** para cifras y nombres clave. Sin títulos con # ni tablas.
- Nunca diga «base de datos», «Mongo», «API», «colección», «en la base», «query» ni jerga técnica. Digas «en el programa», «registrado», «hoy veo», «según los datos del programa».
- Si falta un dato: «Eso aún no lo tengo registrado en el programa» o «Por ahora no veo ese detalle». Ofrezca otra forma de preguntar.
- Priorice cifras concretas y una breve interpretación (qué implica, qué conviene mirar).
- Saludos y cortesía: responda con naturalidad y ofrezca ayuda con NARA.
- Si la pregunta es claramente ajena a NARA, responda exactamente:
«Solo puedo ayudar con temas del programa NARA. Reformule su pregunta sobre la plataforma o los datos del programa.»
- No dé diagnósticos clínicos ni cambie rutas. No revele contraseñas ni secretos.
- Observadores: solo agregados, nunca datos personales identificables.
- Extensión: lo necesario para ser útil (hasta ~320 palabras). Si pide un resumen corto, sea breve.`;

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
  if (!t || t.length > 56) return null;
  const greeting =
    /^(hola|holi|hey|hi|hello|buenas|buenos dias|buenas tardes|buenas noches|saludos)(\s+(teo|nara))?(\s+(como estas|que tal|que hay))?$/.test(
      t,
    );
  const who =
    /^(quien eres|quien es teo|que eres|que haces|como te llamas|presentate|que puedes hacer|en que me puedes ayudar)$/.test(
      t,
    );
  const thanks = /^(gracias|muchas gracias|ok gracias|perfecto gracias)$/.test(
    t,
  );
  if (greeting) {
    return '¡Hola! Soy TEO. Pregúnteme por captación, personas, rutas, territorios, crisis o lo que necesite del programa.';
  }
  if (who) {
    return 'Soy TEO, su asistente en NARA. Puedo orientarle con los datos del programa: personas, pacientes, territorios, equipos, rutas, crisis y operaciones. ¿Qué necesita?';
  }
  if (thanks) {
    return 'Con gusto. Cuando quiera, pregunte otra vez.';
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
    if (!teoRateLimitOk(auth.user.id)) return TEO_RATE_LIMIT_ERROR;

    const question = String(data.question || data.text || '').trim();
    if (!question)
      return { ok: false, status: 400, error: 'Escriba una pregunta.' };

    const hello = greetingReply(question);
    if (hello) {
      return { ok: true, status: 200, text: hello, model: 'local', provider: 'teo' };
    }

    if (!isLlmConfigured()) {
      return {
        ok: false,
        status: 503,
        error:
          'TEO aún no está configurado. Agregue OPENAI_API_KEY (o GEMINI_API_KEY) en nara-api/.env y reinicie el servicio ai.',
      };
    }

    try {
      const context = await buildContext(
        this.mongo,
        auth.user.roleId,
        question,
        auth.user.id,
      );
      const prompt = `CONTEXTO DEL PROGRAMA (use solo esto; no mencione sistemas técnicos):
${context}

PREGUNTA de ${auth.user.role || auth.user.roleId}:
${question}

Responda como TEO: natural, coherente, con los datos del contexto. Sin jerga técnica:`;
      const { text, model, provider } = await llmComplete(prompt, {
        system: SYSTEM,
        temperature: 0.4,
        maxTokens: 2200,
      });
      const clean = text
        .replace(
          /\b(en la base( de datos)?|en la base de datos|MongoDB|Mongo|API|colección|query)\b/gi,
          '',
        )
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([.,;:])/g, '$1')
        .trim();
      return { ok: true, status: 200, text: clean || text, model, provider };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error en TEO';
      return {
        ok: false,
        status: 503,
        error: message.includes('saturado')
          ? message
          : `No pude consultar al modelo ahora: ${message}. Intente de nuevo en unos segundos.`,
      };
    }
  }
}
