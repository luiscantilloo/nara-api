export type GeminiError = Error & { status?: number; capacity?: boolean };

export function isCapacityError(status: number, message: string) {
  const m = message.toLowerCase();
  return (
    status === 429 ||
    status === 503 ||
    m.includes('high demand') ||
    m.includes('resource exhausted') ||
    m.includes('try again later') ||
    m.includes('unavailable') ||
    m.includes('overloaded')
  );
}

export function asGeminiError(e: unknown): GeminiError {
  return e instanceof Error ? e : new Error(String(e));
}

export const CAPACITY_MESSAGE =
  'Gemini está saturado ahora mismo (alta demanda). Espere unos segundos y vuelva a preguntar, o use las consultas rápidas del panel.';
