CREATE TABLE canonical_products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seed_market_product_id BIGINT UNIQUE
    REFERENCES market_products(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  brand TEXT,
  normalized_name TEXT NOT NULL,
  normalized_brand TEXT,
  package_quantity NUMERIC,
  package_unit TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_matches (
  canonical_product_id BIGINT NOT NULL
    REFERENCES canonical_products(id) ON DELETE CASCADE,
  market_product_id BIGINT NOT NULL UNIQUE
    REFERENCES market_products(id) ON DELETE CASCADE,
  confidence NUMERIC(4, 3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  method TEXT NOT NULL CHECK (method IN ('automatic', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('suggested', 'confirmed', 'rejected')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (canonical_product_id, market_product_id)
);

CREATE INDEX canonical_products_identity_idx
  ON canonical_products (normalized_name, normalized_brand, package_unit, package_quantity);

CREATE INDEX product_matches_canonical_idx
  ON product_matches (canonical_product_id, status);

INSERT INTO canonical_products (
  seed_market_product_id,
  display_name,
  brand,
  normalized_name,
  normalized_brand,
  package_quantity,
  package_unit
)
SELECT
  product.id,
  product.name,
  product.brand,
  LOWER(REGEXP_REPLACE(
    TRANSLATE(product.name, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
                            'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'),
    '[^a-zA-Z0-9]+', ' ', 'g'
  )),
  CASE WHEN product.brand IS NULL THEN NULL ELSE LOWER(REGEXP_REPLACE(
    TRANSLATE(product.brand, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
                            'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'),
    '[^a-zA-Z0-9]+', ' ', 'g'
  )) END,
  (product.package->>'normalizedQuantity')::NUMERIC,
  product.package->>'normalizedUnit'
FROM market_products AS product;

INSERT INTO product_matches (
  canonical_product_id,
  market_product_id,
  confidence,
  method,
  status,
  reason
)
SELECT
  canonical.id,
  canonical.seed_market_product_id,
  1,
  'automatic',
  'confirmed',
  'initial_backfill'
FROM canonical_products AS canonical
WHERE canonical.seed_market_product_id IS NOT NULL;
