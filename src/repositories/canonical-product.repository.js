import { canonicalProductIdentity } from '../services/canonical-product.service.js';

export class CanonicalProductRepository {
  constructor({ database }) {
    this.database = database;
  }

  async ensureForMarketProduct(client, { marketProductId, product }) {
    const existing = await client.query(
      `SELECT canonical_product_id
       FROM product_matches
       WHERE market_product_id = $1`,
      [marketProductId],
    );
    if (existing.rows[0]) return existing.rows[0].canonical_product_id;

    const identity = canonicalProductIdentity(product);
    const canonical = await client.query(
      `INSERT INTO canonical_products (
         seed_market_product_id, display_name, brand, normalized_name,
         normalized_brand, package_quantity, package_unit
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (seed_market_product_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         brand = EXCLUDED.brand,
         normalized_name = EXCLUDED.normalized_name,
         normalized_brand = EXCLUDED.normalized_brand,
         package_quantity = EXCLUDED.package_quantity,
         package_unit = EXCLUDED.package_unit,
         updated_at = NOW()
       RETURNING id`,
      [
        marketProductId,
        identity.displayName,
        identity.brand,
        identity.normalizedName,
        identity.normalizedBrand,
        identity.packageQuantity,
        identity.packageUnit,
      ],
    );
    const canonicalProductId = canonical.rows[0].id;
    await client.query(
      `INSERT INTO product_matches (
         canonical_product_id, market_product_id, confidence, method, status, reason
       )
       VALUES ($1, $2, 1, 'automatic', 'confirmed', 'initial_identity')
       ON CONFLICT (market_product_id) DO NOTHING`,
      [canonicalProductId, marketProductId],
    );
    return canonicalProductId;
  }

  async getById(id) {
    const canonicalResult = await this.database.query(
      `SELECT id, display_name, brand, package_quantity, package_unit
       FROM canonical_products
       WHERE id = $1`,
      [id],
    );
    if (canonicalResult.rowCount === 0) return null;

    const matchesResult = await this.database.query(
      `SELECT
         product.id,
         product.external_id,
         product.name,
         market.slug AS market_id,
         market.name AS market_name,
         match.confidence,
         match.method,
         match.status,
         offer.price_cents,
         offer.currency
       FROM product_matches AS match
       JOIN market_products AS product ON product.id = match.market_product_id
       JOIN markets AS market ON market.id = product.market_id
       LEFT JOIN current_offers AS offer ON offer.market_product_id = product.id
       WHERE match.canonical_product_id = $1
         AND match.status <> 'rejected'
       ORDER BY market.name, product.name`,
      [id],
    );
    const canonical = canonicalResult.rows[0];

    return {
      id: canonical.id,
      displayName: canonical.display_name,
      brand: canonical.brand,
      packageQuantity:
        canonical.package_quantity === null
          ? null
          : Number(canonical.package_quantity),
      packageUnit: canonical.package_unit,
      matches: matchesResult.rows.map((row) => ({
        id: row.id,
        externalId: row.external_id,
        name: row.name,
        market: { id: row.market_id, name: row.market_name },
        confidence: Number(row.confidence),
        method: row.method,
        status: row.status,
        offer:
          row.price_cents === null
            ? null
            : { currency: row.currency, priceCents: row.price_cents },
      })),
    };
  }
}
