import { modelsToTry, type GeminiCompleteOpts } from './gemini.config';
import {
  CAPACITY_MESSAGE,
  asGeminiError,
  isCapacityError,
  type GeminiError,
} from './gemini.errors';

async function callModel(
  model: string,
  prompt: string,
  opts?: GeminiCompleteOpts,
) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Falta GEMINI_API_KEY en el entorno.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts?.temperature ?? 0.4,
      maxOutputTokens: opts?.maxTokens ?? 1024,
    },
  };
  // 6.36: pasar system también en Gemini (antes solo iba a OpenAI).
  if (opts?.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  if (!res.ok) {
    const message = data.error?.message || `Gemini HTTP ${res.status}`;
    const err = new Error(message) as GeminiError;
    err.status = res.status;
    err.capacity = isCapacityError(res.status, message);
    throw err;
  }

  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ||
    '';
  if (!text.trim()) throw new Error('Gemini no devolvió texto.');
  return { text: text.trim(), model };
}

export async function geminiComplete(
  prompt: string,
  opts?: GeminiCompleteOpts,
) {
  const models = modelsToTry();
  let lastErr: GeminiError | null = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      return await callModel(model, prompt, opts);
    } catch (e) {
      lastErr = asGeminiError(e);
      const capacity = !!lastErr.capacity;
      if (capacity && i === models.length - 1) {
        await new Promise((r) => setTimeout(r, 900));
        try {
          return await callModel(model, prompt, opts);
        } catch (e2) {
          lastErr = asGeminiError(e2);
        }
      }
      if (!capacity && i === 0) {
        const msg = lastErr.message.toLowerCase();
        if (
          msg.includes('api key') ||
          msg.includes('permission') ||
          msg.includes('403')
        )
          break;
      }
    }
  }

  const msg = lastErr?.message || 'Error en Gemini';
  if (isCapacityError(0, msg) || lastErr?.capacity) {
    throw new Error(CAPACITY_MESSAGE);
  }
  throw lastErr || new Error(msg);
}
