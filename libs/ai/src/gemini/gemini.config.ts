export const GEMINI_PRIMARY = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export const GEMINI_FALLBACKS = (
  process.env.GEMINI_FALLBACK_MODELS ||
  'gemini-3.5-flash-lite,gemini-3.6-flash,gemini-2.5-flash-lite'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function modelsToTry() {
  return Array.from(new Set([GEMINI_PRIMARY, ...GEMINI_FALLBACKS]));
}

export function isGeminiConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

export type GeminiCompleteOpts = {
  temperature?: number;
  maxTokens?: number;
};
