ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(50) NOT NULL DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_identity
  ON users (provider, provider_id)
  WHERE provider_id IS NOT NULL;
