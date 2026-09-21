import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function createEmptyCollectionState(marketId) {
  return {
    schemaVersion: 1,
    marketId,
    updatedAt: null,
    products: {},
  };
}

export async function readCollectionState(
  marketId,
  { outputDirectory = 'data' } = {},
) {
  const statePath = path.join(outputDirectory, marketId, 'state.json');

  try {
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    if (state.schemaVersion !== 1 || state.marketId !== marketId) {
      throw new Error(`Estado incompatível em ${statePath}`);
    }
    return state;
  } catch (error) {
    if (error.code === 'ENOENT') return createEmptyCollectionState(marketId);
    if (error instanceof SyntaxError) {
      throw new Error(`Estado JSON inválido em ${statePath}`, { cause: error });
    }
    throw error;
  }
}

export function updateCollectionState(state, collection) {
  const products = { ...state.products };

  for (const product of collection.products) {
    const previous = products[product.externalId] ?? {};
    products[product.externalId] = {
      externalId: product.externalId,
      url: product.source.url,
      lastModified: product.source.sitemapLastModified,
      status: 'collected',
      lastAttemptAt: product.collectedAt,
      lastSuccessAt: product.collectedAt,
      attempts: (previous.attempts ?? 0) + 1,
      consecutiveFailures: 0,
      errors: [],
      lastPriceCents: product.offer.priceCents,
    };
  }

  for (const rejected of collection.rejected) {
    const previous = products[rejected.externalId] ?? {};
    products[rejected.externalId] = {
      externalId: rejected.externalId,
      url: rejected.url,
      lastModified: rejected.lastModified ?? previous.lastModified ?? null,
      status: rejected.status ?? 'rejected',
      lastAttemptAt: rejected.attemptedAt ?? collection.finishedAt,
      lastSuccessAt: previous.lastSuccessAt ?? null,
      attempts: (previous.attempts ?? 0) + 1,
      consecutiveFailures: (previous.consecutiveFailures ?? 0) + 1,
      errors: rejected.errors,
      lastPriceCents: previous.lastPriceCents ?? null,
    };
  }

  return {
    schemaVersion: 1,
    marketId: collection.market.id,
    updatedAt: collection.finishedAt,
    products,
  };
}

export async function writeCollectionState(
  state,
  { outputDirectory = 'data' } = {},
) {
  const directory = path.join(outputDirectory, state.marketId);
  const target = path.join(directory, 'state.json');
  const temporary = `${target}.${process.pid}.tmp`;

  await mkdir(directory, { recursive: true });
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporary, target);

  return path.resolve(target);
}
