#!/usr/bin/env node

import { createDatabaseRepository } from '../repositories/database.repository.js';
import { MigrationRepository } from '../repositories/migration.repository.js';

async function main() {
  const database = createDatabaseRepository();
  const migrations = new MigrationRepository({ database });

  try {
    const executed = await migrations.applyPending();
    console.log(
      executed.length > 0
        ? `Migrações aplicadas: ${executed.join(', ')}`
        : 'Base de dados atualizada; nenhuma migração pendente.',
    );
  } finally {
    await database.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Erro de migração: ${error.message}`);
    process.exitCode = 1;
  });
}
