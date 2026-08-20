// Idempotent schema definition, applied on every cold start (see
// app.js's init()) so the app self-heals regardless of how the Postgres
// database was provisioned. Docker Compose also mounts backend/db/init.sql
// directly into Postgres's docker-entrypoint-initdb.d/ for local installs —
// keep both in sync when the schema changes.
module.exports = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  provider VARCHAR(50) NOT NULL DEFAULT 'local',
  provider_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_identity
  ON users (provider, provider_id)
  WHERE provider_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  contract_number VARCHAR(100),
  manager VARCHAR(255),
  address TEXT,
  phone VARCHAR(50),
  email VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipment (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  serial_number VARCHAR(255),
  installation_date DATE,
  last_maintenance DATE,
  next_maintenance DATE,
  status VARCHAR(50) DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS procedures (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'onsite',
  content TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS passwords (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  username VARCHAR(255),
  encrypted_password TEXT NOT NULL,
  url VARCHAR(500),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS epi (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  quantity INTEGER DEFAULT 1,
  expiry_date DATE,
  location VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logbook (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  entry_date TIMESTAMP DEFAULT NOW(),
  title VARCHAR(255) NOT NULL,
  content TEXT,
  type VARCHAR(50) DEFAULT 'note',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mimetype VARCHAR(100),
  size INTEGER,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_orders (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  equipment_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date DATE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  auto_generated BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT work_orders_status_check CHECK (status IN ('open', 'assigned', 'in_progress', 'done', 'cancelled')),
  CONSTRAINT work_orders_priority_check CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  link VARCHAR(500),
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Per-user ERP link/credentials: each user syncs their own clients into
-- their own ERP tenant, not one shared instance-wide account.
CREATE TABLE IF NOT EXISTS erp_links (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  local_id INTEGER NOT NULL,
  remote_id VARCHAR(100) NOT NULL,
  last_synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

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

CREATE INDEX IF NOT EXISTS idx_equipment_client_id ON equipment(client_id);
CREATE INDEX IF NOT EXISTS idx_procedures_client_id ON procedures(client_id);
CREATE INDEX IF NOT EXISTS idx_passwords_client_id ON passwords(client_id);
CREATE INDEX IF NOT EXISTS idx_contacts_client_id ON contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_epi_client_id ON epi(client_id);
CREATE INDEX IF NOT EXISTS idx_logbook_client_id ON logbook(client_id);
CREATE INDEX IF NOT EXISTS idx_logbook_user_id ON logbook(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_client_id ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_work_orders_client_id ON work_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_equipment_id ON work_orders(equipment_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_to ON work_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_due_date ON work_orders(due_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_orders_one_active_auto_per_equipment
  ON work_orders(equipment_id)
  WHERE auto_generated = TRUE AND status NOT IN ('done', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id) WHERE read = FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_links_local ON erp_links(user_id, provider, entity_type, local_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_links_remote ON erp_links(user_id, provider, entity_type, remote_id);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm ON clients USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_equipment_name_trgm ON equipment USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm ON contacts USING GIN (name gin_trgm_ops);
`;
