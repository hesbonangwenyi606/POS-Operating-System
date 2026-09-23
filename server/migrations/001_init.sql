-- Open Doors Laundromat POS - PostgreSQL Schema Migration v1
-- Run: psql -d open_doors_pos -f 001_init.sql

-- Branches
CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())
);

-- Roles
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  permissions TEXT NOT NULL
);

-- Employees
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cashier',
  branch_id INTEGER REFERENCES branches(id),
  active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  phone TEXT,
  name TEXT NOT NULL,
  email TEXT,
  alternate_phone TEXT,
  address TEXT,
  loyalty_tier TEXT DEFAULT 'bronze',
  status TEXT DEFAULT 'active',
  lifetime_spend INTEGER DEFAULT 0,
  order_count INTEGER DEFAULT 0,
  last_visit INTEGER,
  created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())
);

-- Services
CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  unit TEXT DEFAULT 'item',
  express_available INTEGER DEFAULT 1,
  express_surcharge_percent INTEGER DEFAULT 30,
  tax_category TEXT DEFAULT 'standard',
  active INTEGER DEFAULT 1,
  barcode TEXT
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  cashier_id INTEGER REFERENCES employees(id),
  branch_id INTEGER REFERENCES branches(id),
  status TEXT DEFAULT 'Received',
  due_date INTEGER,
  payment_status TEXT DEFAULT 'pending',
  subtotal INTEGER DEFAULT 0,
  discount INTEGER DEFAULT 0,
  surcharge INTEGER DEFAULT 0,
  tax INTEGER DEFAULT 0,
  total INTEGER NOT NULL,
  amount_paid INTEGER DEFAULT 0,
  balance INTEGER DEFAULT 0,
  payment_method TEXT,
  fulfilment TEXT DEFAULT 'collection',
  turnaround TEXT DEFAULT 'Normal',
  notes TEXT,
  care_notes TEXT,
  cancellation_reason TEXT,
  cancelled_at INTEGER,
  is_deleted INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())
);

-- Order Items
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  service_id INTEGER REFERENCES services(id),
  sku TEXT,
  description TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price INTEGER NOT NULL,
  discount INTEGER DEFAULT 0,
  surcharge INTEGER DEFAULT 0,
  line_total INTEGER NOT NULL
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  amount INTEGER NOT NULL,
  method TEXT NOT NULL,
  reference TEXT,
  status TEXT DEFAULT 'completed',
  cashier_id INTEGER REFERENCES employees(id),
  type TEXT DEFAULT 'sale',
  created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())
);

-- Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  old_value TEXT,
  new_value TEXT,
  device TEXT,
  ip TEXT,
  timestamp INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())
);

-- Sync Queue
CREATE TABLE IF NOT EXISTS sync_queue (
  id SERIAL PRIMARY KEY,
  entity TEXT,
  entity_id INTEGER,
  action TEXT,
  payload TEXT,
  status TEXT DEFAULT 'pending',
  retries INTEGER DEFAULT 0,
  idempotency_key TEXT UNIQUE,
  created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW()),
  synced_at INTEGER
);

-- Cash Shifts
CREATE TABLE IF NOT EXISTS cash_shifts (
  id SERIAL PRIMARY KEY,
  cashier_id INTEGER NOT NULL REFERENCES employees(id),
  branch_id INTEGER REFERENCES branches(id),
  opening_float INTEGER DEFAULT 0,
  cash_sales INTEGER DEFAULT 0,
  refunds INTEGER DEFAULT 0,
  cash_in INTEGER DEFAULT 0,
  cash_out INTEGER DEFAULT 0,
  expected_balance INTEGER DEFAULT 0,
  actual_balance INTEGER DEFAULT 0,
  variance INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open',
  opened_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW()),
  closed_at INTEGER
);

-- Inventory
CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  stock INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 10,
  supplier TEXT,
  unit TEXT DEFAULT 'piece',
  min_qty INTEGER DEFAULT 1,
  active INTEGER DEFAULT 1
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  date INTEGER NOT NULL,
  payment_method TEXT,
  employee_id INTEGER REFERENCES employees(id),
  notes TEXT,
  created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())
);

-- Promotions
CREATE TABLE IF NOT EXISTS promotions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  value REAL,
  start_date INTEGER,
  end_date INTEGER,
  max_discount INTEGER,
  active INTEGER DEFAULT 1
);

-- Delivery Zones
CREATE TABLE IF NOT EXISTS delivery_zones (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  fee INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);

-- Workflow History
CREATE TABLE IF NOT EXISTS workflow_history (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  stage TEXT NOT NULL,
  employee_id INTEGER REFERENCES employees(id),
  note TEXT,
  created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_cashier_id ON orders(cashier_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_due_date ON orders(due_date);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_is_deleted ON orders(is_deleted);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_service_id ON order_items(service_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(method);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_idempotency ON sync_queue(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_status ON cash_shifts(status);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_cashier ON cash_shifts(cashier_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(active);
CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_workflow_history_order_id ON workflow_history(order_id);

-- Ensure UUID extension for future use
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";