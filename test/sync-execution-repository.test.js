import assert from 'node:assert/strict';
import test from 'node:test';

import { SyncExecutionRepository } from '../src/repositories/sync-execution.repository.js';

function databaseReturning(...results) {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ parameters, sql });
      return results.shift();
    },
  };
  return {
    calls,
    database: {
      async query(sql, parameters) {
        calls.push({ parameters, sql });
        return results.shift();
      },
      async withTransaction(operation) {
        calls.push({ sql: 'WITH_TRANSACTION' });
        return operation(client);
      },
    },
  };
}

test('inicia uma tentativa mesmo antes de existir recolha ou snapshot', async () => {
  const setup = databaseReturning(
    { rows: [{ id: '4' }] },
    { rows: [{ id: '12', started_at: '2026-09-23T03:00:00Z' }] },
  );
  const repository = new SyncExecutionRepository({ database: setup.database });

  const execution = await repository.start({
    attempt: 1,
    batchId: '11111111-1111-4111-8111-111111111111',
    market: { id: 'pingo-doce', name: 'Pingo Doce' },
    trigger: 'cron',
  });

  assert.equal(execution.id, '12');
  assert.equal(setup.calls[0].sql, 'WITH_TRANSACTION');
  assert.match(setup.calls[1].sql, /INSERT INTO markets/);
  assert.match(setup.calls[2].sql, /INSERT INTO sync_executions/);
});

test('conclui e falha tentativas com os detalhes operacionais', async () => {
  const setup = databaseReturning({ rows: [] }, { rows: [] });
  const repository = new SyncExecutionRepository({ database: setup.database });

  await repository.complete('12', {
    result: { collection: { stats: { collected: 20 } }, imported: { products: 20 } },
  });
  const error = new Error('DNS indisponível');
  error.code = 'EAI_AGAIN';
  await repository.fail('13', { error });

  assert.match(setup.calls[0].sql, /status = 'completed'/);
  assert.deepEqual(setup.calls[0].parameters.slice(0, 2), [
    '12',
    JSON.stringify({
      collected: 20,
      importedProducts: 20,
      importedOffers: 0,
      offerChanges: {},
    }),
  ]);
  assert.match(setup.calls[1].sql, /status = 'failed'/);
  assert.deepEqual(setup.calls[1].parameters.slice(0, 3), [
    '13',
    'EAI_AGAIN',
    'DNS indisponível',
  ]);
});

test('mapeia o estado mais recente e a última execução bem-sucedida', async () => {
  const setup = databaseReturning({
    rows: [
      {
        market_id: 'pingo-doce',
        market_name: 'Pingo Doce',
        status: 'failed',
        batch_id: '11111111-1111-4111-8111-111111111111',
        attempt: 3,
        trigger: 'cron',
        started_at: '2026-09-23T03:20:00Z',
        finished_at: '2026-09-23T03:20:05Z',
        error_code: 'EAI_AGAIN',
        error_message: 'DNS indisponível',
        stats: {},
        duration_ms: '5000',
        last_success_at: '2026-09-22T03:06:00Z',
      },
    ],
  });
  const repository = new SyncExecutionRepository({ database: setup.database });

  const result = await repository.listLatest();

  assert.deepEqual(result[0], {
    market: { id: 'pingo-doce', name: 'Pingo Doce' },
    status: 'failed',
    batchId: '11111111-1111-4111-8111-111111111111',
    attempt: 3,
    trigger: 'cron',
    startedAt: '2026-09-23T03:20:00Z',
    finishedAt: '2026-09-23T03:20:05Z',
    error: { code: 'EAI_AGAIN', message: 'DNS indisponível' },
    stats: {},
    durationMs: 5000,
    lastSuccessAt: '2026-09-22T03:06:00Z',
  });
});
