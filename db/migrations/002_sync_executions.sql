CREATE TABLE sync_executions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id UUID NOT NULL,
  market_id BIGINT NOT NULL REFERENCES markets(id),
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  trigger TEXT NOT NULL CHECK (trigger IN ('manual', 'cron')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  stats JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, attempt),
  CHECK (
    (status = 'running' AND finished_at IS NULL) OR
    (status IN ('completed', 'failed') AND finished_at IS NOT NULL)
  )
);

CREATE INDEX sync_executions_market_started_idx
  ON sync_executions (market_id, started_at DESC);

CREATE INDEX sync_executions_status_started_idx
  ON sync_executions (status, started_at DESC);
