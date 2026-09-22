function json(value) {
  return JSON.stringify(value ?? null);
}

function emptyOfferChanges() {
  return {
    inserted: 0,
    unchanged: 0,
    new: 0,
    decreased: 0,
    increased: 0,
    changed: 0,
  };
}

async function upsertMarket(client, market) {
  const result = await client.query(
    `INSERT INTO markets (slug, name)
     VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name, updated_at = NOW()
     RETURNING id`,
    [market.id, market.name],
  );
  return result.rows[0].id;
}

async function createRun(client, marketId, snapshot, sourceFile, hash) {
  const result = await client.query(
    `INSERT INTO scraping_runs (
       market_id, snapshot_sha256, source_file, source_type, status,
       started_at, finished_at, stats, quality
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
     ON CONFLICT (snapshot_sha256) DO NOTHING
     RETURNING id`,
    [
      marketId,
      hash,
      sourceFile,
      snapshot.source?.type ?? 'product-pages',
      snapshot.rejected.length > 0 ? 'partial' : 'completed',
      snapshot.startedAt ?? null,
      snapshot.finishedAt,
      json(snapshot.stats ?? {}),
      json(snapshot.quality ?? {}),
    ],
  );
  return result.rows[0]?.id ?? null;
}

async function upsertProduct(client, marketId, product) {
  const result = await client.query(
    `INSERT INTO market_products (
       market_id, external_id, name, brand, description, categories, url,
       images, package, source_metadata, first_seen_at, last_seen_at
     )
     VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8::jsonb, $9::jsonb,
             $10::jsonb, $11, $11)
     ON CONFLICT (market_id, external_id) DO UPDATE SET
       name = EXCLUDED.name,
       brand = EXCLUDED.brand,
       description = EXCLUDED.description,
       categories = EXCLUDED.categories,
       url = EXCLUDED.url,
       images = EXCLUDED.images,
       package = EXCLUDED.package,
       source_metadata = EXCLUDED.source_metadata,
       last_seen_at = GREATEST(market_products.last_seen_at, EXCLUDED.last_seen_at),
       updated_at = NOW()
     RETURNING id`,
    [
      marketId,
      product.externalId,
      product.name,
      product.brand ?? null,
      product.description ?? null,
      product.categories ?? [],
      product.url,
      json(product.images ?? []),
      json(product.package),
      json({ source: product.source, warnings: product.warnings ?? [] }),
      product.collectedAt,
    ],
  );
  return result.rows[0].id;
}

async function insertOffer(client, marketProductId, runId, product) {
  const offer = product.offer;
  const result = await client.query(
    `WITH previous AS MATERIALIZED (
       SELECT currency, price_cents, original_price_cents,
              price_per_base_unit_cents, base_unit, promotion,
              promotion_ends_at, promotion_text
       FROM current_offers
       WHERE market_product_id = $1
     ), inserted AS (
       INSERT INTO offers (
         market_product_id, scraping_run_id, observed_at, currency, price_cents,
         original_price_cents, price_per_base_unit_cents, base_unit, promotion,
         promotion_ends_at, promotion_text
       )
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
       WHERE NOT EXISTS (
         SELECT 1 FROM previous
         WHERE currency = $4
           AND price_cents = $5
           AND original_price_cents IS NOT DISTINCT FROM $6::INTEGER
           AND price_per_base_unit_cents IS NOT DISTINCT FROM $7::INTEGER
           AND base_unit IS NOT DISTINCT FROM $8::TEXT
           AND promotion = $9
           AND promotion_ends_at IS NOT DISTINCT FROM $10::DATE
           AND promotion_text IS NOT DISTINCT FROM $11::TEXT
       )
       ON CONFLICT (market_product_id, observed_at) DO NOTHING
       RETURNING price_cents
     )
     SELECT
       EXISTS (SELECT 1 FROM inserted) AS inserted,
       (SELECT price_cents FROM previous) AS previous_price_cents`,
    [
      marketProductId,
      runId,
      product.collectedAt,
      offer.currency ?? 'EUR',
      offer.priceCents,
      offer.originalPriceCents ?? null,
      offer.pricePerBaseUnitCents ?? null,
      offer.baseUnit ?? null,
      Boolean(offer.promotion),
      offer.promotionEndsAt ?? null,
      offer.promotionText ?? null,
    ],
  );
  const row = result.rows[0];
  if (!row.inserted) return 'unchanged';
  if (row.previous_price_cents === null) return 'new';
  if (offer.priceCents < row.previous_price_cents) return 'decreased';
  if (offer.priceCents > row.previous_price_cents) return 'increased';
  return 'changed';
}

async function insertRawDocument(client, marketProductId, runId, product) {
  await client.query(
    `INSERT INTO raw_documents (
       market_product_id, scraping_run_id, source_type, source_url,
       collected_at, payload
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (scraping_run_id, market_product_id) DO NOTHING`,
    [
      marketProductId,
      runId,
      product.source?.type ?? 'product-page',
      product.source?.url ?? product.url,
      product.collectedAt,
      json(product),
    ],
  );
}

async function insertError(client, runId, rejected, fallbackAttemptedAt) {
  await client.query(
    `INSERT INTO scraping_errors (
       scraping_run_id, external_id, url, last_modified, status,
       errors, warnings, attempted_at
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
     ON CONFLICT (scraping_run_id, external_id) DO NOTHING`,
    [
      runId,
      rejected.externalId ?? null,
      rejected.url,
      rejected.lastModified ?? null,
      rejected.status ?? 'rejected',
      json(rejected.errors ?? []),
      json(rejected.warnings ?? []),
      rejected.attemptedAt ?? fallbackAttemptedAt,
    ],
  );
}

async function importWithinTransaction(client, { snapshot, sourceFile, hash }) {
  const marketId = await upsertMarket(client, snapshot.market);
  const runId = await createRun(client, marketId, snapshot, sourceFile, hash);

  if (!runId) {
    const existing = await client.query(
      'SELECT id FROM scraping_runs WHERE snapshot_sha256 = $1',
      [hash],
    );
    return {
      alreadyImported: true,
      runId: existing.rows[0].id,
      products: 0,
      offers: 0,
      offerChanges: emptyOfferChanges(),
      errors: 0,
    };
  }

  const offerChanges = emptyOfferChanges();
  for (const product of snapshot.products) {
    const marketProductId = await upsertProduct(client, marketId, product);
    const status = await insertOffer(client, marketProductId, runId, product);
    offerChanges[status] += 1;
    if (status !== 'unchanged') offerChanges.inserted += 1;
    await insertRawDocument(client, marketProductId, runId, product);
  }

  for (const rejected of snapshot.rejected) {
    await insertError(client, runId, rejected, snapshot.finishedAt);
  }

  return {
    alreadyImported: false,
    runId,
    products: snapshot.products.length,
    offers: offerChanges.inserted,
    offerChanges,
    errors: snapshot.rejected.length,
  };
}

export class ImportRepository {
  constructor({ database }) {
    this.database = database;
  }

  importSnapshot(input, { client = null } = {}) {
    return this.database.withTransaction(
      (transactionClient) => importWithinTransaction(transactionClient, input),
      { client },
    );
  }
}
