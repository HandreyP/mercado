function operationalStats(result) {
  return {
    ...(result.collection?.stats ?? {}),
    importedProducts: result.imported?.products ?? 0,
    importedOffers: result.imported?.offers ?? 0,
    offerChanges: result.imported?.offerChanges ?? {},
  };
}

function errorCode(error) {
  return error.code ?? error.cause?.code ?? null;
}

export class SyncExecutionRepository {
  constructor({ database }) {
    this.database = database;
  }

  start({ batchId, market, attempt, trigger }) {
    return this.database.withTransaction(async (client) => {
      const marketResult = await client.query(
        `INSERT INTO markets (slug, name)
         VALUES ($1, $2)
         ON CONFLICT (slug) DO UPDATE
           SET name = EXCLUDED.name, updated_at = NOW()
         RETURNING id`,
        [market.id, market.name],
      );
      const result = await client.query(
        `INSERT INTO sync_executions (
           batch_id, market_id, attempt, trigger, status
         )
         VALUES ($1, $2, $3, $4, 'running')
         RETURNING id, started_at`,
        [batchId, marketResult.rows[0].id, attempt, trigger],
      );
      return result.rows[0];
    });
  }

  async complete(id, { result }) {
    await this.database.query(
      `UPDATE sync_executions
       SET status = 'completed', finished_at = NOW(), stats = $2::jsonb
       WHERE id = $1`,
      [id, JSON.stringify(operationalStats(result))],
    );
  }

  async fail(id, { error }) {
    await this.database.query(
      `UPDATE sync_executions
       SET status = 'failed', finished_at = NOW(),
           error_code = $2, error_message = $3
       WHERE id = $1`,
      [id, errorCode(error), error.message],
    );
  }

  async listLatest() {
    const result = await this.database.query(`
      SELECT
        market.slug AS market_id,
        market.name AS market_name,
        latest.batch_id,
        latest.status,
        latest.attempt,
        latest.trigger,
        latest.started_at,
        latest.finished_at,
        latest.error_code,
        latest.error_message,
        latest.stats,
        ROUND(EXTRACT(EPOCH FROM (
          COALESCE(latest.finished_at, NOW()) - latest.started_at
        )) * 1000)::BIGINT AS duration_ms,
        successful.finished_at AS last_success_at
      FROM markets AS market
      JOIN LATERAL (
        SELECT execution.*
        FROM sync_executions AS execution
        WHERE execution.market_id = market.id
        ORDER BY execution.started_at DESC, execution.id DESC
        LIMIT 1
      ) AS latest ON TRUE
      LEFT JOIN LATERAL (
        SELECT execution.finished_at
        FROM sync_executions AS execution
        WHERE execution.market_id = market.id
          AND execution.status = 'completed'
        ORDER BY execution.finished_at DESC, execution.id DESC
        LIMIT 1
      ) AS successful ON TRUE
      ORDER BY market.name
    `);

    return result.rows.map((row) => ({
      market: { id: row.market_id, name: row.market_name },
      batchId: row.batch_id,
      status: row.status,
      attempt: row.attempt,
      trigger: row.trigger,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      error:
        row.error_code || row.error_message
          ? { code: row.error_code, message: row.error_message }
          : null,
      stats: row.stats,
      durationMs: Number(row.duration_ms),
      lastSuccessAt: row.last_success_at,
    }));
  }
}
