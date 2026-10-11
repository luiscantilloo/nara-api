// Ítem #6: logs de integración sin PII. Corren con `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  llmErrorDetail,
  logIntegration,
} from '../libs/common/src/integration-log.ts';

test('integration log: JSON con kind/service/ok/ms y sin campos de PII', () => {
  const lines: string[] = [];
  const origInfo = console.info;
  const origWarn = console.warn;
  console.info = (...args: unknown[]) => {
    lines.push(String(args[0]));
  };
  console.warn = (...args: unknown[]) => {
    lines.push(String(args[0]));
  };
  try {
    logIntegration({
      service: 'gemini',
      ok: true,
      ms: 42.7,
      status: 200,
      model: 'gemini-2.5-flash',
      op: 'generateContent',
    });
    logIntegration({
      service: 'n8n',
      ok: false,
      ms: 10,
      detail: 'network',
      op: 'teopaciente',
    });
  } finally {
    console.info = origInfo;
    console.warn = origWarn;
  }
  assert.equal(lines.length, 2);
  const ok = JSON.parse(lines[0]) as Record<string, unknown>;
  const fail = JSON.parse(lines[1]) as Record<string, unknown>;
  assert.equal(ok.kind, 'integration');
  assert.equal(ok.service, 'gemini');
  assert.equal(ok.ok, true);
  assert.equal(ok.ms, 43);
  assert.equal(fail.service, 'n8n');
  assert.equal(fail.ok, false);
  for (const row of [ok, fail]) {
    for (const prohibido of [
      'prompt',
      'message',
      'body',
      'apiKey',
      'Authorization',
      'patientName',
      'history',
    ]) {
      assert.ok(!(prohibido in row), `no debe incluir ${prohibido}`);
    }
  }
});

test('llmErrorDetail: códigos cortos sin filtrar el mensaje', () => {
  assert.equal(llmErrorDetail({ capacity: true, message: 'High demand' }), 'capacity');
  assert.equal(llmErrorDetail({ status: 403, message: 'API key' }), 'auth');
  assert.equal(llmErrorDetail({ status: 429 }), 'rate_limit');
  assert.equal(llmErrorDetail({ message: 'fetch failed' }), 'network');
});
