#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';

import { createDatabasePool } from './pool.js';

const migrationsDirectory = new URL('../../db/migrations/', import.meta.url);

export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedResult = await client.query('SELECT version FROM schema_migrations');
    const applied = new Set(appliedResult.rows.map(({ version }) => version));
    const files = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort();
    const executed = [];

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(new URL(file, migrationsDirectory), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [file],
        );
        await client.query('COMMIT');
        executed.push(file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    return executed;
  } finally {
    client.release();
  }
}

async function main() {
  const pool = createDatabasePool();
  try {
    const executed = await migrate(pool);
    console.log(
      executed.length > 0
        ? `Migrações aplicadas: ${executed.join(', ')}`
        : 'Base de dados atualizada; nenhuma migração pendente.',
    );
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Erro de migração: ${error.message}`);
    process.exitCode = 1;
  });
}
