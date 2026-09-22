import { collectProducts } from '../core/collect-products.js';
import { readSnapshot } from '../db/snapshot.js';
import {
  readCollectionState,
  updateCollectionState,
  writeCollectionState,
} from './collection-state-repository.js';
import { writeCollectionSnapshot } from './json-repository.js';

const defaultOperations = {
  collectProducts,
  readCollectionState,
  readSnapshot,
  updateCollectionState,
  writeCollectionSnapshot,
  writeCollectionState,
};

export async function synchronizeMarket({
  market,
  httpClient,
  database,
  importRepository,
  outputDirectory = 'data',
  limit = 500,
  retryFailed = false,
  forceAll = false,
  sample = false,
  operations = defaultOperations,
}) {
  const lockName = `mercado-sync:${market.id}`;

  return database.withAdvisoryLock(lockName, async (client) => {
    const state = await operations.readCollectionState(market.id, { outputDirectory });
    const collection = await operations.collectProducts(market, httpClient, {
      forceAll,
      limit,
      retryFailed,
      sample,
      state,
    });
    const snapshotPath = await operations.writeCollectionSnapshot(collection, {
      outputDirectory,
    });
    const snapshotInput = await operations.readSnapshot(snapshotPath);
    const imported = await importRepository.importSnapshot(
      { ...snapshotInput, sourceFile: snapshotInput.absolutePath },
      { client },
    );

    const nextState = operations.updateCollectionState(state, collection);
    const statePath = await operations.writeCollectionState(nextState, { outputDirectory });

    return { collection, imported, snapshotPath, statePath };
  });
}
