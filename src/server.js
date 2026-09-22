#!/usr/bin/env node

import { createApp } from './app.js';
import { CatalogRepository } from './repositories/catalog.repository.js';
import { createDatabaseRepository } from './repositories/database.repository.js';

const database = createDatabaseRepository();
const catalogRepository = new CatalogRepository({ database });
const app = createApp({ catalogRepository, database });
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
