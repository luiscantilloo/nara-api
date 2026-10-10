// H-002 (reporte TRL 2026-10-10, SPEC-002): alerta inmediata, territorio con `people` y descartes visibles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idsDelTerritorio, restringirEscritura, type Descarte } from '../apps/ops/src/app-state/app-state.policy.ts';
import { guardarAlerta } from '../apps/ops/src/app-state/alerts.ts';

const experto = { id: 'e1', roleId: 'experto', terr: 'Bucaramanga' };
const paciente = { id: 'p1', roleId: 'paciente', patientId: 'sm-1' };

function baseFalsa() {
  const cols: Record<string, Record<string, any>[]> = {
    program_settings: [{ key: 'app_state', alerts: [], crisisLog: [], notifs: {} }],
    patients: [{ id: 'sm-1', terr: 'Bucaramanga' }, { id: 'sm-9', terr: 'Cali' }],
    people: [{ id: 'sm-1', terr: 'Bucaramanga' }, { id: 'nueva-1', terr: 'Bucaramanga', status: 'Sin evaluación' }],
  };
  const coincide = (d: Record<string, any>, q: Record<string, unknown>) =>
    Object.entries(q).every(([k, v]) => (k === 'alerts.id' ? (d.alerts || []).some((a: any) => a.id === v) : d[k] === v));
  return {
    cols,
    collection: (n: string) => ({
      find: (q: Record<string, unknown>) => ({ toArray: async () => (cols[n] || []).filter((d) => coincide(d, q)) }),
      findOne: async (q: Record<string, unknown>) => (cols[n] || []).find((d) => coincide(d, q)) || null,
      updateOne: async (q: Record<string, unknown>, u: Record<string, any>) => {
        const d = (cols[n] || []).find((x) => coincide(x, q));
        if (!d) return;
        Object.assign(d, u.$set || {});
        for (const [k, v] of Object.entries<any>(u.$push || {})) {
          const [a, b] = k.split('.');
          const arr = b ? ((d[a] = d[a] || {})[b] = d[a][b] || []) : (d[a] = d[a] || []);
          arr.unshift(...v.$each);
        }
      },
    }),
  } as any;
}

test('H-002 FR-001: el territorio incluye a las personas que todavía no son pacientes', async () => {
  const ids = await idsDelTerritorio(baseFalsa(), 'Bucaramanga');
  assert.ok(ids.has('sm-1'));
  assert.ok(ids.has('nueva-1'));
  assert.ok(!ids.has('sm-9'));
});

test('H-002 FR-002: el experto guarda al momento la alerta de la pregunta 9 de una persona nueva (201)', async () => {
  const db = baseFalsa();
  const ids = await idsDelTerritorio(db, 'Bucaramanga');
  const r = await guardarAlerta(db, { pid: 'nueva-1', sev: 'crisis', term: 'PHQ-9 pregunta 9 > 0', name: 'Nueva' }, experto, ids);
  assert.equal(r.status, 201);
  const st = db.cols.program_settings[0];
  assert.equal(st.alerts[0].id, 'a-nueva-1');
  assert.equal(st.crisisLog[0].type, 'created');
  assert.equal(st.notifs.clin.length, 1);
  assert.equal(db.cols.people[1].status, 'Crisis');
  const otra = await guardarAlerta(db, { pid: 'nueva-1', sev: 'crisis' }, experto, ids);
  assert.equal(otra.status, 200, 'la segunda vez no duplica');
  assert.equal(st.alerts.length, 1);
});

test('H-002: alerta fuera del alcance → 403', async () => {
  const db = baseFalsa();
  const ids = await idsDelTerritorio(db, 'Bucaramanga');
  assert.equal((await guardarAlerta(db, { pid: 'sm-9', sev: 'crisis' }, experto, ids)).status, 403);
  assert.equal((await guardarAlerta(db, { pid: 'sm-9', sev: 'crisis' }, paciente, null)).status, 403);
  assert.equal((await guardarAlerta(db, { pid: 'sm-1', sev: 'crisis' }, paciente, null)).status, 201);
  assert.equal((await guardarAlerta(db, { sev: 'crisis' }, paciente, null)).status, 400);
});

test('H-002 FR-003: lo que la política descarta queda en la lista de descartes', () => {
  const ids = new Set(['sm-1']);
  const d: Descarte[] = [];
  const out = restringirEscritura(
    { alerts: [{ id: 'a-sm-1', pid: 'sm-1' }, { id: 'a-sm-9', pid: 'sm-9' }], rules: { v: 1 } },
    { alerts: [] },
    experto,
    ids,
    d,
  );
  assert.deepEqual((out.alerts as any[]).map((a) => a.id), ['a-sm-1']);
  assert.deepEqual(d, [{ apartado: 'alerts', id: 'a-sm-9' }, { apartado: 'rules' }]);
});

test('H-002 FR-003: devolver un registro ajeno que ya estaba igual no cuenta como descarte', () => {
  const d: Descarte[] = [];
  const ajena = { id: 'a-sm-9', pid: 'sm-9' };
  restringirEscritura({ alerts: [ajena] }, { alerts: [ajena] }, experto, new Set(['sm-1']), d);
  assert.deepEqual(d, []);
});
