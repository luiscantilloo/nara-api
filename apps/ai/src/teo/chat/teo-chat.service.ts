import { Injectable } from '@nestjs/common';
import { MongoStore } from '@nara/database';
import { SessionService } from '@nara/auth-core';
import { llmComplete, isLlmConfigured, callN8nTeo } from '@nara/ai';
import { requireRoles } from '../../shared/require-roles';
import { TEO_VOICE } from '../prompts/teo-voice';
import { crisisCheck, escalarCrisis, esRespuestaCrisis, textoDeCrisis } from './teo-crisis';
import { teoRateLimitError, teoRateLimitOk } from '../rate-limit';
import { redactTextForTeo } from '../context/staff-app-state';

/** H-006 (reporte TRL 2026-10-10): nombres de los servicios de la ruta, para que TEO pueda hablar de ella. */
const SERVICIOS: Record<string, string> = {
  mood: 'registro diario de ánimo',
  ia: 'conversación con TEO',
  cursos: 'curso guiado',
  videos: 'videos',
  tech: 'técnicas de respiración y relajación',
  wa: 'mensajes por WhatsApp',
  call: 'llamadas de seguimiento',
  revisit: 'revisita del experto de campo',
  group: 'sesiones grupales',
  social: 'apoyo social',
  clin: 'atención con el psicólogo',
  bracelet: 'manilla de sueño',
  hist: 'su historial',
};

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
  }) {
    const auth = await requireRoles(this.sessions, data.token, ['paciente']);
    if ('error' in auth) return auth.error;
    if (!teoRateLimitOk(auth.user.id)) return teoRateLimitError(auth.user.id);

    try {
      // Punto 5 · T4/T5: no confiar en patientName/age/place del body; limpiar textos.
      const message = redactTextForTeo(String(data.message || '').trim());
      if (!message && !Array.isArray(data.messages)) {
        return { ok: false, status: 400, error: 'Escriba un mensaje.' };
      }

      const db = await this.mongo.db();
      const account = await db
        .collection('accounts')
        .findOne({ id: auth.user.id });
      const linked = account?.patientId ? String(account.patientId) : '';
      const patient =
        (await db
          .collection('patients')
          .findOne({ accountId: auth.user.id })) ||
        (linked
          ? await db.collection('patients').findOne({ id: linked })
          : null) ||
        null;
      if (!patient && !linked) {
        void this.sessions.logAccess({
          action: 'http_403',
          status: 403,
          accountId: auth.user.id,
          email: auth.user.email,
          path: '/teo/chat#sin-ficha',
        });
        return { ok: false, status: 403, error: 'Sin ficha vinculada' };
      }
      const patientId = String(patient?.id || linked);

      const name = String(patient?.name || auth.user.name || 'Paciente');
      const fname = name.split(/\s+/)[0] || 'Paciente';
      const profile = String(
        data.profile || patient?.profile || 'P01',
      ).slice(0, 8);
      const history = redactTextForTeo(String(data.history || '').slice(-2000));
      const modulos: string[] = Array.isArray(patient?.modulesEnabled)
        ? patient!.modulesEnabled.map(String)
        : [];
      const ruta = modulos.map((m) => SERVICIOS[m]).filter(Boolean);
      // Prompt sin nombre completo / edad / territorio (solo código de perfil y ruta).
      const patientSnap = patient
        ? JSON.stringify({
            code: patient.code || '',
            profile: patient.profile || profile,
            status: patient.status,
            modulesEnabled: patient.modulesEnabled,
          })
        : '(sin ficha en Mongo)';

      // H-001: el servidor escala la crisis con el patientId de la sesión, sin depender del navegador.
      const escalar = async (termino: string) => {
        try {
          const r = await escalarCrisis(db, {
            patientId,
            patient,
            nombre: name,
            dicho: message,
            termino,
          });
          return { ok: true, status: 200, crisis: true, escalada: true, alertId: r.alertId, text: textoDeCrisis(fname, true) };
        } catch {
          return { ok: true, status: 200, crisis: true, escalada: false, text: textoDeCrisis(fname, false) };
        }
      };
      const termino = message ? crisisCheck(message) : null;
      if (termino) return await escalar(termino);

      // Primero n8n (webhook teopaciente); si falla o no responde, LLM local.
      const n8nText = await callN8nTeo({
        message,
        chatInput: message,
        history: history || '',
        profile,
      });
      if (n8nText) {
        if (esRespuestaCrisis(n8nText)) {
          return { ...(await escalar('clasificador IA')), provider: 'n8n' };
        }
        return {
          ok: true,
          status: 200,
          text: n8nText.trim(),
          provider: 'n8n',
        };
      }

      if (!isLlmConfigured()) {
        return {
          ok: false,
          status: 503,
          error: 'TEO no tiene un proveedor de IA configurado.',
        };
      }

      const system = `${TEO_VOICE}

Temas permitidos: su ruta en NARA y sus servicios, su ánimo, su sueño, las técnicas, los cursos y su acompañamiento. Si pregunta por su ruta, nómbrele los servicios que tiene.
Solo si pregunta algo que no tiene que ver con NARA, diga con amabilidad que solo puede ayudar con el programa NARA.
Use la ficha del paciente de la base; no invente datos clínicos.`;

      const prompt = `Hablas con una persona del programa (perfil ${profile}).
Ficha (Mongo, sin PII): ${patientSnap}
Servicios de su ruta: ${ruta.length ? ruta.join(', ') : '(la ruta todavía no está activa: la activa el clínico después de aprobar la evaluación)'}
Puedes ofrecer la respiración 4-6, anotar un tema para la sesión o un recurso de Mi ruta.
Si solo saluda (hola, buenas), responde el saludo y pregunta cómo se siente, sin decir «gracias por contármelo».

Historial reciente:
${history || '(inicio de conversación)'}

Paciente: ${message}
TEO:`;

      const { text, model, provider } = await llmComplete(prompt, {
        system,
        temperature: 0.55,
        maxTokens: 400,
      });
      if (esRespuestaCrisis(text)) return { ...(await escalar('clasificador IA')), model, provider };
      return { ok: true, status: 200, text: text.trim(), model, provider };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error en TEO';
      return { ok: false, status: 503, error: message };
    }
  }
}
