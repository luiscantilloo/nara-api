import {
  openaiModelsToTry,
  type OpenAICompleteOpts,
} from './openai.config';

type OpenAIError = Error & { status?: number; capacity?: boolean };

function isCapacityError(status: number, message: string) {
  const m = message.toLowerCase();
  return (
    status === 429 ||
    status === 503 ||
    m.includes('rate limit') ||
    m.includes('overloaded') ||
    m.includes('high demand') ||
    m.includes('try again later')
  );
}

function usesCompletionTokens(model: string) {
  // Modelos nuevos (p. ej. gpt-6-luna) exigen max_completion_tokens.
  return /gpt-6|o1|o3|o4|luna/i.test(model);
}

async function callModel(
  model: string,
  prompt: string,
  opts?: OpenAICompleteOpts,
) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Falta OPENAI_API_KEY en el entorno.');

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (opts?.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: prompt });

  // gpt-6-luna gasta parte del cupo en reasoning_tokens; dejar margen.
  const max = opts?.maxTokens ?? (usesCompletionTokens(model) ? 1600 : 900);
  const body: Record<string, unknown> = {
    model,
    messages,
  };
  // Algunos modelos nuevos no aceptan temperature personalizada.
  if (!usesCompletionTokens(model)) {
    body.temperature = opts?.temperature ?? 0.35;
    body.max_tokens = max;
  } else {
    body.max_completion_tokens = max;
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!res.ok) {
    const message = data.error?.message || `OpenAI HTTP ${res.status}`;
    const err = new Error(message) as OpenAIError;
    err.status = res.status;
    err.capacity = isCapacityError(res.status, message);
    throw err;
  }

  const text = data.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new Error('OpenAI no devolvió texto.');
  return { text: text.trim(), model };
}

export async function openaiComplete(
  prompt: string,
  opts?: OpenAICompleteOpts,
) {
  const models = openaiModelsToTry();
  let lastErr: OpenAIError | null = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      return await callModel(model, prompt, opts);
    } catch (e) {
      lastErr = e as OpenAIError;
      const msg = String(lastErr.message || '').toLowerCase();
      const modelMissing =
        msg.includes('model') &&
        (msg.includes('does not exist') ||
          msg.includes('not found') ||
          msg.includes('invalid'));
      if (modelMissing || lastErr.capacity) continue;
      if (msg.includes('api key') || msg.includes('incorrect api key')) break;
      // Parámetro incompatible: probar siguiente modelo.
      if (msg.includes('unsupported parameter') || msg.includes('unsupported value'))
        continue;
    }
  }

  throw lastErr || new Error('Error en OpenAI');
}
