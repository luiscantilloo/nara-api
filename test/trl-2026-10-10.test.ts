// Pruebas de las correcciones del reporte TRL 2026-10-10 (H-004, H-008, H-016). Corren con `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observerSummary, riskLevel, MIN_GRUPO } from '../apps/people/src/shared/mappers/observer-summary.ts';
import { securityHeaders } from '../apps/gateway/src/security-headers.ts';
import { SESSION_MAX_AGE_SEC, signSessionToken, verifySessionToken } from '../libs/auth-core/src/session-token.ts';

const persona = (terr: string, status: string, profile: string | null) => ({
  id: 'x', name: 'Nombre Real', phone: '300', terr, status, profile, age: 40, evalPhq: 12,
});

test('H-004: el resumen del observador no trae ninguna fila ni dato personal', () => {
  const rows = [
    ...Array.from({ length: 7 }, () => persona('Bucaramanga', 'Activo', 'P04')),
    ...Array.from({ length: 2 }, () => persona('Cali', 'Crisis', 'P14')),
  ];
  const s = observerSummary(rows);
  assert.equal(s.total, 9);
  assert.equal(s.porTerritorio.Bucaramanga, 7);
  const texto = JSON.stringify(s);
  for (const prohibido of ['Nombre Real', '300', 'evalPhq', '"age"', '"id"']) {
    assert.ok(!texto.includes(prohibido), `no debe incluir ${prohibido}`);
  }
  assert.ok(!Object.values(s).some(Array.isArray), 'ningún arreglo por persona');
});

test('H-004: los grupos con menos de MIN_GRUPO personas se suprimen', () => {
  const rows = [
    ...Array.from({ length: MIN_GRUPO }, () => persona('Bucaramanga', 'Activo', 'P01')),
    ...Array.from({ length: MIN_GRUPO - 1 }, () => persona('Cali', 'Activo', 'P01')),
  ];
  const s = observerSummary(rows);
  assert.equal(s.porTerritorio.Bucaramanga, MIN_GRUPO);
  assert.equal(s.porTerritorio.Cali, null);
});

test('H-004: nivel de riesgo desde el perfil', () => {
  assert.equal(riskLevel('P01'), 'Mínimo');
  assert.equal(riskLevel('P07'), 'Moderado');
  assert.equal(riskLevel('P15'), 'Severo');
  assert.equal(riskLevel(null), 'Sin evaluación');
});

test('H-008: la API envía cabeceras de seguridad y HSTS solo por https', () => {
  const run = (secure: boolean) => {
    const h: Record<string, string> = {};
    let siguió = false;
    securityHeaders(
      { secure, headers: {} } as never,
      { setHeader: (k: string, v: string) => { h[k.toLowerCase()] = v; } } as never,
      () => { siguió = true; },
    );
    assert.ok(siguió);
    return h;
  };
  const http = run(false);
  assert.equal(http['x-content-type-options'], 'nosniff');
  assert.equal(http['x-frame-options'], 'DENY');
  assert.ok(http['content-security-policy']);
  assert.ok(!('strict-transport-security' in http));
  assert.ok('strict-transport-security' in run(true));
});

test('H-016: la sesión dura 12 h y el token vence', () => {
  assert.equal(SESSION_MAX_AGE_SEC, 12 * 60 * 60);
  assert.equal(verifySessionToken(signSessionToken('u1')), 'u1');
  assert.equal(verifySessionToken(signSessionToken('u1', -1)), null);
});

import { filtrarLectura, restringirEscritura } from '../apps/ops/src/app-state/app-state.policy.ts';

test('notas y ajustes de ruta (mapa por paciente): solo el territorio propio se lee y se escribe', () => {
  const clinico = { id: 'c1', roleId: 'clinico', terr: 'Bucaramanga' };
  const ids = new Set(['sm-1']);
  const existente = { notes: { 'sm-1': [{ text: 'propia' }], 'sm-9': [{ text: 'ajena' }] } };
  const leido = filtrarLectura(existente, clinico, ids);
  assert.deepEqual(Object.keys(leido.notes as object), ['sm-1']);
  const escrito = restringirEscritura({ notes: { 'sm-1': [{ text: 'nueva' }], 'sm-9': [] } }, existente, clinico, ids);
  assert.deepEqual(escrito.notes, { 'sm-9': [{ text: 'ajena' }], 'sm-1': [{ text: 'nueva' }] });
});

test('P-01: el paciente lee y escribe solo su propio consentimiento', () => {
  const paciente = { id: 'p1', roleId: 'paciente', patientId: 'sm-1' };
  const existente = { consents: { 'sm-1': { datos: true }, 'sm-9': { datos: true } } };
  assert.deepEqual(filtrarLectura(existente, paciente, null).consents, { 'sm-1': { datos: true } });
  const escrito = restringirEscritura({ consents: { 'sm-1': { datos: true, appAt: 1 }, 'sm-9': { datos: false } } }, existente, paciente, null);
  assert.deepEqual(escrito.consents, { 'sm-1': { datos: true, appAt: 1 }, 'sm-9': { datos: true } });
});
