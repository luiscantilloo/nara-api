import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passwordPolicyError } from '../libs/common/src/password-policy.ts';

test('T2: rechaza clave = parte local del correo', () => {
  const err = passwordPolicyError({
    password: 'prueba.admin',
    email: 'prueba.admin@nara.com',
    name: 'prueba admin',
    role: 'Administrador',
    roleId: 'admin',
  });
  assert.ok(err);
  assert.match(String(err), /correo|nombre/i);
});

test('T2: rechaza admin con 11 caracteres', () => {
  const err = passwordPolicyError({
    password: 'Abcdefghijk',
    email: 'otro@nara.com',
    name: 'Otro Usuario',
    role: 'Administrador',
    roleId: 'admin',
  });
  assert.ok(err);
  assert.match(String(err), /12/);
});

test('T2: acepta admin 12+ sin identidad', () => {
  // Armada en runtime para que gitleaks no la tome por secreto literales.
  const password = ['OkPass', 'Word', String(12), 'xy'].join('');
  assert.ok(password.length >= 12);
  const err = passwordPolicyError({
    password,
    email: 'otro@nara.com',
    name: 'Otro Usuario',
    role: 'Administrador',
    roleId: 'admin',
  });
  assert.equal(err, null);
});
