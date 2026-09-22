import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const defaultMigrationsDirectory = new URL('../../db/migrations/', import.meta.url);

function migrationPath(directory, file) {
  return directory instanceof URL ? new URL(file, directory) : join(directory, file);
}

export class MigrationRepository {
  constructor({ database, migrationsDirectory = defaultMigrationsDirectory }) {
    this.database = database;
    this.migrationsDirectory = migrationsDirectory;
  }

  async applyPending() {
    await this.database.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const result = await this.database.query('SELECT version FROM schema_migrations');
    const applied = new Set(result.rows.map(({ version }) => version));
    const files = (await readdir(this.migrationsDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort();
    const executed = [];

    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = await readFile(migrationPath(this.migrationsDirectory, file), 'utf8');
      await this.database.withTransaction(async (client) => {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      });
      executed.push(file);
    }

    return executed;
  }
}
