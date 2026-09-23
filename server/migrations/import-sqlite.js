import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { query } from '../db/postgres.js';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SQLITE_PATH = process.argv[2] || join(__dirname, '../../data/pos.db');

if (!existsSync(SQLITE_PATH)) {
  console.error(`SQLite database not found: ${SQLITE_PATH}`);
  process.exit(1);
}

const sqlite = new Database(SQLITE_PATH);
sqlite.pragma('journal_mode = WAL');

const TABLES = [
  'branches', 'roles', 'employees', 'settings', 'customers',
  'services', 'orders', 'order_items', 'payments', 'audit_log',
  'sync_queue', 'cash_shifts', 'inventory', 'expenses',
  'promotions', 'delivery_zones', 'workflow_history'
];

const DEPENDENCY_ORDER = [
  'branches', 'roles', 'settings', 'customers', 'services',
  'employees', 'orders', 'order_items', 'payments', 'audit_log',
  'sync_queue', 'cash_shifts', 'inventory', 'expenses',
  'promotions', 'delivery_zones', 'workflow_history'
];

function sqliteRows(table) {
  try {
    return sqlite.prepare(`SELECT * FROM ${table}`).all();
  } catch (e) {
    if (e.message.includes('no such table')) return [];
    throw e;
  }
}

function transformValue(key, value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value;
  return String(value);
}

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + str.replace(/'/g, "''").replace(/\\/g, '\\\\') + "'";
}

async function migrateTable(tableName) {
  const rows = sqliteRows(tableName);
  if (rows.length === 0) {
    console.log(`  ${tableName}: 0 rows (empty)`);
    return { migrated: 0, failed: 0 };
  }

  const columns = Object.keys(rows[0]);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const colNames = columns.map(c => `"${c}"`).join(', ');

  let migrated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const values = columns.map(col => {
        const val = row[col];
        if (val === undefined || val === null) return null;
        if (typeof val === 'boolean') return val ? 1 : 0;
        if (typeof val === 'number') return val;
        if (typeof val === 'string') return val;
        return JSON.stringify(val);
      });

      const sql = `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
      await query(sql, values);
      migrated++;
    } catch (e) {
      console.error(`  ${tableName} row ${row.id || 'unknown'}: ${e.message}`);
      failed++;
    }
  }

  console.log(`  ${tableName}: ${migrated} migrated, ${failed} failed`);
  return { migrated, failed };
}

async function resetDatabase() {
  const dropTables = DEPENDENCY_ORDER.reverse();
  for (const table of dropTables) {
    await query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
  }
  console.log('Database reset complete.');
  const migrationSql = fs.readFileSync(join(__dirname, '001_init.sql'), 'utf-8');
  const statements = migrationSql.split(';').filter(s => s.trim());
  for (const stmt of statements) {
    if (stmt.trim()) await query(stmt);
  }
  console.log('Schema re-created.');
}

async function main() {
  const reset = process.argv.includes('--reset');
  const dryRun = process.argv.includes('--dry-run');

  console.log(`SQLite source: ${SQLITE_PATH}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : reset ? 'RESET + MIGRATE' : 'MIGRATE'}`);
  console.log('');

  if (reset && !dryRun) {
    await resetDatabase();
  }

  const totals = {};
  let totalMigrated = 0;
  let totalFailed = 0;

  for (const table of DEPENDENCY_ORDER) {
    console.log(`Migrating ${table}...`);
    const result = await migrateTable(table);
    totals[table] = result;
    totalMigrated += result.migrated;
    totalFailed += result.failed;
  }

  console.log('');
  console.log('=== Migration Summary ===');
  for (const [table, result] of Object.entries(totals)) {
    console.log(`${table}: ${result.migrated} migrated, ${result.failed} failed`);
  }
  console.log(`Total: ${totalMigrated} migrated, ${totalFailed} failed`);

  sqlite.close();

  if (totalFailed > 0) {
    process.exit(2);
  }
}

main().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});