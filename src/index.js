#!/usr/bin/env node

import { parseArgs } from 'node:util';

import { collectProducts } from './core/collect-products.js';
import { discoverProductCandidates } from './core/discover-products.js';
import { HttpClient } from './core/http-client.js';
import {
  getMarketScraper,
  listMarketScrapers,
} from './scrapers/market-scrapers.js';
import {
  readCollectionState,
  updateCollectionState,
  writeCollectionState,
} from './services/collection-state-repository.js';
import { writeCollectionSnapshot } from './services/json-repository.js';

function showHelp() {
  console.log(`Utilização:
  npm run discover -- [--market pingo-doce] [--limit 3]
  npm run collect  -- [--market pingo-doce] [--limit 50] [--output data]

Opções:
  --market         Adaptador a utilizar (predefinição: pingo-doce)
  --limit          Número de produtos válidos (predefinição: 3)
  --output         Diretório do estado e snapshots (predefinição: data)
  --changed-only   Processar apenas novos/alterados (comportamento predefinido)
  --retry-failed   Repetir também produtos anteriormente rejeitados/com erro
  --all            Forçar a recolha mesmo quando o lastmod não mudou
  --sample         Espalhar a seleção pelo catálogo para validação
  --no-cache       Ignorar e não atualizar a cache HTTP
  --help           Mostrar esta ajuda

Supermercados disponíveis:
${listMarketScrapers().map((market) => `  - ${market.id}: ${market.name}`).join('\n')}`);
}

function readOptions(args) {
  const { values } = parseArgs({
    args,
    options: {
      market: { type: 'string', default: 'pingo-doce' },
      limit: { type: 'string', default: '3' },
      output: { type: 'string', default: 'data' },
      'changed-only': { type: 'boolean', default: false },
      'retry-failed': { type: 'boolean', default: false },
      all: { type: 'boolean', default: false },
      sample: { type: 'boolean', default: false },
      'no-cache': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });
  const limit = Number(values.limit);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('--limit deve ser um número inteiro entre 1 e 100');
  }
  if (values.all && values['changed-only']) {
    throw new Error('--all e --changed-only não podem ser usados em conjunto');
  }

  return { ...values, limit };
}

async function main() {
  const [command = 'help', ...args] = process.argv.slice(2);
  const options = readOptions(args);

  if (command === 'help' || options.help) {
    showHelp();
    return;
  }

  const market = getMarketScraper(options.market);
  const httpClient = new HttpClient({ useCache: !options['no-cache'] });

  if (command === 'discover') {
    const products = await discoverProductCandidates(market, httpClient, {
      limit: options.limit,
    });
    console.log(JSON.stringify(products, null, 2));
    return;
  }

  if (command === 'collect') {
    const state = await readCollectionState(market.id, {
      outputDirectory: options.output,
    });
    const collection = await collectProducts(market, httpClient, {
      forceAll: options.all,
      limit: options.limit,
      retryFailed: options['retry-failed'],
      sample: options.sample,
      state,
    });
    const outputPath = await writeCollectionSnapshot(collection, {
      outputDirectory: options.output,
    });
    const nextState = updateCollectionState(state, collection);
    const statePath = await writeCollectionState(nextState, {
      outputDirectory: options.output,
    });
    console.log(
      `Descobertos ${collection.stats.discovered}: ${collection.stats.new} novos, ` +
        `${collection.stats.changed} alterados e ${collection.stats.unchanged} inalterados.`,
    );
    console.log(
      `Elegíveis ${collection.stats.eligible}; inspecionados ` +
        `${collection.stats.candidatesInspected}; recolhidos ${collection.stats.collected}; ` +
        `rejeitados ${collection.stats.rejected}.`,
    );
    console.log(`Snapshot: ${outputPath}`);
    console.log(`Estado: ${statePath}`);
    const expected = Math.min(collection.stats.requested, collection.stats.eligible);
    if (collection.stats.collected < expected) process.exitCode = 2;
    return;
  }

  throw new Error(`Comando desconhecido: ${command}`);
}

main().catch((error) => {
  console.error(`Erro: ${error.message}`);
  process.exitCode = 1;
});
