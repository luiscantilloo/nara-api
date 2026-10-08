export const OPENAI_PRIMARY = process.env.OPENAI_MODEL || 'gpt-6-luna';

export const OPENAI_FALLBACKS = (
  process.env.OPENAI_FALLBACK_MODELS || 'gpt-4o-mini,gpt-4o'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function openaiModelsToTry() {
  return Array.from(new Set([OPENAI_PRIMARY, ...OPENAI_FALLBACKS]));
}

export function isOpenAIConfigured() {
  return !!process.env.OPENAI_API_KEY;
}

export type OpenAICompleteOpts = {
  temperature?: number;
  maxTokens?: number;
  system?: string;
};
