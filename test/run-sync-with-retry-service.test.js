import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isTransientSyncError,
  runSyncWithRetry,
} from '../src/services/run-sync-with-retry.service.js';

function executionRepository(events) {
  return {
    async start(input) {
      events.push(`start:${input.attempt}`);
      return { id: String(input.attempt) };
    },
    async complete(id) {
      events.push(`complete:${id}`);
    },
    async fail(id, { error }) {
      events.push(`fail:${id}:${error.code}`);
    },
  };
}

test('repete a sincronização completa após falhas transitórias', async () => {
  const events = [];
  const delays = [];
  let calls = 0;
  const result = await runSyncWithRetry({
    batchId: 'batch-1',
    execute: async () => {
      calls += 1;
      events.push(`execute:${calls}`);
      if (calls < 3) {
        const error = new Error('DNS temporariamente indisponível');
        error.code = 'EAI_AGAIN';
        throw error;
      }
      return { imported: { products: 10 } };
    },
    market: { id: 'pingo-doce', name: 'Pingo Doce' },
    maximumAttempts: 3,
    retryDelayMs: 100,
    sleep: async (milliseconds) => delays.push(milliseconds),
    syncExecutionRepository: executionRepository(events),
    trigger: 'cron',
  });

  assert.equal(result.execution.attempts, 3);
  assert.deepEqual(delays, [100, 300]);
  assert.deepEqual(events, [
    'start:1',
    'execute:1',
    'fail:1:EAI_AGAIN',
    'start:2',
    'execute:2',
    'fail:2:EAI_AGAIN',
    'start:3',
    'execute:3',
    'complete:3',
  ]);
});

test('não repete erros definitivos', async () => {
  const events = [];
  const delays = [];
  const error = new Error('Snapshot inválido');
  error.code = 'INVALID_SNAPSHOT';

  await assert.rejects(
    runSyncWithRetry({
      execute: async () => {
        throw error;
      },
      market: { id: 'pingo-doce', name: 'Pingo Doce' },
      maximumAttempts: 3,
      sleep: async (milliseconds) => delays.push(milliseconds),
      syncExecutionRepository: executionRepository(events),
    }),
    error,
  );

  assert.deepEqual(delays, []);
  assert.deepEqual(events, ['start:1', 'fail:1:INVALID_SNAPSHOT']);
});

test('reconhece códigos transitórios mesmo quando estão na causa', () => {
  const cause = new Error('getaddrinfo EAI_AGAIN');
  cause.code = 'EAI_AGAIN';
  assert.equal(isTransientSyncError(new Error('Falha HTTP', { cause })), true);
  assert.equal(isTransientSyncError({ response: { status: 503 } }), true);
  assert.equal(isTransientSyncError({ response: { status: 404 } }), false);
});
