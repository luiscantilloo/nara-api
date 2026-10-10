// H-003 (reporte TRL 2026-10-10, SPEC-003): `recursos` y `notifs` filtrados por rol y persona.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtrarLectura, restringirEscritura } from '../apps/ops/src/app-state/app-state.policy.ts';

const recursos = {
  rules: [1, 2],
  people: { 'acc-p1': { course: 'dormir', answers: ['mía'] }, 'acc-p2': { course: 'duelo', answers: ['ajena'] }, 'acc-cali': { course: 'x' } },
  assigned: [{ pid: 'acc-p1', id: 'c1' }, { pid: 'acc-cali', id: 'c2' }],
};
const notifs = { clin: [{ id: 'n1' }], e1: [{ id: 'n2' }], e2: [{ id: 'n3' }], c1: [{ id: 'n4' }], admin: [{ id: 'n5' }] };
const slices = { recursos, notifs };

test('H-003 FR-001: el paciente solo recibe su entrada de recursos.people', () => {
  const out = filtrarLectura(slices, { id: 'acc-p1', roleId: 'paciente', patientId: 'sm-1' }, null) as any;
  assert.deepEqual(Object.keys(out.recursos.people), ['acc-p1']);
  assert.deepEqual(out.recursos.assigned.map((a: any) => a.id), ['c1']);
  assert.deepEqual(out.recursos.rules, [1, 2]);
});

test('H-003 FR-002: el observador no recibe people ni assigned', () => {
  const out = filtrarLectura(slices, { id: 'o1', roleId: 'observador' }, null) as any;
  assert.deepEqual(out.recursos.people, {});
  assert.equal(out.recursos.assigned, undefined);
  assert.equal(out.notifs, undefined);
});

test('H-003 FR-003: el clínico ve recursos de su territorio y solo sus avisos', () => {
  const ids = new Set(['acc-p1', 'acc-p2']);
  const out = filtrarLectura(slices, { id: 'c1', roleId: 'clinico', terr: 'Bucaramanga' }, ids) as any;
  assert.deepEqual(Object.keys(out.recursos.people).sort(), ['acc-p1', 'acc-p2']);
  assert.deepEqual(out.recursos.assigned.map((a: any) => a.id), ['c1']);
  assert.deepEqual(Object.keys(out.notifs).sort(), ['c1', 'clin']);
  const exp = filtrarLectura(slices, { id: 'e1', roleId: 'experto', terr: 'Bucaramanga' }, ids) as any;
  assert.deepEqual(Object.keys(exp.notifs), ['e1']);
});

test('H-003: al escribir, el clínico no borra recursos ni avisos que no recibió', () => {
  const ids = new Set(['acc-p1', 'acc-p2']);
  const out = restringirEscritura(
    {
      recursos: { ...recursos, people: { 'acc-p1': { course: 'cambiado' } }, assigned: [{ pid: 'acc-p1', id: 'c9' }] },
      notifs: { clin: [{ id: 'n1', read: true }], e1: [{ id: 'nuevo-para-e1' }] },
    },
    slices,
    { id: 'c1', roleId: 'clinico', terr: 'Bucaramanga' },
    ids,
  ) as any;
  assert.equal(out.recursos.people['acc-cali'].course, 'x', 'conserva otro territorio');
  assert.equal(out.recursos.people['acc-p1'].course, 'cambiado');
  assert.deepEqual(out.recursos.assigned.map((a: any) => a.id).sort(), ['c2', 'c9']);
  assert.deepEqual(out.notifs.e1.map((n: any) => n.id).sort(), ['n2', 'nuevo-para-e1'], 'une por id');
  assert.equal(out.notifs.clin[0].read, true);
  assert.deepEqual(out.notifs.e2, [{ id: 'n3' }], 'no toca avisos ajenos');
});
