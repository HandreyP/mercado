#!/usr/bin/env node

import { parseArgs } from 'node:util';

import { importSnapshot } from './importer.js';
import { createDatabasePool } from './pool.js';
import { readSnapshot } from './snapshot.js';

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: 'string', short: 'f' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });

  if (values.help) {
    console.log('Utilização: npm run import -- --file <snapshot.json>');
    return;
  }
  if (!values.file) throw new Error('A opção --file é obrigatória');

  const input = await readSnapshot(values.file);
  const pool = createDatabasePool();
  try {
    const client = await pool.connect();
    try {
      const result = await importSnapshot(client, {
        ...input,
        sourceFile: input.absolutePath,
      });
      if (result.alreadyImported) {
        console.log(`Snapshot já importado na execução ${result.runId}.`);
      } else {
        console.log(
          `Execução ${result.runId}: ${result.products} produtos, ` +
            `${result.offers} ofertas e ${result.errors} erros importados.`,
        );
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Erro de importação: ${error.message}`);
  process.exitCode = 1;
});
