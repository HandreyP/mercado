import assert from 'node:assert/strict';
import test from 'node:test';

import { parseSyncOptions } from '../src/sync.js';

test('usa lotes diários de 500 por predefinição', () => {
  const options = parseSyncOptions([]);
  assert.equal(options.limit, 500);
  assert.equal(options.market, 'pingo-doce');
  assert.equal(options['retry-failed'], false);
});

test('aceita opções incrementais e lotes menores', () => {
  const options = parseSyncOptions([
    '--limit',
    '25',
    '--retry-failed',
    '--sample',
  ]);
  assert.equal(options.limit, 25);
  assert.equal(options['retry-failed'], true);
  assert.equal(options.sample, true);
});

test('não permite lotes superiores a 500', () => {
  assert.throws(() => parseSyncOptions(['--limit', '501']), /entre 1 e 500/);
});
