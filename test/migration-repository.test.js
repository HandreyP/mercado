import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { MigrationRepository } from '../src/repositories/migration.repository.js';

test('aplica apenas migrações pendentes por ordem e dentro de transações', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'mercado-migrations-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  await writeFile(join(directory, '002_second.sql'), 'SELECT 2;');
  await writeFile(join(directory, '001_first.sql'), 'SELECT 1;');
  await writeFile(join(directory, 'README.md'), 'ignorar');

  const operations = [];
  const client = {
    async query(sql, params = []) {
      operations.push({ params, sql });
      return { rows: [] };
    },
  };
  const database = {
    async query(sql) {
      operations.push({ params: [], sql });
      if (sql.startsWith('SELECT version')) {
        return { rows: [{ version: '001_first.sql' }] };
      }
      return { rows: [] };
    },
    async withTransaction(operation) {
      operations.push({ transaction: 'begin' });
      const result = await operation(client);
      operations.push({ transaction: 'commit' });
      return result;
    },
  };

  const repository = new MigrationRepository({ database, migrationsDirectory: directory });
  const executed = await repository.applyPending();

  assert.deepEqual(executed, ['002_second.sql']);
  assert.equal(operations.filter(({ transaction }) => transaction === 'begin').length, 1);
  assert.ok(operations.some(({ sql }) => sql === 'SELECT 2;'));
  assert.ok(
    operations.some(
      ({ params, sql }) =>
        sql?.startsWith('INSERT INTO schema_migrations') && params[0] === '002_second.sql',
    ),
  );
  assert.equal(operations.some(({ sql }) => sql === 'SELECT 1;'), false);
});

test('não executa transações quando todas as migrações já foram aplicadas', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'mercado-migrations-'));
  t.after(() => rm(directory, { force: true, recursive: true }));
  await writeFile(join(directory, '001_first.sql'), 'SELECT 1;');

  let transactionCount = 0;
  const database = {
    async query(sql) {
      return sql.startsWith('SELECT version')
        ? { rows: [{ version: '001_first.sql' }] }
        : { rows: [] };
    },
    async withTransaction() {
      transactionCount += 1;
    },
  };

  const repository = new MigrationRepository({ database, migrationsDirectory: directory });

  assert.deepEqual(await repository.applyPending(), []);
  assert.equal(transactionCount, 0);
});
