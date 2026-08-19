-- Tracks which local records are linked to which remote ERP records, so
-- syncs are idempotent (update instead of re-creating) across any number
-- of ERP providers/entity types.
CREATE TABLE IF NOT EXISTS erp_links (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  local_id INTEGER NOT NULL,
  remote_id VARCHAR(100) NOT NULL,
  last_synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_links_local ON erp_links(provider, entity_type, local_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_links_remote ON erp_links(provider, entity_type, remote_id);
