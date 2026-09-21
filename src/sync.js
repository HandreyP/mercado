#!/usr/bin/env node

import { parseArgs } from "node:util";

import { collectProducts } from "./core/collect-products.js";
import { HttpClient } from "./core/http-client.js";
import { importSnapshot } from "./db/importer.js";
import { createDatabasePool } from "./db/pool.js";
import { readSnapshot } from "./db/snapshot.js";
import { getMarket } from "./markets/index.js";
import {
   readCollectionState,
   updateCollectionState,
   writeCollectionState,
} from "./services/collection-state-repository.js";
import { writeCollectionSnapshot } from "./services/json-repository.js";

const DEFAULT_BATCH_SIZE = 500;

export function parseSyncOptions(args) {
   const { values } = parseArgs({
      args,
      options: {
         market: { type: "string", default: "pingo-doce" },
         limit: { type: "string", default: String(DEFAULT_BATCH_SIZE) },
         output: { type: "string", default: "data" },
         "retry-failed": { type: "boolean", default: false },
         all: { type: "boolean", default: false },
         sample: { type: "boolean", default: false },
         "no-cache": { type: "boolean", default: false },
         help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
   });
   const limit = Number(values.limit);
   if (!Number.isInteger(limit) || limit < 1 || limit > DEFAULT_BATCH_SIZE) {
      throw new Error(
         `--limit deve ser um número inteiro entre 1 e ${DEFAULT_BATCH_SIZE}`
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

export async function synchronizeMarket({
   market,
   httpClient,
   pool,
   outputDirectory = "data",
   limit = DEFAULT_BATCH_SIZE,
   retryFailed = false,
   forceAll = false,
   sample = false,
}) {
   const lockName = `mercado-sync:${market.id}`;
   const client = await pool.connect();
   let acquired = false;

   try {
      const lockResult = await client.query(
         "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
         [lockName]
      );
      acquired = lockResult.rows[0].acquired;
      if (!acquired) {
         const error = new Error(
            `Já existe uma sincronização ativa para ${market.name}`
         );
         error.code = "SYNC_ALREADY_RUNNING";
         throw error;
      }

      const state = await readCollectionState(market.id, { outputDirectory });
      const collection = await collectProducts(market, httpClient, {
         forceAll,
         limit,
         retryFailed,
         sample,
         state,
      });
      const snapshotPath = await writeCollectionSnapshot(collection, {
         outputDirectory,
      });
      const snapshotInput = await readSnapshot(snapshotPath);
      const imported = await importSnapshot(client, {
         ...snapshotInput,
         sourceFile: snapshotInput.absolutePath,
      });

      const nextState = updateCollectionState(state, collection);
      const statePath = await writeCollectionState(nextState, {
         outputDirectory,
      });

      return { collection, imported, snapshotPath, statePath };
   } finally {
      if (acquired) {
         await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
            lockName,
         ]);
      }
      client.release();
   }
}

async function main() {
   const options = parseSyncOptions(process.argv.slice(2));
   if (options.help) {
      printHelp();
      return;
   }

   const market = getMarket(options.market);
   const httpClient = new HttpClient({ useCache: !options["no-cache"] });
   const pool = createDatabasePool();

   try {
      const result = await synchronizeMarket({
         market,
         httpClient,
         pool,
         outputDirectory: options.output,
         limit: options.limit,
         retryFailed: options["retry-failed"],
         forceAll: options.all,
         sample: options.sample,
      });
      const { stats } = result.collection;
      const changes = result.imported.offerChanges;
      console.log(
         `Descobertos ${stats.discovered}; elegíveis ${stats.eligible}; ` +
            `inspecionados ${stats.candidatesInspected}.`
      );
      console.log(
         `Produtos ${stats.collected}; rejeitados ${stats.rejected}; ` +
            `ofertas gravadas ${result.imported.offers}.`
      );
      console.log(
         `Preços: ${changes.decreased} descidas, ${changes.increased} subidas, ` +
            `${changes.unchanged} inalterados.`
      );
      console.log(`Snapshot: ${result.snapshotPath}`);
      console.log(`Estado: ${result.statePath}`);
   } finally {
      await pool.end();
   }
}

if (import.meta.url === `file://${process.argv[1]}`) {
   main().catch((error) => {
      if (error.code === "SYNC_ALREADY_RUNNING") {
         console.error(error.message);
         process.exitCode = 3;
         return;
      }
      console.error(`Erro de sincronização: ${error.message}`);
      process.exitCode = 1;
   });
}
