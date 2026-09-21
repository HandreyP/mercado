import assert from 'node:assert/strict';
import test from 'node:test';

import { parseProductFilters } from '../src/api/product-filters.js';

test('aplica valores predefinidos aos filtros', () => {
  assert.deepEqual(parseProductFilters({}), {
    search: '',
    sort: 'name_asc',
    promotion: null,
    market: null,
    limit: 24,
    offset: 0,
  });
});

test('interpreta pesquisa, ordenação, paginação e promoção', () => {
  assert.deepEqual(
    parseProductFilters({
      q: 'arroz',
      sort: 'price_asc',
      promotion: 'true',
      market: 'pingo-doce',
      limit: '50',
      offset: '100',
    }),
    {
      search: 'arroz',
      sort: 'price_asc',
      promotion: true,
      market: 'pingo-doce',
      limit: 50,
      offset: 100,
    },
  );
});

test('rejeita ordenações e limites inválidos', () => {
  assert.throws(() => parseProductFilters({ sort: 'DROP TABLE offers' }));
  assert.throws(() => parseProductFilters({ limit: '101' }));
  assert.throws(() => parseProductFilters({ promotion: 'yes' }));
});
