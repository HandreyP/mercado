import pg from 'pg';

const { Pool, types } = pg;

const DEFAULT_DATABASE_URL =
  'postgresql://mercado:mercado@localhost:5432/mercado';

// DATE não tem fuso horário. Mantê-lo como YYYY-MM-DD evita deslocamentos na API.
types.setTypeParser(1082, (value) => value);

function defaultPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
  });
}

export class DatabaseRepository {
  constructor({ pool = defaultPool() } = {}) {
    this.pool = pool;
  }

  query(sql, parameters) {
    return this.pool.query(sql, parameters);
  }

  async healthCheck() {
    await this.query('SELECT 1');
  }

  async withTransaction(operation, { client: existingClient = null } = {}) {
    const client = existingClient ?? (await this.pool.connect());
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      if (!existingClient) client.release();
    }
  }

  async withAdvisoryLock(lockName, operation) {
    const client = await this.pool.connect();
    let acquired = false;
    try {
      const lockResult = await client.query(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
        [lockName],
      );
      acquired = lockResult.rows[0].acquired;
      if (!acquired) {
        const error = new Error(`Já existe uma operação ativa para ${lockName}`);
        error.code = 'SYNC_ALREADY_RUNNING';
        throw error;
      }
      return await operation(client);
    } finally {
      if (acquired) {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockName]);
      }
      client.release();
    }
  }

  close() {
    return this.pool.end();
  }
}

export function createDatabaseRepository() {
  return new DatabaseRepository();
}
