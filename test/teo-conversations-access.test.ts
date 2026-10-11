// S-2 / 6.11: matriz de acceso a conversaciones TEO. Corren con `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import type { Db } from 'mongodb';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@nara/common') {
      return nextResolve(
        pathToFileURL(
          path.resolve('libs/common/src/scope.ts'),
        ).href,
        context,
      );
    }
    return nextResolve(specifier, context);
  },
});

const {
  canWriteConversation,
  conversationsByKeysFilter,
  patientOwnConversationsFilter,
  resolveConversationsListScope,
  resolveScopedPatient,
  territoryPersonKeys,
} = await import(
  '../apps/ai/src/teo/conversations/teo-conversations.access.ts'
);

const admin = { id: 'a1', roleId: 'admin', terr: 'Todos' };
const experto = { id: 'e1', roleId: 'experto', terr: 'Bucaramanga' };
const clinico = { id: 'c1', roleId: 'clinico', terr: 'Bucaramanga' };
const paciente = { id: 'acc-p1', roleId: 'paciente', patientId: 'sm-1' };
const observador = { id: 'o1', roleId: 'observador', terr: 'Bucaramanga' };

const peopleBuc = [
  { id: 'sm-1', accountId: 'acc-p1', code: 'P-001', terr: 'Bucaramanga', name: 'Ana Buc' },
  { id: 'sm-2', accountId: 'acc-p2', code: 'P-002', terr: 'Bucaramanga', name: 'Luis Buc' },
];
const peopleCali = [
  { id: 'sm-9', accountId: 'acc-p9', code: 'P-009', terr: 'Cali', name: 'Ana Cali' },
];

function mockDb(rows: { patients?: typeof peopleBuc; people?: typeof peopleBuc }) {
  const patients = rows.patients || [];
  const people = rows.people || [];
  const match = (col: typeof patients, q: Record<string, unknown>) => {
    const terr = q.terr as string | undefined;
    const and = q.$and as Record<string, unknown>[] | undefined;
    const terrFromAnd = and?.find((x) => 'terr' in x)?.terr as string | undefined;
    const t = terr ?? terrFromAnd;
    let list = t ? col.filter((r) => r.terr === t) : [...col];
    const orBlock = (and?.find((x) => x.$or) as { $or: Record<string, string>[] } | undefined)
      ?.$or;
    if (orBlock) {
      list = list.filter((r) =>
        orBlock.some(
          (c) =>
            (c.id && c.id === r.id) ||
            (c.accountId && c.accountId === r.accountId) ||
            (c.code && c.code === r.code),
        ),
      );
    }
    if (q.id) list = list.filter((r) => r.id === q.id);
    if (q.name && typeof q.name === 'object' && q.name !== null && '$regex' in q.name) {
      const rx = new RegExp(
        String((q.name as { $regex: string }).$regex),
        String((q.name as { $options?: string }).$options || ''),
      );
      list = list.filter((r) => rx.test(r.name));
    }
    return list;
  };
  const collection = (name: string) => {
    const col = name === 'patients' ? patients : name === 'people' ? people : [];
    return {
      findOne: async (q: Record<string, unknown>) => match(col, q)[0] || null,
      find: (q: Record<string, unknown>) => ({
        project: () => ({
          limit: () => ({
            toArray: async () => match(col, q),
          }),
        }),
        toArray: async () => match(col, q),
        catch: async () => [],
      }),
    };
  };
  return { collection } as unknown as Db;
}

test('paciente: filtro propio ignora patientId del cliente', async () => {
  const db = mockDb({ patients: [...peopleBuc, ...peopleCali] });
  const scope = await resolveConversationsListScope(db, paciente, {
    patientId: 'sm-9',
    patientName: 'Ana Cali',
  });
  assert.equal(scope.ok, true);
  if (!scope.ok) return;
  assert.deepEqual(scope.filter, patientOwnConversationsFilter(paciente));
  assert.deepEqual(scope.filter, {
    $or: [{ accountId: 'acc-p1' }, { patientId: 'sm-1' }],
  });
});

test('experto/clínico sin patientId: lista por claves del territorio', async () => {
  const db = mockDb({
    patients: [...peopleBuc, ...peopleCali],
    people: [],
  });
  for (const user of [experto, clinico]) {
    const scope = await resolveConversationsListScope(db, user, {});
    assert.equal(scope.ok, true, user.roleId);
    if (!scope.ok) return;
    assert.deepEqual(
      scope.filter,
      conversationsByKeysFilter(['sm-1', 'acc-p1', 'P-001', 'sm-2', 'acc-p2', 'P-002']),
    );
    const keys = await territoryPersonKeys(db, 'Bucaramanga');
    assert.ok(!keys.includes('sm-9'), 'no incluye Cali');
  }
});

test('experto: patientId de otro territorio → 404', async () => {
  const db = mockDb({ patients: [...peopleBuc, ...peopleCali] });
  const scope = await resolveConversationsListScope(db, experto, {
    patientId: 'sm-9',
  });
  assert.equal(scope.ok, false);
  if (scope.ok) return;
  assert.equal(scope.status, 404);
});

test('experto: patientId propio → filtro por keys de esa ficha', async () => {
  const db = mockDb({ patients: [...peopleBuc, ...peopleCali] });
  const scoped = await resolveScopedPatient(db, experto, { patientId: 'sm-1' });
  assert.equal(scoped.ok, true);
  if (!scoped.ok) return;
  assert.ok(scoped.keys.includes('sm-1'));
  assert.ok(scoped.keys.includes('acc-p1'));
  const list = await resolveConversationsListScope(db, experto, {
    patientId: 'sm-1',
  });
  assert.equal(list.ok, true);
  if (!list.ok) return;
  assert.deepEqual(list.filter, conversationsByKeysFilter(scoped.keys));
});

test('admin sin filtro: todas las conversaciones', async () => {
  const db = mockDb({ patients: peopleBuc });
  const scope = await resolveConversationsListScope(db, admin, {});
  assert.equal(scope.ok, true);
  if (!scope.ok) return;
  assert.equal(scope.filter, null);
});

test('observador: sin acceso a listado', async () => {
  const db = mockDb({ patients: peopleBuc });
  const scope = await resolveConversationsListScope(db, observador, {});
  assert.equal(scope.ok, false);
  if (scope.ok) return;
  assert.equal(scope.status, 403);
});

test('escritura: paciente solo la suya; staff solo keys del territorio', () => {
  assert.ok(
    canWriteConversation(paciente, { patientId: 'sm-1', accountId: 'acc-p1' }, [
      'acc-p1',
      'sm-1',
    ]),
  );
  assert.ok(
    !canWriteConversation(paciente, { patientId: 'sm-9', accountId: 'acc-p9' }, [
      'acc-p1',
      'sm-1',
    ]),
  );
  assert.ok(
    canWriteConversation(experto, { patientId: 'sm-1' }, ['sm-1', 'acc-p1']),
  );
  assert.ok(
    !canWriteConversation(experto, { patientId: 'sm-9' }, ['sm-1', 'acc-p1']),
  );
  assert.ok(canWriteConversation(admin, { patientId: 'sm-9' }, []));
});
