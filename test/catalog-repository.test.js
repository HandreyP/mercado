import assert from 'node:assert/strict';
import test from 'node:test';

import { CatalogRepository } from '../src/repositories/catalog.repository.js';

function databaseReturning(...results) {
  const calls = [];
  return {
    calls,
    async query(sql, parameters) {
      calls.push({ sql, parameters });
      return results.shift();
    },
  };
}

test('mapeia linhas SQL para o contrato público de produtos', async () => {
  const database = databaseReturning({
    rows: [
      {
        id: '10',
        canonical_product_id: '30',
        market_slug: 'pingo-doce',
        market_name: 'Pingo Doce',
        external_id: '1805',
        name: 'Sal Fino',
        brand: 'Pingo Doce',
        categories: ['Mercearia', 'Sal'],
        image: 'https://example.test/sal.png',
        package: { normalizedQuantity: 0.25, normalizedUnit: 'kg' },
        url: 'https://example.test/sal',
        currency: 'EUR',
        price_cents: 29,
        original_price_cents: null,
        price_per_base_unit_cents: 116,
        base_unit: 'kg',
        promotion: false,
        promotion_ends_at: null,
        observed_at: '2026-09-21T12:00:00Z',
        previous_observed_price_cents: 35,
        total_count: 1,
      },
    ],
  });
  const repository = new CatalogRepository({ database });

  const result = await repository.listProducts({
    search: '',
    sort: 'price_asc',
    promotion: null,
    market: null,
    category: 'Mercearia',
    limit: 24,
    offset: 0,
  });

  assert.equal(result.pagination.total, 1);
  assert.equal(result.items[0].externalId, '1805');
  assert.equal(result.items[0].canonicalProductId, '30');
  assert.equal(result.items[0].offer.trend, 'down');
  assert.deepEqual(database.calls[0].parameters, [
    '',
    null,
    null,
    'Mercearia',
    24,
    0,
  ]);
});

test('devolve null quando o produto não existe no histórico', async () => {
  const database = databaseReturning({ rows: [], rowCount: 0 });
  const repository = new CatalogRepository({ database });

  assert.equal(await repository.getProductHistory('999'), null);
  assert.equal(database.calls.length, 1);
});

test('lista mercados através do repositório', async () => {
  const database = databaseReturning({
    rows: [{ id: 'pingo-doce', name: 'Pingo Doce' }],
  });
  const repository = new CatalogRepository({ database });

  assert.deepEqual(await repository.listMarkets(), [
    { id: 'pingo-doce', name: 'Pingo Doce' },
  ]);
});

test('lista categorias principais com contagem de produtos', async () => {
  const database = databaseReturning({
    rows: [
      { name: 'Mercearia', product_count: 210 },
      { name: 'Laticínios', product_count: 90 },
    ],
  });
  const repository = new CatalogRepository({ database });

  const result = await repository.listCategories();

  assert.deepEqual(result, [
    { name: 'Mercearia', productCount: 210 },
    { name: 'Laticínios', productCount: 90 },
  ]);
  assert.match(database.calls[0].sql, /categories\[1\]/);
});

test('apresenta cobertura do catálogo a partir da descoberta mais recente', async () => {
  const database = databaseReturning({
    rows: [
      {
        markets: 1,
        products: 550,
        canonical_products: 550,
        offer_observations: 560,
        promotions: 80,
        discovered_products: 2200,
        last_import_at: '2026-09-23T03:06:00Z',
      },
    ],
  });
  const repository = new CatalogRepository({ database });

  const result = await repository.getCatalogStats();

  assert.equal(result.discoveredProducts, 2200);
  assert.equal(result.canonicalProducts, 550);
  assert.equal(result.coveragePercent, 25);
});
