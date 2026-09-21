function json(value) {
  return JSON.stringify(value ?? null);
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
  const observedAt = product.collectedAt;
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
      observedAt,
    ],
  );
  return result.rows[0].id;
}

async function insertOffer(client, marketProductId, runId, product) {
  const offer = product.offer;
  const result = await client.query(
    `INSERT INTO offers (
       market_product_id, scraping_run_id, observed_at, currency, price_cents,
       original_price_cents, price_per_base_unit_cents, base_unit, promotion,
       promotion_ends_at, promotion_text
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (market_product_id, observed_at) DO NOTHING`,
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
  return result.rowCount;
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

export async function importSnapshot(client, { snapshot, sourceFile, hash }) {
  await client.query('BEGIN');
  try {
    const marketId = await upsertMarket(client, snapshot.market);
    const runId = await createRun(client, marketId, snapshot, sourceFile, hash);

    if (!runId) {
      const existing = await client.query(
        'SELECT id FROM scraping_runs WHERE snapshot_sha256 = $1',
        [hash],
      );
      await client.query('COMMIT');
      return {
        alreadyImported: true,
        runId: existing.rows[0].id,
        products: 0,
        offers: 0,
        errors: 0,
      };
    }

    let offers = 0;
    for (const product of snapshot.products) {
      const marketProductId = await upsertProduct(client, marketId, product);
      offers += await insertOffer(client, marketProductId, runId, product);
      await insertRawDocument(client, marketProductId, runId, product);
    }

    for (const rejected of snapshot.rejected) {
      await insertError(client, runId, rejected, snapshot.finishedAt);
    }

    await client.query('COMMIT');
    return {
      alreadyImported: false,
      runId,
      products: snapshot.products.length,
      offers,
      errors: snapshot.rejected.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
