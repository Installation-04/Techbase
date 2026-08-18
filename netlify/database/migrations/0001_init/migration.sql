CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW()
);

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

CREATE INDEX IF NOT EXISTS idx_equipment_client_id ON equipment(client_id);
CREATE INDEX IF NOT EXISTS idx_procedures_client_id ON procedures(client_id);
CREATE INDEX IF NOT EXISTS idx_passwords_client_id ON passwords(client_id);
CREATE INDEX IF NOT EXISTS idx_contacts_client_id ON contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_epi_client_id ON epi(client_id);
CREATE INDEX IF NOT EXISTS idx_logbook_client_id ON logbook(client_id);
CREATE INDEX IF NOT EXISTS idx_logbook_user_id ON logbook(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_client_id ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm ON clients USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_equipment_name_trgm ON equipment USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm ON contacts USING GIN (name gin_trgm_ops);
