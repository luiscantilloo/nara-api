import { logIntegration } from '@nara/common';

/** URL del webhook TEO paciente (n8n). Override con N8N_TEO_WEBHOOK. */
const DEFAULT_TEO_N8N =
  'https://polariatech.app.n8n.cloud/webhook/teopaciente';

export type N8nTeoPayload = {
  message: string;
  chatInput: string;
  history: string;
  profile: string;
};

/** Si N8N_WEBHOOK_SECRET está vacío o ausente, no incluye x-nara-secret. */
export function n8nTeoHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const secret = String(process.env.N8N_WEBHOOK_SECRET || '').trim();
  if (secret) {
    headers['x-nara-secret'] = secret;
  }
  return headers;
}

function readN8nRespuesta(raw: string): string {
  try {
    const data = JSON.parse(raw) as
      | Record<string, unknown>
      | Array<Record<string, unknown>>;
    const obj = Array.isArray(data) ? data[0] : data;
    return String(
      obj?.respuesta || obj?.text || obj?.output || obj?.message || '',
    ).trim();
  } catch {
    return raw.trim();
  }
}

/**
 * Llama al webhook n8n de TEO paciente.
 * Si N8N_WEBHOOK_SECRET está definido, envía x-nara-secret; si no, no lo envía y no falla.
 */
export async function callN8nTeo(
  payload: N8nTeoPayload,
): Promise<string | null> {
  const url = String(process.env.N8N_TEO_WEBHOOK || DEFAULT_TEO_N8N).trim();
  if (!url) return null;

  const headers = n8nTeoHeaders();

  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(55_000),
    });
    const raw = await res.text();
    if (res.ok) {
      const reply = readN8nRespuesta(raw);
      if (reply) {
        logIntegration({
          service: 'n8n',
          ok: true,
          ms: Date.now() - started,
          status: res.status,
          op: 'teopaciente',
        });
        return reply;
      }
      logIntegration({
        service: 'n8n',
        ok: false,
        ms: Date.now() - started,
        status: res.status,
        detail: 'empty',
        op: 'teopaciente',
      });
      return null;
    }
    logIntegration({
      service: 'n8n',
      ok: false,
      ms: Date.now() - started,
      status: res.status,
      detail: res.status >= 500 ? 'upstream_5xx' : 'http_error',
      op: 'teopaciente',
    });
    return null;
  } catch {
    logIntegration({
      service: 'n8n',
      ok: false,
      ms: Date.now() - started,
      detail: 'network',
      op: 'teopaciente',
    });
    return null;
  }
}
