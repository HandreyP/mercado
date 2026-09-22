import assert from 'node:assert/strict';
import test from 'node:test';

import { DatabaseRepository } from '../src/repositories/database.repository.js';

function fakeConnection({ lockAcquired = true } = {}) {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      if (String(sql).includes('pg_try_advisory_lock')) {
        return { rows: [{ acquired: lockAcquired }] };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      calls.push({ sql: 'RELEASE' });
    },
  };
  const pool = {
    async connect() {
      calls.push({ sql: 'CONNECT' });
      return client;
    },
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      return { rows: [{ ok: true }] };
    },
    async end() {
      calls.push({ sql: 'END' });
    },
  };
  return { calls, client, pool };
}

test('delega consultas simples e encerra o pool', async () => {
  const connection = fakeConnection();
  const repository = new DatabaseRepository({ pool: connection.pool });

  const result = await repository.query('SELECT $1::int AS value', [1]);
  await repository.close();

  assert.deepEqual(result.rows, [{ ok: true }]);
  assert.deepEqual(connection.calls, [
    { sql: 'SELECT $1::int AS value', parameters: [1] },
    { sql: 'END' },
  ]);
});

test('confirma uma transação bem-sucedida e liberta a ligação', async () => {
  const connection = fakeConnection();
  const repository = new DatabaseRepository({ pool: connection.pool });

  const value = await repository.withTransaction(async (client) => {
    await client.query('INSERT TEST');
    return 42;
  });

  assert.equal(value, 42);
  assert.deepEqual(connection.calls.map(({ sql }) => sql), [
    'CONNECT',
    'BEGIN',
    'INSERT TEST',
    'COMMIT',
    'RELEASE',
  ]);
});

test('faz rollback quando a operação transacional falha', async () => {
  const connection = fakeConnection();
  const repository = new DatabaseRepository({ pool: connection.pool });

  await assert.rejects(
    repository.withTransaction(async () => {
      throw new Error('falha esperada');
    }),
    /falha esperada/,
  );
  assert.deepEqual(connection.calls.map(({ sql }) => sql), [
    'CONNECT',
    'BEGIN',
    'ROLLBACK',
    'RELEASE',
  ]);
});

test('impede locks concorrentes e liberta sempre a ligação', async () => {
  const connection = fakeConnection({ lockAcquired: false });
  const repository = new DatabaseRepository({ pool: connection.pool });

  await assert.rejects(
    repository.withAdvisoryLock('mercado-sync:pingo-doce', async () => {}),
    (error) => error.code === 'SYNC_ALREADY_RUNNING',
  );
  assert.deepEqual(connection.calls.map(({ sql }) => sql), [
    'CONNECT',
    'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
    'RELEASE',
  ]);
});

test('liberta advisory lock mesmo quando a operação falha', async () => {
  const connection = fakeConnection();
  const repository = new DatabaseRepository({ pool: connection.pool });

  await assert.rejects(
    repository.withAdvisoryLock('mercado-sync:pingo-doce', async () => {
      throw new Error('falha dentro do lock');
    }),
    /falha dentro do lock/,
  );
  assert.deepEqual(connection.calls.map(({ sql }) => sql), [
    'CONNECT',
    'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
    'SELECT pg_advisory_unlock(hashtext($1))',
    'RELEASE',
  ]);
});
