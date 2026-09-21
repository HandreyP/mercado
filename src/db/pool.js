import pg from 'pg';

const { Pool, types } = pg;

// DATE não tem fuso horário. Mantê-lo como YYYY-MM-DD evita deslocamentos na API.
types.setTypeParser(1082, (value) => value);

const DEFAULT_DATABASE_URL =
  'postgresql://mercado:mercado@localhost:5432/mercado';

export function createDatabasePool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
  });
}
