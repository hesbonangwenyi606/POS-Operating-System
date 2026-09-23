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

pool.on('connect', () => {
  console.log('[PostgreSQL] New client connected');
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

export default pool;