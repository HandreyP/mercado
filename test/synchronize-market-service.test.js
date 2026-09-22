import assert from 'node:assert/strict';
import test from 'node:test';

import { synchronizeMarket } from '../src/services/synchronize-market.service.js';

function dependencies(events, { importError = null } = {}) {
  const client = { id: 'locked-client' };
  return {
    client,
    database: {
      async withAdvisoryLock(name, operation) {
        events.push(`lock:${name}`);
        return operation(client);
      },
    },
    importRepository: {
      async importSnapshot(input, options) {
        events.push(`import:${options.client.id}:${input.sourceFile}`);
        if (importError) throw importError;
        return { offers: 1, offerChanges: { unchanged: 0 } };
      },
    },
    operations: {
      async collectProducts() {
        events.push('collect');
        return { products: [], stats: {} };
      },
      async readCollectionState() {
        events.push('read-state');
        return { products: {} };
      },
      async readSnapshot(path) {
        events.push(`read-snapshot:${path}`);
        return { absolutePath: '/absolute/snapshot.json', snapshot: {} };
      },
      updateCollectionState() {
        events.push('update-state');
        return { products: { updated: true } };
      },
      async writeCollectionSnapshot() {
        events.push('write-snapshot');
        return 'data/snapshot.json';
      },
      async writeCollectionState() {
        events.push('write-state');
        return 'data/state.json';
      },
    },
  };
}

test('sincroniza sob lock e só grava o estado depois da importação', async () => {
  const events = [];
  const deps = dependencies(events);
  const market = { id: 'pingo-doce', name: 'Pingo Doce' };

  const result = await synchronizeMarket({
    database: deps.database,
    httpClient: {},
    importRepository: deps.importRepository,
    market,
    operations: deps.operations,
  });

  assert.equal(result.snapshotPath, 'data/snapshot.json');
  assert.equal(result.statePath, 'data/state.json');
  assert.deepEqual(events, [
    'lock:mercado-sync:pingo-doce',
    'read-state',
    'collect',
    'write-snapshot',
    'read-snapshot:data/snapshot.json',
    'import:locked-client:/absolute/snapshot.json',
    'update-state',
    'write-state',
  ]);
});

test('não atualiza o estado quando a importação falha', async () => {
  const events = [];
  const deps = dependencies(events, { importError: new Error('falha na BD') });

  await assert.rejects(
    synchronizeMarket({
      database: deps.database,
      httpClient: {},
      importRepository: deps.importRepository,
      market: { id: 'pingo-doce', name: 'Pingo Doce' },
      operations: deps.operations,
    }),
    /falha na BD/,
  );

  assert.equal(events.includes('update-state'), false);
  assert.equal(events.includes('write-state'), false);
});
