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

CREATE INDEX IF NOT EXISTS idx_work_orders_client_id ON work_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_equipment_id ON work_orders(equipment_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_to ON work_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_due_date ON work_orders(due_date);

-- One open/active auto-generated work order per equipment at a time,
-- so the scheduled maintenance job never creates duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_orders_one_active_auto_per_equipment
  ON work_orders(equipment_id)
  WHERE auto_generated = TRUE AND status NOT IN ('done', 'cancelled');
