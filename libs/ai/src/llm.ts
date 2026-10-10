import { geminiComplete, isGeminiConfigured } from './gemini';
import { openaiComplete, isOpenAIConfigured } from './openai';

export type LlmCompleteOpts = {
  temperature?: number;
  maxTokens?: number;
  system?: string;
};

/** Prefiere OpenAI si hay key; si no, Gemini. */
export function isLlmConfigured() {
  return isOpenAIConfigured() || isGeminiConfigured();
}

export async function llmComplete(prompt: string, opts?: LlmCompleteOpts) {
  if (isOpenAIConfigured()) {
    try {
      const r = await openaiComplete(prompt, opts);
      return { ...r, provider: 'openai' as const };
    } catch (err) {
      if (!isGeminiConfigured()) throw err;
      const r = await geminiComplete(prompt, {
        temperature: opts?.temperature,
        maxTokens: opts?.maxTokens,
        system: opts?.system,
      });
      return { ...r, provider: 'gemini' as const };
    }
  }
  if (isGeminiConfigured()) {
    const r = await geminiComplete(prompt, {
      temperature: opts?.temperature,
      maxTokens: opts?.maxTokens,
      system: opts?.system,
    });
    return { ...r, provider: 'gemini' as const };
  }
  throw new Error(
    'Falta OPENAI_API_KEY o GEMINI_API_KEY en el entorno de nara-api.',
  );
}
