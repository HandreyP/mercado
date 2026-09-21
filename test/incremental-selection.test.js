import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyCandidates,
  selectIncrementalCandidates,
} from '../src/core/incremental-selection.js';

const candidates = [
  { externalId: '1', url: 'https://example.test/1', lastModified: '2026-09-20' },
  { externalId: '2', url: 'https://example.test/2', lastModified: '2026-09-21' },
  { externalId: '3', url: 'https://example.test/3', lastModified: '2026-09-19' },
];

const state = {
  products: {
    1: {
      url: 'https://example.test/1',
      lastModified: '2026-09-20',
      status: 'collected',
    },
    2: {
      url: 'https://example.test/2',
      lastModified: '2026-09-18',
      status: 'collected',
    },
    3: {
      url: 'https://example.test/3',
      lastModified: '2026-09-19',
      status: 'rejected',
    },
  },
};

test('classifica produtos novos, alterados e inalterados', () => {
  const withNewProduct = [...candidates, {
    externalId: '4',
    url: 'https://example.test/4',
    lastModified: '2026-09-21',
  }];
  const result = classifyCandidates(withNewProduct, state);

  assert.deepEqual(result.map(({ status }) => status), [
    'unchanged',
    'changed',
    'unchanged',
    'new',
  ]);
  assert.equal(result[2].failedPreviously, true);
});

test('seleciona alterações e só repete falhas quando solicitado', () => {
  const incremental = selectIncrementalCandidates(candidates, state);
  assert.deepEqual(incremental.candidates.map(({ externalId }) => externalId), ['2']);
  assert.deepEqual(incremental.stats, {
    discovered: 3,
    new: 0,
    changed: 1,
    unchanged: 2,
    previouslyFailed: 1,
    eligible: 1,
  });

  const withRetries = selectIncrementalCandidates(candidates, state, {
    retryFailed: true,
  });
  assert.deepEqual(withRetries.candidates.map(({ externalId }) => externalId), [
    '3',
    '2',
  ]);
});

test('a amostra é determinística e a opção all inclui inalterados', () => {
  const first = selectIncrementalCandidates(candidates, state, {
    forceAll: true,
    sample: true,
  });
  const second = selectIncrementalCandidates(candidates, state, {
    forceAll: true,
    sample: true,
  });

  assert.equal(first.candidates.length, 3);
  assert.deepEqual(first.candidates, second.candidates);
});
