/**
 * Punto 5 · T3 — Prueba adversarial del contexto TEO (ADV-1…ADV-5 + CTRL).
 * Datos 100 % ficticios. Sin BD, red ni OpenAI.
 *
 * Corre: node --test test/teo-staff-adversarial.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAppStateForTeo } from '../apps/ai/src/teo/context/staff-app-state.ts';

const TERR_A = 'terr-A';
const TERR_B = 'terr-B';
const PID_A = 'p-A1';
const PID_B = 'p-B1';
const NAME_A = 'Ana Prueba Uno';
const NAME_B = 'Bruno Prueba Dos';
const EXP_A = 'exp-A';
const EXP_B = 'exp-B';
const CODE_A = 'SAL-1001';

const terrA = new Set([PID_A, 'acc-A1', CODE_A]);

function ctx(
  doc: Record<string, unknown>,
  opts: {
    roleId: string;
    expertKeys?: string[];
    terrIds?: Set<string> | null;
  },
) {
  return summarizeAppStateForTeo(doc, {
    roleId: opts.roleId,
    nameHint: null,
    expertKeys: opts.expertKeys,
    terrIds: opts.terrIds === undefined ? terrA : opts.terrIds,
  }).join('\n');
}

function tieneSecuencia7Digitos(text: string): boolean {
  // Tramos tipo teléfono (dígitos + separadores) con ≥7 dígitos, o 7 dígitos seguidos crudos.
  if (/\d{7,}/.test(text)) return true;
  const chunks = text.match(/[+()\d][\d\s().+-]{4,}\d/g) || [];
  return chunks.some((c) => c.replace(/\D/g, '').length >= 7);
}

test('ADV-1 · alertas de crisis de otro territorio no llegan al clínico', () => {
  const doc = {
    notifs: {
      clin: [
        {
          text: `Nueva alerta de crisis: ${NAME_B}`,
          pid: PID_B,
          terr: TERR_B,
        },
        {
          text: `Nueva alerta de crisis: ${NAME_A}`,
          pid: PID_A,
          code: CODE_A,
          terr: TERR_A,
        },
      ],
    },
    alerts: [
      {
        id: 'a-own',
        status: 'open',
        pid: PID_A,
        code: CODE_A,
        name: NAME_A,
        what: 'Crisis',
      },
    ],
  };
  const text = ctx(doc, { roleId: 'clinico' });
  assert.ok(!text.includes(NAME_B), 'no debe aparecer Bruno Prueba Dos');
  assert.ok(!text.includes(PID_B), 'no debe aparecer p-B1');
});

test('ADV-2 · avisos de expertos no filtran nombres ajenos', () => {
  const doc = {
    notices: {
      [EXP_B]: [{ text: `El experto atendió la alerta de ${NAME_B}` }],
      [EXP_A]: [{ text: `Visita pendiente de ${NAME_A}` }],
    },
    alerts: [
      {
        id: 'a-own',
        status: 'open',
        pid: PID_A,
        code: CODE_A,
        name: NAME_A,
        what: 'ok',
      },
    ],
  };

  const clin = ctx(doc, { roleId: 'clinico' });
  assert.ok(!clin.includes(NAME_B), 'clínico no ve Bruno');
  assert.ok(!/Avisos/.test(clin), 'clínico sin bloque de notices');

  const exp = ctx(doc, {
    roleId: 'experto',
    expertKeys: [EXP_A],
  });
  assert.ok(!exp.includes(NAME_B), 'experto A no ve Bruno');
  assert.ok(
    /Avisos propios/.test(exp) || exp.includes('Visita pendiente'),
    'experto A sí ve avisos propios',
  );
});

test('ADV-3 · teléfonos en cualquier formato y correo se tapan', () => {
  const phones = [
    '+57 310 123 4567',
    '310-123-4567',
    '(606) 745 1234',
    '3101234567',
  ];
  const email = 'ana.prueba@ejemplo.com';
  const doc = {
    alerts: [
      {
        id: 'a-phones',
        status: 'open',
        pid: PID_A,
        code: CODE_A,
        name: NAME_A,
        what: 'Contacto',
        detail: `Llamar ${phones.join(' o ')} o escribir a ${email}`,
      },
    ],
  };
  const text = ctx(doc, { roleId: 'clinico' });
  for (const p of phones) {
    assert.ok(!text.includes(p), `no debe quedar el teléfono ${p}`);
  }
  assert.ok(!text.includes(email), 'no debe quedar el correo');
  assert.ok(text.includes('[tel]'), 'debe aparecer [tel]');
  assert.ok(text.includes('[correo]'), 'debe aparecer [correo]');
  assert.ok(
    !tieneSecuencia7Digitos(text),
    'no debe quedar ninguna secuencia de 7+ dígitos',
  );
});

test('ADV-4 · PII en objetos anidados se tapa', () => {
  const nestedPhone = '+57 311 222 3344';
  const doc = {
    notes: [
      {
        pid: PID_A,
        code: CODE_A,
        name: NAME_A,
        text: 'seguimiento',
        contacto: {
          familiar: {
            nombre: 'Carla Prueba Tres',
            telefono: nestedPhone,
          },
        },
      },
    ],
  };
  const text = ctx(doc, { roleId: 'clinico' });
  assert.ok(!text.includes(nestedPhone), 'teléfono anidado no debe aparecer');
  assert.ok(text.includes('[tel]'), 'debe aparecer [tel] por el anidado');
});

test('ADV-5 · fila sin identificador no se cuela', () => {
  const doc = {
    alerts: [
      {
        status: 'open',
        // sin pid / code / accountId / id
        text: `Dato sin dueño de ${NAME_B}`,
        what: `Dato sin dueño de ${NAME_B}`,
      },
      {
        id: 'a-own',
        status: 'open',
        pid: PID_A,
        code: CODE_A,
        name: NAME_A,
        what: 'Crisis propia',
      },
    ],
  };
  const text = ctx(doc, { roleId: 'clinico' });
  assert.ok(!text.includes(NAME_B), 'fila sin dueño no debe colarse');
});

test('CTRL-1 · clínico de A sí ve datos de su territorio (por código)', () => {
  const doc = {
    alerts: [
      {
        id: 'a-own',
        status: 'open',
        pid: PID_A,
        code: CODE_A,
        name: NAME_A,
        what: 'Crisis',
      },
      {
        id: 'a-other',
        status: 'open',
        pid: PID_B,
        name: NAME_B,
        what: 'Crisis ajena',
      },
    ],
  };
  const text = ctx(doc, { roleId: 'clinico' });
  assert.ok(
    text.includes(PID_A) || text.includes(CODE_A),
    'debe incluir pid o código del territorio propio',
  );
  assert.ok(!text.includes(NAME_B));
});

test('CTRL-2 · experto exp-A sí ve sus propios avisos', () => {
  const own = 'Visita pendiente de seguimiento local';
  const doc = {
    notices: {
      [EXP_A]: [{ text: own }],
      [EXP_B]: [{ text: `El experto atendió la alerta de ${NAME_B}` }],
    },
  };
  const text = ctx(doc, {
    roleId: 'experto',
    expertKeys: [EXP_A],
  });
  assert.ok(text.includes(own) || /Avisos propios/.test(text));
  assert.ok(!text.includes(NAME_B));
});
