import assert from 'node:assert/strict';
import test from 'node:test';

import { ImportRepository } from '../src/repositories/import.repository.js';

function setupDatabase(results) {
  const calls = [];
  const client = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      return results.shift();
    },
  };
  const database = {
    async withTransaction(operation, options) {
      calls.push({ sql: 'WITH_TRANSACTION', options });
      return operation(client);
    },
  };
  return { calls, client, database };
}

function emptySnapshot() {
  return {
    market: { id: 'pingo-doce', name: 'Pingo Doce' },
    source: { type: 'product-pages' },
    startedAt: '2026-09-21T10:00:00Z',
    finishedAt: '2026-09-21T10:01:00Z',
    stats: {},
    quality: {},
    products: [],
    rejected: [],
  };
}

test('termina sem duplicar quando o hash do snapshot já existe', async () => {
  const setup = setupDatabase([
    { rows: [{ id: '1' }] },
    { rows: [] },
    { rows: [{ id: '7' }] },
  ]);
  const repository = new ImportRepository({ database: setup.database });

  const result = await repository.importSnapshot({
    snapshot: emptySnapshot(),
    sourceFile: '/tmp/snapshot.json',
    hash: 'a'.repeat(64),
  });

  assert.equal(result.alreadyImported, true);
  assert.equal(result.runId, '7');
  assert.equal(setup.calls[0].sql, 'WITH_TRANSACTION');
  assert.equal(setup.calls.length, 4);
});

test('cria uma execução vazia dentro da transação', async () => {
  const setup = setupDatabase([
    { rows: [{ id: '1' }] },
    { rows: [{ id: '8' }] },
  ]);
  const repository = new ImportRepository({ database: setup.database });

  const result = await repository.importSnapshot({
    snapshot: emptySnapshot(),
    sourceFile: '/tmp/snapshot.json',
    hash: 'b'.repeat(64),
  });

  assert.deepEqual(result.offerChanges, {
    inserted: 0,
    unchanged: 0,
    new: 0,
    decreased: 0,
    increased: 0,
    changed: 0,
  });
  assert.equal(result.runId, '8');
  assert.equal(result.products, 0);
});

test('garante identidade canónica para cada produto importado', async () => {
  const setup = setupDatabase([
    { rows: [{ id: '1' }] },
    { rows: [{ id: '8' }] },
    { rows: [{ id: '20' }] },
    { rows: [{ inserted: true, previous_price_cents: null }] },
    { rows: [] },
  ]);
  const canonicalCalls = [];
  const canonicalProducts = {
    async ensureForMarketProduct(client, input) {
      canonicalCalls.push({ client, input });
      return '30';
    },
  };
  const repository = new ImportRepository({
    canonicalProducts,
    database: setup.database,
  });
  const snapshot = emptySnapshot();
  snapshot.products.push({
    externalId: '1805',
    name: 'Sal Fino',
    url: 'https://example.test/sal',
    categories: [],
    images: [],
    package: { normalizedQuantity: 0.25, normalizedUnit: 'kg' },
    source: { type: 'product-page', url: 'https://example.test/sal' },
    collectedAt: '2026-09-23T10:00:00Z',
    offer: { currency: 'EUR', priceCents: 29, promotion: false },
  });

  await repository.importSnapshot({
    snapshot,
    sourceFile: '/tmp/snapshot.json',
    hash: 'c'.repeat(64),
  });

  assert.equal(canonicalCalls.length, 1);
  assert.equal(canonicalCalls[0].input.marketProductId, '20');
  assert.equal(canonicalCalls[0].input.product.name, 'Sal Fino');
});
