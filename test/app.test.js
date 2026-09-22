import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiHandlers } from '../src/app.js';

function fakeCatalog(overrides = {}) {
  return {
    getCatalogStats: async () => ({}),
    getProductHistory: async () => null,
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

test('health delega a verificação ao repositório da base de dados', async () => {
  let checks = 0;
  const handlers = createApiHandlers({
    catalogRepository: fakeCatalog(),
    database: { healthCheck: async () => (checks += 1) },
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
    database: { healthCheck: async () => {} },
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
    database: { healthCheck: async () => {} },
  });
  const invalidResponse = fakeResponse();
  const missingResponse = fakeResponse();

  await handlers.history({ params: { id: 'abc' } }, invalidResponse, assert.fail);
  await handlers.history({ params: { id: '42' } }, missingResponse, assert.fail);

  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(missingResponse.statusCode, 404);
});
