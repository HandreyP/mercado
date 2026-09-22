#!/usr/bin/env node

import { parseArgs } from 'node:util';

import { createDatabaseRepository } from '../repositories/database.repository.js';
import { ImportRepository } from '../repositories/import.repository.js';
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
  const database = createDatabaseRepository();
  const imports = new ImportRepository({ database });
  try {
    const result = await imports.importSnapshot({
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
      console.log(
        `Ofertas: ${result.offerChanges.new} novas, ` +
          `${result.offerChanges.decreased} descidas, ` +
          `${result.offerChanges.increased} subidas, ` +
          `${result.offerChanges.changed} alterações sem mudança de preço e ` +
          `${result.offerChanges.unchanged} inalteradas.`,
      );
    }
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error(`Erro de importação: ${error.message}`);
  process.exitCode = 1;
});
