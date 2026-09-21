import assert from 'node:assert/strict';
import test from 'node:test';

import { validateSnapshot } from '../src/db/snapshot.js';

test('aceita o contrato de snapshot atual', () => {
  const snapshot = {
    schemaVersion: 1,
    market: { id: 'pingo-doce', name: 'Pingo Doce' },
    finishedAt: '2026-09-21T20:00:00Z',
    products: [],
    rejected: [],
  };
  assert.equal(validateSnapshot(snapshot), snapshot);
});

test('rejeita snapshots incompletos ou incompatíveis', () => {
  assert.throws(
    () => validateSnapshot({ schemaVersion: 2 }),
    /schemaVersion deve ser 1/,
  );
});
