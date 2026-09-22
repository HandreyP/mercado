const SORT_SQL = {
  name_asc: 'mp.name ASC, mp.id ASC',
  price_asc: 'offer.price_cents ASC, mp.name ASC',
  price_desc: 'offer.price_cents DESC, mp.name ASC',
  unit_price_asc:
    'offer.price_per_base_unit_cents ASC NULLS LAST, mp.name ASC',
  newest: 'offer.observed_at DESC, mp.name ASC',
};

function mapProduct(row) {
  return {
    id: row.id,
    market: { id: row.market_slug, name: row.market_name },
    externalId: row.external_id,
    name: row.name,
    brand: row.brand,
    categories: row.categories,
    image: row.image,
    package: row.package,
    url: row.url,
    offer: {
      currency: row.currency,
      priceCents: row.price_cents,
      originalPriceCents: row.original_price_cents,
      pricePerBaseUnitCents: row.price_per_base_unit_cents,
      baseUnit: row.base_unit,
      promotion: row.promotion,
      promotionEndsAt: row.promotion_ends_at,
      observedAt: row.observed_at,
      previousObservedPriceCents: row.previous_observed_price_cents,
      trend:
        row.previous_observed_price_cents === null
          ? null
          : row.price_cents < row.previous_observed_price_cents
            ? 'down'
            : row.price_cents > row.previous_observed_price_cents
              ? 'up'
              : 'same',
    },
  };
}

export class CatalogRepository {
  constructor({ database }) {
    this.database = database;
  }

  async listProducts(filters) {
    const orderBy = SORT_SQL[filters.sort];
    const result = await this.database.query(
      `SELECT
         mp.id, mp.external_id, mp.name, mp.brand, mp.categories, mp.package,
         mp.url, mp.images->>0 AS image,
         market.slug AS market_slug, market.name AS market_name,
         offer.currency, offer.price_cents, offer.original_price_cents,
         offer.price_per_base_unit_cents, offer.base_unit, offer.promotion,
         offer.promotion_ends_at, offer.observed_at,
         previous_offer.price_cents AS previous_observed_price_cents,
         COUNT(*) OVER()::INTEGER AS total_count
       FROM market_products AS mp
       JOIN markets AS market ON market.id = mp.market_id
       JOIN current_offers AS offer ON offer.market_product_id = mp.id
       LEFT JOIN LATERAL (
         SELECT historical.price_cents
         FROM offers AS historical
         WHERE historical.market_product_id = mp.id
           AND historical.id <> offer.id
         ORDER BY historical.observed_at DESC, historical.id DESC
         LIMIT 1
       ) AS previous_offer ON TRUE
       WHERE ($1 = '' OR mp.name ILIKE '%' || $1 || '%' OR COALESCE(mp.brand, '') ILIKE '%' || $1 || '%')
         AND ($2::BOOLEAN IS NULL OR offer.promotion = $2)
         AND ($3::TEXT IS NULL OR market.slug = $3)
       ORDER BY ${orderBy}
       LIMIT $4 OFFSET $5`,
      [
        filters.search,
        filters.promotion,
        filters.market,
        filters.limit,
        filters.offset,
      ],
    );

    return {
      items: result.rows.map(mapProduct),
      pagination: {
        total: result.rows[0]?.total_count ?? 0,
        limit: filters.limit,
        offset: filters.offset,
      },
    };
  }

  async getProductHistory(productId) {
    const productResult = await this.database.query(
      `SELECT mp.id, mp.external_id, mp.name, mp.brand, mp.url,
              market.slug AS market_slug, market.name AS market_name
       FROM market_products AS mp
       JOIN markets AS market ON market.id = mp.market_id
       WHERE mp.id = $1`,
      [productId],
    );
    if (productResult.rowCount === 0) return null;

    const historyResult = await this.database.query(
      `SELECT observed_at, currency, price_cents, original_price_cents,
              price_per_base_unit_cents, base_unit, promotion, promotion_ends_at
       FROM offers
       WHERE market_product_id = $1
       ORDER BY observed_at ASC`,
      [productId],
    );
    const product = productResult.rows[0];

    return {
      product: {
        id: product.id,
        externalId: product.external_id,
        name: product.name,
        brand: product.brand,
        url: product.url,
        market: { id: product.market_slug, name: product.market_name },
      },
      offers: historyResult.rows.map((row) => ({
        observedAt: row.observed_at,
        currency: row.currency,
        priceCents: row.price_cents,
        originalPriceCents: row.original_price_cents,
        pricePerBaseUnitCents: row.price_per_base_unit_cents,
        baseUnit: row.base_unit,
        promotion: row.promotion,
        promotionEndsAt: row.promotion_ends_at,
      })),
    };
  }

  async getCatalogStats() {
    const result = await this.database.query(`
      SELECT
        (SELECT COUNT(*)::INTEGER FROM markets) AS markets,
        (SELECT COUNT(*)::INTEGER FROM market_products) AS products,
        (SELECT COUNT(*)::INTEGER FROM offers) AS offer_observations,
        (SELECT COUNT(*)::INTEGER FROM current_offers WHERE promotion = TRUE) AS promotions,
        (SELECT MAX(imported_at) FROM scraping_runs) AS last_import_at
    `);
    const row = result.rows[0];
    return {
      markets: row.markets,
      products: row.products,
      offerObservations: row.offer_observations,
      promotions: row.promotions,
      lastImportAt: row.last_import_at,
    };
  }

  async listMarkets() {
    const result = await this.database.query(
      'SELECT slug AS id, name FROM markets ORDER BY name',
    );
    return result.rows;
  }
}
