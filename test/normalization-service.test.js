import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseMoneyToCents,
  parsePortugueseNumber,
  parseUnitMeasure,
  resolvePartialPortugueseDate,
} from '../src/services/normalization-service.js';

test('interpreta números e dinheiro no formato português', () => {
  assert.equal(parsePortugueseNumber('1.234,56'), 1234.56);
  assert.equal(parseMoneyToCents('1,09'), 109);
  assert.equal(parseMoneyToCents('inválido'), null);
});

test('normaliza peso e preço por quilograma', () => {
  assert.deepEqual(parseUnitMeasure('500 g | 2,18 €/Kg'), {
    raw: '500 g | 2,18 €/Kg',
    quantity: 500,
    unit: 'g',
    normalizedQuantity: 0.5,
    normalizedUnit: 'kg',
    pricePerBaseUnitCents: 218,
    pricePerBaseUnit: 'kg',
  });
});

test('calcula a quantidade total de multipacks', () => {
  assert.deepEqual(parseUnitMeasure('4 x0.156 L | 3,19 €/L'), {
    raw: '4 x0.156 L | 3,19 €/L',
    quantity: 0.624,
    unit: 'l',
    packCount: 4,
    itemQuantity: 0.156,
    itemUnit: 'l',
    normalizedQuantity: 0.624,
    normalizedUnit: 'l',
    pricePerBaseUnitCents: 319,
    pricePerBaseUnit: 'l',
  });
});

test('trata doses como unidades comparáveis', () => {
  const result = parseUnitMeasure('100 Dos | 0,11 €/Dos');
  assert.equal(result.normalizedQuantity, 100);
  assert.equal(result.normalizedUnit, 'unit');
  assert.equal(result.pricePerBaseUnit, 'unit');
});

test('resolve datas sem ano relativamente à data da recolha', () => {
  assert.equal(
    resolvePartialPortugueseDate('Promoção até 21/09', '2026-09-20T12:00:00Z'),
    '2026-09-21',
  );
  assert.equal(
    resolvePartialPortugueseDate('até 02/01', '2026-12-30T12:00:00Z'),
    '2027-01-02',
  );
});
