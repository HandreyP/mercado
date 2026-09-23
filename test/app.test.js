import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiHandlers } from '../src/app.js';

function fakeCatalog(overrides = {}) {
  return {
    getCatalogStats: async () => ({}),
    getProductHistory: async () => null,
    listCategories: async () => [],
    listMarkets: async () => [],
    listProducts: async () => ({ items: [], total: 0 }),
    ...overrides,
  };
}

function fakeResponse() {
  return {
    body: null,
    statusCode: 200,
    json(body) {
      this.body = body;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
  };
}

function fakeSyncExecutions(items = []) {
  return { listLatest: async () => items };
}

function fakeCanonicalProducts(overrides = {}) {
  return { getById: async () => null, ...overrides };
}

test('health delega a verificação ao repositório da base de dados', async () => {
  let checks = 0;
  const handlers = createApiHandlers({
    catalogRepository: fakeCatalog(),
    canonicalProductRepository: fakeCanonicalProducts(),
    database: { healthCheck: async () => (checks += 1) },
    syncExecutionRepository: fakeSyncExecutions(),
  });
  const response = fakeResponse();

  await handlers.health({}, response, assert.fail);

  assert.deepEqual(response.body, { status: 'ok' });
  assert.equal(checks, 1);
});

test('products valida filtros antes de consultar o catálogo', async () => {
  let calls = 0;
  const handlers = createApiHandlers({
    catalogRepository: fakeCatalog({
      listProducts: async () => {
        calls += 1;
      },
    }),
    canonicalProductRepository: fakeCanonicalProducts(),
    database: { healthCheck: async () => {} },
    syncExecutionRepository: fakeSyncExecutions(),
  });
  const response = fakeResponse();

  await handlers.products({ query: { limit: '9999' } }, response, assert.fail);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /inválido/i);
  assert.equal(calls, 0);
});

test('history distingue IDs inválidos e produtos inexistentes', async () => {
  const handlers = createApiHandlers({
    catalogRepository: fakeCatalog(),
    canonicalProductRepository: fakeCanonicalProducts(),
    database: { healthCheck: async () => {} },
    syncExecutionRepository: fakeSyncExecutions(),
  });
  const invalidResponse = fakeResponse();
  const missingResponse = fakeResponse();

  await handlers.history({ params: { id: 'abc' } }, invalidResponse, assert.fail);
  await handlers.history({ params: { id: '42' } }, missingResponse, assert.fail);

  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(missingResponse.statusCode, 404);
});

test('syncStatus apresenta a última tentativa de cada mercado', async () => {
  const items = [
    {
      market: { id: 'pingo-doce', name: 'Pingo Doce' },
      status: 'failed',
      lastSuccessAt: '2026-09-22T03:06:00Z',
    },
  ];
  const handlers = createApiHandlers({
    catalogRepository: fakeCatalog(),
    canonicalProductRepository: fakeCanonicalProducts(),
    database: { healthCheck: async () => {} },
    syncExecutionRepository: fakeSyncExecutions(items),
  });
  const response = fakeResponse();

  await handlers.syncStatus({}, response, assert.fail);

  assert.deepEqual(response.body, { items });
});

test('canonicalProduct devolve correspondências e valida o identificador', async () => {
  const canonical = { id: '10', matches: [{ id: '4' }] };
  const handlers = createApiHandlers({
    canonicalProductRepository: fakeCanonicalProducts({
      getById: async (id) => (id === '10' ? canonical : null),
    }),
    catalogRepository: fakeCatalog(),
    database: { healthCheck: async () => {} },
    syncExecutionRepository: fakeSyncExecutions(),
  });
  const found = fakeResponse();
  const invalid = fakeResponse();

  await handlers.canonicalProduct({ params: { id: '10' } }, found, assert.fail);
  await handlers.canonicalProduct({ params: { id: 'x' } }, invalid, assert.fail);

  assert.deepEqual(found.body, canonical);
  assert.equal(invalid.statusCode, 400);
});

test('categories devolve as categorias principais do catálogo', async () => {
  const items = [{ name: 'Mercearia', productCount: 210 }];
  const handlers = createApiHandlers({
    canonicalProductRepository: fakeCanonicalProducts(),
    catalogRepository: fakeCatalog({ listCategories: async () => items }),
    database: { healthCheck: async () => {} },
    syncExecutionRepository: fakeSyncExecutions(),
  });
  const response = fakeResponse();

  await handlers.categories({}, response, assert.fail);

  assert.deepEqual(response.body, { items });
});

test('startSync aceita uma execução em background e rejeita duplicados', async () => {
  const responses = [
    { started: true },
    { started: false, reason: 'already_running' },
  ];
  const handlers = createApiHandlers({
    canonicalProductRepository: fakeCanonicalProducts(),
    catalogRepository: fakeCatalog(),
    database: { healthCheck: async () => {} },
    syncExecutionRepository: fakeSyncExecutions(),
    syncLauncher: { start: () => responses.shift() },
  });
  const accepted = fakeResponse();
  const conflict = fakeResponse();

  await handlers.startSync({}, accepted, assert.fail);
  await handlers.startSync({}, conflict, assert.fail);

  assert.equal(accepted.statusCode, 202);
  assert.deepEqual(accepted.body, { status: 'started' });
  assert.equal(conflict.statusCode, 409);
  assert.deepEqual(conflict.body, { error: 'Sincronização já está em curso' });
});
