// Encabezado x-nara-secret solo si N8N_WEBHOOK_SECRET está definido.
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Copia de la lógica de libs/ai/src/n8n-teo.ts (sin deps Nest) para node --test. */
function n8nTeoHeaders(): Record<string, string> {
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

test('sin secreto no envía x-nara-secret', () => {
  const prev = process.env.N8N_WEBHOOK_SECRET;
  delete process.env.N8N_WEBHOOK_SECRET;
  try {
    const h = n8nTeoHeaders();
    assert.equal(h['x-nara-secret'], undefined);
  } finally {
    if (prev === undefined) delete process.env.N8N_WEBHOOK_SECRET;
    else process.env.N8N_WEBHOOK_SECRET = prev;
  }
});

test('con secreto envía x-nara-secret', () => {
  const prev = process.env.N8N_WEBHOOK_SECRET;
  process.env.N8N_WEBHOOK_SECRET = 'test-secret-not-real';
  try {
    const h = n8nTeoHeaders();
    assert.equal(h['x-nara-secret'], 'test-secret-not-real');
  } finally {
    if (prev === undefined) delete process.env.N8N_WEBHOOK_SECRET;
    else process.env.N8N_WEBHOOK_SECRET = prev;
  }
});
