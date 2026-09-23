import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'open_doors_pos',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected pool error:', err.message);
});

export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`[PostgreSQL] Slow query (${duration}ms): ${text.substring(0, 120)}`);
    }
    return result;
  } catch (e) {
    console.error('[PostgreSQL] Query error:', e.message, 'SQL:', text.substring(0, 200));
    throw e;
  }
}

export async function getClient() {
  const client = await pool.connect();
  return {
    client,
    release: () => client.release(),
    query: (text, params) => client.query(text, params),
    begin: () => client.query('BEGIN'),
    commit: () => client.query('COMMIT'),
    rollback: () => client.query('ROLLBACK'),
  };
}

export async function healthCheck() {
  try {
    const result = await pool.query('SELECT 1 as ok, NOW() as now');
    return { ok: result.rows[0].ok, now: result.rows[0].now, poolSize: pool.totalCount, idleCount: pool.idleCount, waitingCount: pool.waitingCount };
  } catch (e) {
    return { ok: false, error: e.message, poolSize: pool.totalCount, idleCount: pool.idleCount, waitingCount: pool.waitingCount };
  }
}

export async function closePool() {
  await pool.end();
}

export function moneyToMinorUnits(amount) { return Math.round(Number(amount) * 100); }
export function minorUnitsToMoney(minor) { return (minor / 100).toFixed(2); }
export function formatMoneyKES(amount) { return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 2 }).format(amount); }

export function getSetting(key) {
  return query('SELECT value FROM settings WHERE key = $1', [key]).then(r => r.rows[0]?.value ?? null);
}

export function setSetting(key, value) {
  return query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, value]);
}

export async function addToSyncQueue(entity, entityId, action, payload, idempotencyKey = null) {
  const key = idempotencyKey || `${entity}:${entityId}:${action}:${Date.now()}`;
  await query(
    'INSERT INTO sync_queue (entity, entity_id, action, payload, status, idempotency_key, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [entity, entityId || null, action, JSON.stringify(payload || {}), 'pending', key, Math.floor(Date.now() / 1000)]
  );
}

export async function getSyncQueue() {
  const result = await query("SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 100");
  return result.rows;
}

export async function markSynced(id) {
  await query('UPDATE sync_queue SET status = $1, synced_at = $2 WHERE id = $3', ['synced', Math.floor(Date.now() / 1000), id]);
}

export async function markSyncFailed(id) {
  const row = await query('SELECT retries FROM sync_queue WHERE id = $1', [id]);
  const retries = (row.rows[0]?.retries || 0) + 1;
  await query('UPDATE sync_queue SET status = $1, retries = $2 WHERE id = $3', ['failed', retries, id]);
}

export async function getSyncStatus() {
  const pending = await query("SELECT COUNT(*) as c FROM sync_queue WHERE status = 'pending'");
  const failed = await query("SELECT COUNT(*) as c FROM sync_queue WHERE status = 'failed'");
  const lastSync = await getSetting('last_sync_at');
  return { pending: parseInt(pending.rows[0]?.c || 0), failed: parseInt(failed.rows[0]?.c || 0), lastSync };
}

export function generateOrderNumber() {
  const year = new Date().getFullYear();
  return `OD-${year}-${String(Math.floor(Math.random() * 999999) + 1).padStart(6, '0')}`;
}

export async function hashPassword(password) {
  const bcrypt = await import('bcrypt');
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '10');
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password, hash) {
  const bcrypt = await import('bcrypt');
  return bcrypt.compare(password, hash);
}

export const DEFAULT_JWT_SECRET = 'od-pos-prod-' + Date.now().toString(36) + '-change-me';

export async function initWithSeed() {
  await query('SELECT 1');
  await query(`CREATE TABLE IF NOT EXISTS pos_sessions (
    id TEXT PRIMARY KEY,
    cart JSONB DEFAULT '[]',
    customer JSONB,
    discount_type TEXT DEFAULT 'none',
    discount_value NUMERIC DEFAULT 0,
    turnaround TEXT DEFAULT 'Normal',
    fulfilment TEXT DEFAULT 'collection',
    amount_paid NUMERIC DEFAULT 0,
    hold_mode BOOLEAN DEFAULT false,
    payment_state TEXT DEFAULT 'idle',
    mpesa_phone TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  console.log('[PostgreSQL] Connected successfully');
}