import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalProductIdentity } from '../src/services/canonical-product.service.js';

test('normaliza nome, marca e embalagem sem perder os valores de apresentação', () => {
  assert.deepEqual(
    canonicalProductIdentity({
      name: 'Leite Meio-Gordo  UHT',
      brand: 'Pingo Doce',
      package: { normalizedQuantity: 1, normalizedUnit: 'l' },
    }),
    {
      displayName: 'Leite Meio-Gordo UHT',
      brand: 'Pingo Doce',
      normalizedName: 'leite meio gordo uht',
      normalizedBrand: 'pingo doce',
      packageQuantity: 1,
      packageUnit: 'l',
    },
  );
});

test('aceita produtos sem marca ou embalagem normalizada', () => {
  const result = canonicalProductIdentity({ name: 'Maçã Golden', package: null });

  assert.equal(result.normalizedName, 'maca golden');
  assert.equal(result.brand, null);
  assert.equal(result.packageQuantity, null);
  assert.equal(result.packageUnit, null);
});
