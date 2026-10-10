// P0 TRL 6.11 / 6.36: contexto TEO del personal filtrado por territorio y sin PII.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAppStateForTeo } from '../apps/ai/src/teo/context/staff-app-state.ts';

const doc = {
  key: 'app_state',
  alerts: [
    {
      id: 'a1',
      status: 'open',
      pid: 'p-salento',
      name: 'Gloria Salento',
      phone: '3001112233',
      email: 'gloria@example.com',
      what: 'Crisis',
      detail: 'Llamar al 3001112233',
    },
    {
      id: 'a2',
      status: 'open',
      pid: 'p-cali',
      name: 'Ana Cali',
      phone: '3009998877',
      email: 'ana@cali.com',
      what: 'Alerta otro territorio',
    },
  ],
  crisisLog: [
    { pid: 'p-salento', name: 'Gloria Salento', phone: '3001112233' },
    { pid: 'p-cali', name: 'Ana Cali', phone: '3009998877' },
  ],
  notes: [
    { pid: 'p-salento', name: 'Gloria Salento', text: 'nota local' },
    { pid: 'p-cali', name: 'Ana Cali', text: 'nota ajena' },
  ],
  visits: [
    { pid: 'p-salento', personName: 'Gloria Salento' },
    { pid: 'p-cali', personName: 'Ana Cali' },
  ],
  referrals: [{ pid: 'p-cali', name: 'Ana Cali' }],
  consents: [{ pid: 'p-salento', name: 'Gloria Salento' }],
  accessLog: [{ email: 'admin@nara.com', action: 'login' }],
  activity: [{ who: 'admin', what: 'x' }],
  agentLog: [{ q: 'hola' }],
  aiLog: [{ q: 'hola' }],
  recursos: {
    people: {
      'p-salento': { course: 'c1' },
      'p-cali': { course: 'c2' },
    },
  },
  personOv: { 'p-salento': { x: 1 }, 'p-cali': { x: 2 } },
  pins: [{ pid: 'p-cali', name: 'Ana Cali' }],
};

const terrSalento = new Set(['p-salento', 'acc-salento']);

test('TEO staff: clínico no ve pids/nombres/tel/correo de otro territorio', () => {
  const parts = summarizeAppStateForTeo(doc, {
    roleId: 'clinico',
    nameHint: null,
    terrIds: terrSalento,
  });
  const text = parts.join('\n');
  assert.ok(text.includes('p-salento') || text.includes('Alertas'), 'incluye territorio propio');
  for (const prohibido of [
    'p-cali',
    'Ana Cali',
    '3009998877',
    'ana@cali.com',
    'Gloria Salento',
    '3001112233',
    'gloria@example.com',
    'admin@nara.com',
  ]) {
    assert.ok(!text.includes(prohibido), `no debe incluir ${prohibido}`);
  }
  assert.ok(!text.includes('Accesos recientes'), 'accessLog solo admin');
  assert.ok(!text.includes('Actividad reciente'), 'activity solo admin');
});

test('TEO staff: experto tampoco recibe logs internos ni PII ajena', () => {
  const parts = summarizeAppStateForTeo(doc, {
    roleId: 'experto',
    nameHint: null,
    terrIds: terrSalento,
    expertKeys: ['exp-1'],
  });
  const text = parts.join('\n');
  assert.ok(!text.includes('p-cali'));
  assert.ok(!text.includes('Ana Cali'));
  assert.ok(!text.includes('Consultas previas a TEO'));
});

test('TEO staff: admin sí ve activity/accessLog pero sin teléfono en alertas', () => {
  const parts = summarizeAppStateForTeo(doc, {
    roleId: 'admin',
    nameHint: null,
    terrIds: null,
  });
  const text = parts.join('\n');
  assert.ok(text.includes('Actividad reciente') || text.includes('Accesos recientes'));
  assert.ok(!text.includes('3001112233'));
  assert.ok(!text.includes('Gloria Salento'));
});
