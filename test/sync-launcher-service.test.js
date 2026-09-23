import assert from 'node:assert/strict';
import test from 'node:test';

import { SyncLauncherService } from '../src/services/sync-launcher.service.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('inicia em segundo plano e impede outra execução local simultânea', async () => {
  const running = deferred();
  let calls = 0;
  const launcher = new SyncLauncherService({
    execute: async () => {
      calls += 1;
      return running.promise;
    },
  });

  assert.deepEqual(launcher.start(), { started: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(launcher.start(), { started: false, reason: 'already_running' });
  assert.equal(calls, 1);

  running.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(launcher.start(), { started: true });
});

test('captura falhas de background e permite nova tentativa', async () => {
  const errors = [];
  const launcher = new SyncLauncherService({
    execute: async () => {
      throw new Error('falha externa');
    },
    onError: (error) => errors.push(error.message),
  });

  launcher.start();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(errors, ['falha externa']);
  assert.deepEqual(launcher.start(), { started: true });
});
