-- Each user connects and syncs their own ERP account (a contractor's
-- clients live in that contractor's own Acumatica tenant), rather than
-- the whole deployment sharing one instance-wide credential set.

CREATE TABLE IF NOT EXISTS user_integration_credentials (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  base_url VARCHAR(500) NOT NULL,
  username VARCHAR(255) NOT NULL,
  encrypted_password TEXT NOT NULL,
  company VARCHAR(255) NOT NULL,
  branch VARCHAR(255),
  endpoint_name VARCHAR(100) NOT NULL DEFAULT 'Default',
  endpoint_version VARCHAR(50) NOT NULL DEFAULT '24.200.001',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_integration_credentials
  ON user_integration_credentials(user_id, provider);

-- erp_links now needs to be scoped per-user too: two different users can
-- sync the same TechBase client into two different Acumatica tenants with
-- different CustomerIDs.
ALTER TABLE erp_links ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS idx_erp_links_local;
DROP INDEX IF EXISTS idx_erp_links_remote;
CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_links_local ON erp_links(user_id, provider, entity_type, local_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_links_remote ON erp_links(user_id, provider, entity_type, remote_id);
