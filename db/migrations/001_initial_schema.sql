CREATE TABLE markets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE scraping_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  market_id BIGINT NOT NULL REFERENCES markets(id),
  snapshot_sha256 CHAR(64) NOT NULL UNIQUE,
  source_file TEXT NOT NULL,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'partial', 'failed')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ NOT NULL,
  stats JSONB NOT NULL DEFAULT '{}'::JSONB,
  quality JSONB NOT NULL DEFAULT '{}'::JSONB,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE market_products (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  market_id BIGINT NOT NULL REFERENCES markets(id),
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  description TEXT,
  categories TEXT[] NOT NULL DEFAULT '{}',
  url TEXT NOT NULL,
  images JSONB NOT NULL DEFAULT '[]'::JSONB,
  package JSONB,
  source_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market_id, external_id)
);

CREATE TABLE offers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  market_product_id BIGINT NOT NULL REFERENCES market_products(id) ON DELETE CASCADE,
  scraping_run_id BIGINT NOT NULL REFERENCES scraping_runs(id),
  observed_at TIMESTAMPTZ NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  original_price_cents INTEGER CHECK (original_price_cents IS NULL OR original_price_cents > 0),
  price_per_base_unit_cents INTEGER CHECK (price_per_base_unit_cents IS NULL OR price_per_base_unit_cents > 0),
  base_unit TEXT,
  promotion BOOLEAN NOT NULL DEFAULT FALSE,
  promotion_ends_at DATE,
  promotion_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market_product_id, observed_at)
);

CREATE TABLE raw_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  market_product_id BIGINT NOT NULL REFERENCES market_products(id) ON DELETE CASCADE,
  scraping_run_id BIGINT NOT NULL REFERENCES scraping_runs(id),
  source_type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scraping_run_id, market_product_id)
);

CREATE TABLE scraping_errors (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scraping_run_id BIGINT NOT NULL REFERENCES scraping_runs(id) ON DELETE CASCADE,
  external_id TEXT,
  url TEXT NOT NULL,
  last_modified TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('rejected', 'error')),
  errors JSONB NOT NULL DEFAULT '[]'::JSONB,
  warnings JSONB NOT NULL DEFAULT '[]'::JSONB,
  attempted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scraping_run_id, external_id)
);

CREATE INDEX market_products_name_search_idx
  ON market_products USING GIN (to_tsvector('portuguese', name || ' ' || COALESCE(brand, '')));
CREATE INDEX market_products_categories_idx ON market_products USING GIN (categories);
CREATE INDEX offers_product_observed_idx ON offers (market_product_id, observed_at DESC);
CREATE INDEX offers_price_idx ON offers (price_cents);
CREATE INDEX offers_promotion_idx ON offers (promotion) WHERE promotion = TRUE;
CREATE INDEX scraping_runs_market_finished_idx ON scraping_runs (market_id, finished_at DESC);

CREATE VIEW current_offers AS
SELECT DISTINCT ON (offer.market_product_id)
  offer.*
FROM offers AS offer
ORDER BY offer.market_product_id, offer.observed_at DESC, offer.id DESC;
