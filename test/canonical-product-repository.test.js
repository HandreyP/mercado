import assert from 'node:assert/strict';
import test from 'node:test';

import { CanonicalProductRepository } from '../src/repositories/canonical-product.repository.js';

function clientReturning(...results) {
  const calls = [];
  return {
    calls,
    async query(sql, parameters) {
      calls.push({ parameters, sql });
      return results.shift();
    },
  };
}

test('reutiliza a correspondência canónica já existente', async () => {
  const client = clientReturning({ rows: [{ canonical_product_id: '9' }] });
  const repository = new CanonicalProductRepository({ database: {} });

  const id = await repository.ensureForMarketProduct(client, {
    marketProductId: '4',
    product: { name: 'Arroz' },
  });

  assert.equal(id, '9');
  assert.equal(client.calls.length, 1);
});

test('cria identidade e correspondência inicial para um produto novo', async () => {
  const client = clientReturning(
    { rows: [] },
    { rows: [{ id: '10' }] },
    { rows: [] },
  );
  const repository = new CanonicalProductRepository({ database: {} });

  const id = await repository.ensureForMarketProduct(client, {
    marketProductId: '4',
    product: {
      name: 'Leite Meio-Gordo',
      brand: 'Pingo Doce',
      package: { normalizedQuantity: 1, normalizedUnit: 'l' },
    },
  });

  assert.equal(id, '10');
  assert.match(client.calls[1].sql, /INSERT INTO canonical_products/);
  assert.deepEqual(client.calls[1].parameters.slice(1), [
    'Leite Meio-Gordo',
    'Pingo Doce',
    'leite meio gordo',
    'pingo doce',
    1,
    'l',
  ]);
  assert.match(client.calls[2].sql, /INSERT INTO product_matches/);
});

test('consulta a identidade canónica com as correspondências de mercado', async () => {
  const results = [
    {
      rows: [
        {
          id: '10',
          display_name: 'Leite Meio-Gordo',
          brand: 'Pingo Doce',
          package_quantity: '1',
          package_unit: 'l',
        },
      ],
      rowCount: 1,
    },
    {
      rows: [
        {
          id: '4',
          external_id: '123',
          name: 'Leite Meio-Gordo',
          market_id: 'pingo-doce',
          market_name: 'Pingo Doce',
          confidence: '1.000',
          method: 'automatic',
          status: 'confirmed',
          price_cents: 89,
          currency: 'EUR',
        },
      ],
    },
  ];
  const database = { query: async () => results.shift() };
  const repository = new CanonicalProductRepository({ database });

  const result = await repository.getById('10');

  assert.equal(result.id, '10');
  assert.equal(result.matches[0].market.id, 'pingo-doce');
  assert.equal(result.matches[0].offer.priceCents, 89);
  assert.equal(result.matches[0].confidence, 1);
});
