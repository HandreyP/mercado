#!/usr/bin/env node

import { createApp } from './app.js';
import { HttpClient } from './core/http-client.js';
import { CatalogRepository } from './repositories/catalog.repository.js';
import { CanonicalProductRepository } from './repositories/canonical-product.repository.js';
import { createDatabaseRepository } from './repositories/database.repository.js';
import { ImportRepository } from './repositories/import.repository.js';
import { SyncExecutionRepository } from './repositories/sync-execution.repository.js';
import { getMarketScraper } from './scrapers/market-scrapers.js';
import { runSyncWithRetry } from './services/run-sync-with-retry.service.js';
import { SyncLauncherService } from './services/sync-launcher.service.js';
import { synchronizeMarket } from './services/synchronize-market.service.js';

const database = createDatabaseRepository();
const catalogRepository = new CatalogRepository({ database });
const canonicalProductRepository = new CanonicalProductRepository({ database });
const syncExecutionRepository = new SyncExecutionRepository({ database });
const importRepository = new ImportRepository({ database });
const syncLauncher = new SyncLauncherService({
  execute: async () => {
    const market = getMarketScraper('pingo-doce');
    const httpClient = new HttpClient();
    return runSyncWithRetry({
      market,
      maximumAttempts: 3,
      retryDelayMs: 5 * 60 * 1000,
      syncExecutionRepository,
      trigger: 'manual',
      execute: () =>
        synchronizeMarket({
          database,
          httpClient,
          importRepository,
          limit: 500,
          market,
          retryFailed: true,
        }),
    });
  },
  onError: (error) => console.error(`Sincronização manual: ${error.message}`),
});
const app = createApp({
  canonicalProductRepository,
  catalogRepository,
  database,
  syncExecutionRepository,
  syncLauncher,
});
const port = Number(process.env.PORT ?? 3000);

const server = app.listen(port, () => {
  console.log(`Mercado disponível em http://localhost:${port}`);
});

async function shutdown() {
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
