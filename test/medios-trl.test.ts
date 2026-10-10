// Medios del reporte TRL 2026-10-10: H-007 (validación del alta) y H-009 (clínico del territorio).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorFechaNacimiento, errorTelefono } from '../libs/common/src/validar-persona.ts';
import { clinicoDelTerritorio } from '../libs/common/src/clinico.ts';

const hoy = new Date(Date.UTC(2026, 9, 10));

test('H-007: fecha de nacimiento futura, inválida o fuera de 18–110 años → error', () => {
  assert.match(String(errorFechaNacimiento('2099-01-01', hoy)), /futura/);
  assert.match(String(errorFechaNacimiento('1980-02-31', hoy)), /no es válida/);
  assert.match(String(errorFechaNacimiento('2010-01-01', hoy)), /18 y 110/);
  assert.match(String(errorFechaNacimiento('1900-01-01', hoy)), /18 y 110/);
  assert.equal(errorFechaNacimiento('1980-05-01', hoy), null);
  assert.equal(errorFechaNacimiento('', hoy), null, 'vacío lo controla «Faltan datos»');
});

test('H-007: teléfono de 10 dígitos que empieza por 3, o vacío', () => {
  assert.equal(errorTelefono('3001112233'), null);
  assert.equal(errorTelefono('300 111 2233'), null);
  assert.equal(errorTelefono(''), null);
  assert.ok(errorTelefono('abc123'));
  assert.ok(errorTelefono('6012345678'));
  assert.ok(errorTelefono('30011122'));
});

test('H-009: el clínico es la cuenta Clínico activa del territorio, o ninguno', async () => {
  const cuentas = [
    { roleId: 'clinico', terr: 'Bucaramanga', status: 'Activo', name: 'TRL-QA Clinico 1' },
    { roleId: 'clinico', terr: 'Cali', status: 'Inactivo', name: 'Inactivo' },
  ];
  const buscar = async (_c: string, q: Record<string, any>) =>
    cuentas.find((a) => a.roleId === q.roleId && a.terr === q.terr && a.status !== q.status.$ne) || null;
  assert.equal(await clinicoDelTerritorio(buscar, 'Bucaramanga'), 'TRL-QA Clinico 1');
  assert.equal(await clinicoDelTerritorio(buscar, 'Cali'), null);
  assert.equal(await clinicoDelTerritorio(buscar, ''), null);
});
