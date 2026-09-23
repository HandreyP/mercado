#!/usr/bin/env node

import { parseArgs } from 'node:util';

import { HttpClient } from './core/http-client.js';
import { createDatabaseRepository } from './repositories/database.repository.js';
import { ImportRepository } from './repositories/import.repository.js';
import { SyncExecutionRepository } from './repositories/sync-execution.repository.js';
import { getMarketScraper } from './scrapers/market-scrapers.js';
import { runSyncWithRetry } from './services/run-sync-with-retry.service.js';
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
      attempts: { type: 'string', default: '1' },
      'retry-delay-seconds': { type: 'string', default: '300' },
      trigger: { type: 'string', default: 'manual' },
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
  const attempts = Number(values.attempts);
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) {
    throw new Error('--attempts deve ser um número inteiro entre 1 e 5');
  }
  const retryDelaySeconds = Number(values['retry-delay-seconds']);
  if (!Number.isInteger(retryDelaySeconds) || retryDelaySeconds < 0) {
    throw new Error('--retry-delay-seconds deve ser um número inteiro não negativo');
  }
  if (!['manual', 'cron'].includes(values.trigger)) {
    throw new Error('--trigger deve ser manual ou cron');
  }
  return {
    ...values,
    attempts,
    limit,
    'retry-delay-seconds': retryDelaySeconds,
  };
}

function printHelp() {
  console.log(`Utilização:
  npm run sync -- [--limit 500] [--retry-failed] [--attempts 3]

A sincronização recolhe, cria um snapshot, importa-o no PostgreSQL e só depois
atualiza o estado incremental. O tamanho máximo de cada lote é 500. Falhas
transitórias podem repetir o fluxo completo com espera progressiva.`);
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
  const syncExecutionRepository = new SyncExecutionRepository({ database });

  try {
    const result = await runSyncWithRetry({
      market,
      maximumAttempts: options.attempts,
      retryDelayMs: options['retry-delay-seconds'] * 1000,
      syncExecutionRepository,
      trigger: options.trigger,
      onRetry: ({ delayMs, error, nextAttempt }) => {
        console.warn(
          `Falha transitória: ${error.message}. Tentativa ${nextAttempt} em ` +
            `${Math.ceil(delayMs / 1000)} segundos.`,
        );
      },
      execute: () =>
        synchronizeMarket({
          market,
          httpClient,
          database,
          importRepository,
          outputDirectory: options.output,
          limit: options.limit,
          retryFailed: options['retry-failed'],
          forceAll: options.all,
          sample: options.sample,
        }),
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
    console.log(
      `Execução ${result.execution.batchId}; ${result.execution.attempts} tentativa(s).`,
    );
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
