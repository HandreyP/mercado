import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createEmptyCollectionState,
  readCollectionState,
  updateCollectionState,
  writeCollectionState,
} from '../src/services/collection-state-repository.js';

test('atualiza sucessos e falhas sem apagar o histórico anterior', () => {
  const state = createEmptyCollectionState('pingo-doce');
  const collection = {
    market: { id: 'pingo-doce' },
    finishedAt: '2026-09-21T20:00:00Z',
    products: [
      {
        externalId: '1805',
        collectedAt: '2026-09-21T19:59:00Z',
        offer: { priceCents: 29 },
        source: {
          url: 'https://example.test/1805',
          sitemapLastModified: '2026-09-20',
        },
      },
    ],
    rejected: [
      {
        externalId: '859',
        url: 'https://example.test/859',
        lastModified: '2026-09-19',
        attemptedAt: '2026-09-21T19:58:00Z',
        status: 'rejected',
        errors: ['preço em falta'],
      },
    ],
  };

  const updated = updateCollectionState(state, collection);
  assert.equal(updated.products['1805'].status, 'collected');
  assert.equal(updated.products['1805'].lastPriceCents, 29);
  assert.equal(updated.products['859'].status, 'rejected');
  assert.equal(updated.products['859'].consecutiveFailures, 1);
});

test('lê e escreve o estado de forma persistente', async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'mercado-state-'));
  const state = createEmptyCollectionState('pingo-doce');
  state.updatedAt = '2026-09-21T20:00:00Z';

  const statePath = await writeCollectionState(state, { outputDirectory });
  const loaded = await readCollectionState('pingo-doce', { outputDirectory });

  assert.deepEqual(loaded, state);
  assert.equal(JSON.parse(await readFile(statePath, 'utf8')).schemaVersion, 1);
});
