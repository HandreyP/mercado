#!/usr/bin/env node

import { createApp } from './app.js';
import { CatalogRepository } from './repositories/catalog.repository.js';
import { CanonicalProductRepository } from './repositories/canonical-product.repository.js';
import { createDatabaseRepository } from './repositories/database.repository.js';
import { SyncExecutionRepository } from './repositories/sync-execution.repository.js';

const database = createDatabaseRepository();
const catalogRepository = new CatalogRepository({ database });
const canonicalProductRepository = new CanonicalProductRepository({ database });
const syncExecutionRepository = new SyncExecutionRepository({ database });
const app = createApp({
  canonicalProductRepository,
  catalogRepository,
  database,
  syncExecutionRepository,
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
