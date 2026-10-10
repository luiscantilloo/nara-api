import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkLoginIpLimit,
  clearLoginIpFailures,
  recordLoginIpFailure,
} from '../apps/gateway/src/auth/login-ip-limit.ts';

test('IP login: 20 fallos en ventana → 429 con retryAfter', () => {
  const ip = '203.0.113.50';
  clearLoginIpFailures(ip);
  for (let i = 0; i < 20; i++) recordLoginIpFailure(ip);
  const blocked = checkLoginIpLimit(ip);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.ok(blocked.retryAfter >= 1);
    assert.ok(blocked.retryAfter <= 15 * 60);
  }
  clearLoginIpFailures(ip);
  assert.equal(checkLoginIpLimit(ip).ok, true);
});
