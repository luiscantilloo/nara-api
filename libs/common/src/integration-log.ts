/**
 * Logs de integraciones externas (TRL / ítem #6).
 * Solo metadatos operativos: servicio, ok, ms, status, modelo.
 * Nunca prompt, cuerpo, API keys ni PII.
 */
export type IntegrationService = 'gemini' | 'openai' | 'n8n' | 'osm';

export type IntegrationLogEvent = {
  service: IntegrationService;
  ok: boolean;
  ms: number;
  /** HTTP status si aplica. */
  status?: number;
  /** Código corto (p. ej. capacity, network, empty). Sin texto libre del proveedor. */
  detail?: string;
  model?: string;
  op?: string;
};

export function logIntegration(event: IntegrationLogEvent): void {
  const line = JSON.stringify({
    kind: 'integration',
    ts: new Date().toISOString(),
    service: event.service,
    ok: event.ok,
    ms: Math.max(0, Math.round(event.ms)),
    ...(event.status != null ? { status: event.status } : {}),
    ...(event.detail ? { detail: String(event.detail).slice(0, 80) } : {}),
    ...(event.model ? { model: String(event.model).slice(0, 80) } : {}),
    ...(event.op ? { op: String(event.op).slice(0, 40) } : {}),
  });
  if (event.ok) console.info(line);
  else console.warn(line);
}

/** Clasifica errores de LLM sin filtrar el mensaje completo al log. */
export function llmErrorDetail(err: unknown): string {
  const e = err as { capacity?: boolean; status?: number; message?: string };
  if (e?.capacity) return 'capacity';
  if (e?.status === 401 || e?.status === 403) return 'auth';
  if (e?.status === 429) return 'rate_limit';
  if (e?.status && e.status >= 500) return 'upstream_5xx';
  const msg = String(e?.message || err || '').toLowerCase();
  if (msg.includes('network') || msg.includes('fetch')) return 'network';
  if (msg.includes('api key') || msg.includes('permission')) return 'auth';
  if (msg.includes('no devolvió') || msg.includes('empty')) return 'empty';
  return 'error';
}
