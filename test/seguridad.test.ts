// Pruebas de las reglas de acceso de nara-api — SPEC-10 FR-10.2. Corren con `node --test` (Node 24 ejecuta TypeScript).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { andScope, inScope, terrFilter } from '../libs/common/src/scope.ts';
import { filtrarLectura, restringirEscritura } from '../apps/ops/src/app-state/app-state.policy.ts';
import { signSessionToken, verifySessionToken } from '../libs/auth-core/src/session-token.ts';

const admin = { id: 'a', roleId: 'admin', terr: 'Todos' };
const experto = { id: 'e1', roleId: 'experto', terr: 'Bucaramanga' };
const clinico = { id: 'c1', roleId: 'clinico', terr: 'Bucaramanga' };
const observador = { id: 'o1', roleId: 'observador', terr: 'Bucaramanga' };
const paciente = { id: 'p1', roleId: 'paciente', patientId: 'sm-1' };

test('alcance: admin todo, experto y clínico su territorio, otros nada', () => {
  assert.deepEqual(terrFilter(admin), {});
  assert.deepEqual(terrFilter(experto), { terr: 'Bucaramanga' });
  assert.deepEqual(terrFilter(clinico), { terr: 'Bucaramanga' });
  assert.equal(terrFilter(observador), null);
  assert.equal(terrFilter(paciente), null);
  assert.equal(terrFilter({ id: 'x', roleId: 'experto', terr: '' }), null);
});

test('alcance: el filtro del cliente solo reduce', () => {
  assert.deepEqual(andScope({ terr: 'Bucaramanga' }, { terr: 'Cali' }), { $and: [{ terr: 'Bucaramanga' }, { terr: 'Cali' }] });
  assert.ok(inScope(experto, { terr: 'Bucaramanga' }));
  assert.ok(!inScope(experto, { terr: 'Cali' }));
});

const slices = {
  rules: { v: 2 }, notes: [{ pid: 'sm-1' }, { pid: 'sm-9' }], alerts: [{ id: 'a-sm-1', pid: 'sm-1' }, { id: 'a-sm-9', pid: 'sm-9' }],
  accessLog: { x: [] }, consents: [{ personId: 'sm-1' }], notifs: { p1: ['hola'], otro: ['no'] },
};
const idsBuc = new Set(['sm-1']);

test('app-state lectura: paciente solo lo suyo, observador sin datos de personas', () => {
  const p = filtrarLectura(slices, paciente, null);
  assert.ok(!('notes' in p) && !('consents' in p) && !('accessLog' in p));
  assert.deepEqual(p.alerts, [{ id: 'a-sm-1', pid: 'sm-1' }]);
  assert.deepEqual(p.notifs, { p1: ['hola'] });
  const o = filtrarLectura(slices, observador, null);
  assert.deepEqual(Object.keys(o), ['rules']);
});

test('app-state lectura: experto solo registros de su territorio y sin registros internos', () => {
  const e = filtrarLectura(slices, experto, idsBuc);
  assert.deepEqual(e.notes, [{ pid: 'sm-1' }]);
  assert.ok(!('accessLog' in e));
});

test('app-state escritura: paciente no escribe reglas ni notas; experto no borra otros territorios', () => {
  const p = restringirEscritura({ rules: { v: 9 }, notes: [], alerts: [{ id: 'a-sm-1', pid: 'sm-1' }, { id: 'a-sm-9', pid: 'sm-9' }] }, slices, paciente, null);
  assert.deepEqual(Object.keys(p), ['alerts']);
  assert.deepEqual(p.alerts, [{ id: 'a-sm-1', pid: 'sm-1' }]);
  const e = restringirEscritura({ rules: { v: 9 }, notes: [{ pid: 'sm-1', t: 'nueva' }] }, slices, experto, idsBuc);
  assert.ok(!('rules' in e));
  assert.deepEqual(e.notes, [{ pid: 'sm-9' }, { pid: 'sm-1', t: 'nueva' }]);
});

test('sesión: token firmado, vencido o manipulado', () => {
  process.env.AUTH_SECRET = 'secreto-de-prueba-largo';
  const t = signSessionToken('u-1');
  assert.equal(verifySessionToken(t), 'u-1');
  assert.equal(verifySessionToken(t.replace('u-1', 'u-2')), null);
  assert.equal(verifySessionToken(signSessionToken('u-1', -10)), null);
  assert.equal(verifySessionToken('basura'), null);
});
