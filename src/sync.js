#!/usr/bin/env node

import { parseArgs } from 'node:util';

import { HttpClient } from './core/http-client.js';
import { createDatabaseRepository } from './repositories/database.repository.js';
import { ImportRepository } from './repositories/import.repository.js';
import { getMarketScraper } from './scrapers/market-scrapers.js';
import { synchronizeMarket } from './services/synchronize-market.service.js';

export { synchronizeMarket } from './services/synchronize-market.service.js';

const DEFAULT_BATCH_SIZE = 500;

export function parseSyncOptions(args) {
  const { values } = parseArgs({
    args,
    options: {
      market: { type: 'string', default: 'pingo-doce' },
      limit: { type: 'string', default: String(DEFAULT_BATCH_SIZE) },
      output: { type: 'string', default: 'data' },
      'retry-failed': { type: 'boolean', default: false },
      all: { type: 'boolean', default: false },
      sample: { type: 'boolean', default: false },
      'no-cache': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > DEFAULT_BATCH_SIZE) {
    throw new Error(
      `--limit deve ser um número inteiro entre 1 e ${DEFAULT_BATCH_SIZE}`,
    );
  }
  return { ...values, limit };
}

function printHelp() {
  console.log(`Utilização:
  npm run sync -- [--limit 500] [--retry-failed]

A sincronização recolhe, cria um snapshot, importa-o no PostgreSQL e só depois
atualiza o estado incremental. O tamanho máximo de cada lote é 500.`);
}

async function main() {
  const options = parseSyncOptions(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const market = getMarketScraper(options.market);
  const httpClient = new HttpClient({ useCache: !options['no-cache'] });
  const database = createDatabaseRepository();
  const importRepository = new ImportRepository({ database });

  try {
    const result = await synchronizeMarket({
      market,
      httpClient,
      database,
      importRepository,
      outputDirectory: options.output,
      limit: options.limit,
      retryFailed: options['retry-failed'],
      forceAll: options.all,
      sample: options.sample,
    });
    const { stats } = result.collection;
    const changes = result.imported.offerChanges;
    console.log(
      `Descobertos ${stats.discovered}; elegíveis ${stats.eligible}; ` +
        `inspecionados ${stats.candidatesInspected}.`,
    );
    console.log(
      `Produtos ${stats.collected}; rejeitados ${stats.rejected}; ` +
        `ofertas gravadas ${result.imported.offers}.`,
    );
    console.log(
      `Preços: ${changes.decreased} descidas, ${changes.increased} subidas, ` +
        `${changes.unchanged} inalterados.`,
    );
    console.log(`Snapshot: ${result.snapshotPath}`);
    console.log(`Estado: ${result.statePath}`);
  } finally {
    await database.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    if (error.code === 'SYNC_ALREADY_RUNNING') {
      console.error(error.message);
      process.exitCode = 3;
      return;
    }
    console.error(`Erro de sincronização: ${error.message}`);
    process.exitCode = 1;
  });
}
