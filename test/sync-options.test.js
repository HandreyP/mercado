import assert from 'node:assert/strict';
import test from 'node:test';

import { parseSyncOptions } from '../src/sync.js';

test('usa lotes diários de 500 por predefinição', () => {
  const options = parseSyncOptions([]);
  assert.equal(options.limit, 500);
  assert.equal(options.market, 'pingo-doce');
  assert.equal(options['retry-failed'], false);
  assert.equal(options.attempts, 1);
  assert.equal(options['retry-delay-seconds'], 300);
  assert.equal(options.trigger, 'manual');
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

test('aceita a política de repetição do cron', () => {
  const options = parseSyncOptions([
    '--attempts',
    '3',
    '--retry-delay-seconds',
    '120',
    '--trigger',
    'cron',
  ]);

  assert.equal(options.attempts, 3);
  assert.equal(options['retry-delay-seconds'], 120);
  assert.equal(options.trigger, 'cron');
});

test('rejeita políticas de repetição e origens inválidas', () => {
  assert.throws(() => parseSyncOptions(['--attempts', '0']), /attempts/);
  assert.throws(
    () => parseSyncOptions(['--retry-delay-seconds', '-1']),
    /retry-delay-seconds/,
  );
  assert.throws(() => parseSyncOptions(['--trigger', 'desconhecido']), /trigger/);
});
