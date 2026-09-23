import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initWithSeed, DEFAULT_JWT_SECRET, healthCheck, query } from './db/database.js';
import { createUserRouter, createOrderRouter, createPaymentRouter, createCustomerRouter, createServiceRouter, createReportRouter, createSettingsRouter, createSyncRouter, createMPesaRouter, createHardwareRouter, createDeliveryRouter, createInventoryRouter, createExpensesRouter, createCashShiftRouter, createBackupRouter, createDashboardRouter, createRegisterRouter, createNotificationRouter } from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3005;
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

const requestCounts = new Map();
function rateLimit(req, res, next) {
  const key = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60000;
  const maxRequests = 100;
  const record = requestCounts.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
  record.count++;
  requestCounts.set(key, record);
  if (record.count > maxRequests) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests' });
  }
  next();
}
app.use(rateLimit);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid request body' });
  }
  next();
});
app.use(express.static(join(__dirname, '../dist')));
app.use('/api/assets', express.static(join(__dirname, '../dist/assets')));

app.use('/api/auth', createUserRouter());
app.use('/api/orders', createOrderRouter());
app.use('/api/payments', createPaymentRouter());
app.use('/api/customers', createCustomerRouter());
app.use('/api/services', createServiceRouter());
app.use('/api/reports', createReportRouter());
app.use('/api/settings', createSettingsRouter());
app.use('/api/sync', createSyncRouter());
app.use('/api/mpesa', createMPesaRouter());
app.use('/api/hardware', createHardwareRouter());
app.use('/api/delivery', createDeliveryRouter());
app.use('/api/inventory', createInventoryRouter());
app.use('/api/expenses', createExpensesRouter());
app.use('/api/cash-shift', createCashShiftRouter());
app.use('/api/backup', createBackupRouter());
app.use('/api/dashboard', createDashboardRouter());
app.use('/api/register', createRegisterRouter());
app.use('/api/notifications', createNotificationRouter());

function authenticate(req, res, next) {
  const token = req.headers.authorization?.substring(7);
  if (!token) return res.status(401).json({ error: 'No auth token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

app.get('/api/health', async (req, res) => {
  const db = await healthCheck();
  res.json({ status: db.ok ? 'ok' : 'degraded', uptime: process.uptime(), timestamp: new Date().toISOString(), database: db });
});
app.get('/api/sample-services', async (req, res) => {
  res.json([{id:'wash',name:'Washing · full load',category:'Full load',price:600,icon:'wash'},{id:'dry',name:'Drying · full load',category:'Full load',price:600,icon:'dry'},{id:'iron',name:'Ironing · full load',category:'Full load',price:700,icon:'iron'},{id:'wdf',name:'Wash, dry & fold',category:'Full load',price:1200,icon:'wash'},{id:'wdih',name:'Wash, dry, iron & hang',category:'Full load',price:1700,icon:'iron'},{id:'excess',name:'Excess load · per kg',category:'Full load',price:140,icon:'scale'},{id:'duvet-cover',name:'Duvet cover',category:'Household',price:300,icon:'home'},{id:'bedsheet',name:'Bedsheet',category:'Household',price:200,icon:'home'},{id:'curtains',name:'Curtains · per kg',category:'Household',price:300,icon:'home'},{id:'pillow',name:'Pillow',category:'Household',price:200,icon:'home'},{id:'towel',name:'Towel',category:'Household',price:200,icon:'home'},{id:'sheers',name:'Sheers · per kg',category:'Household',price:200,icon:'home'},{id:'duvet1',name:'Duvet / blanket · 1kg',category:'Duvets',price:500,icon:'blanket'},{id:'duvet2',name:'Duvet / blanket · 2kg',category:'Duvets',price:700,icon:'blanket'},{id:'duvet3',name:'Duvet / blanket · 3kg',category:'Duvets',price:900,icon:'blanket'},{id:'duvet4',name:'Duvet / blanket · 4kg',category:'Duvets',price:1000,icon:'blanket'},{id:'tshirt',name:'T-shirt',category:'Garments',price:200,icon:'shirt'},{id:'shirt',name:'Shirt / blouse / skirt',category:'Garments',price:200,icon:'shirt'},{id:'trouser',name:'Trouser / dress',category:'Garments',price:200,icon:'shirt'},{id:'dress',name:'African / pleated dress',category:'Garments',price:300,icon:'dress'},{id:'hoodie',name:'Hoodie / sweater',category:'Garments',price:300,icon:'shirt'},{id:'jacket',name:'Jacket · normal',category:'Garments',price:300,icon:'jacket'},{id:'suit2',name:'Suit · two piece',category:'Garments',price:700,icon:'suit'},{id:'suit3',name:'Suit · three piece',category:'Garments',price:800,icon:'suit'},{id:'wedding',name:'Wedding gown',category:'Special',price:1500,icon:'dress'},{id:'combo1',name:'Wash + Iron + Fold',category:'Combo',price:1500,icon:'wash'},{id:'combo2',name:'Wash + Dry + Iron',category:'Combo',price:1800,icon:'wash'}]);
});
app.get('/api/db-stats', authenticate, async (req, res) => {
  try {
    const tables = ['orders','order_items','customers','services','payments','employees','settings','branches','audit_log','sync_queue','cash_shifts','inventory','expenses'];
    const stats = {};
    for (const table of tables) {
      const result = await query(`SELECT COUNT(*) as c FROM ${table}`);
      stats[table] = parseInt(result.rows[0]?.c || 0);
    }
    res.json({ tables: stats, database: 'postgresql', backup_time: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/sync-status', authenticate, async (req, res) => {
  try {
    const pending = await query("SELECT COUNT(*) as c FROM sync_queue WHERE status='pending'");
    const failed = await query("SELECT COUNT(*) as c FROM sync_queue WHERE status='failed'");
    res.json({ pending: parseInt(pending.rows[0]?.c || 0), failed: parseInt(failed.rows[0]?.c || 0), lastSync: Date.now() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const server = app.listen(PORT, async () => { await initWithSeed(); console.log(`Open Doors POS Server v2.0 on port ${PORT}`); console.log(`Health: http://localhost:${PORT}/api/health`); });

let httpsServer = null;
try {
  const https = await import('https');
  const fs = await import('fs');
  const key = fs.readFileSync(join(__dirname, 'key.pem'));
  const cert = fs.readFileSync(join(__dirname, 'cert.pem'));
  httpsServer = https.createServer({ key, cert }, app).listen(PORT + 1, async () => { await initWithSeed(); console.log(`Open Doors POS Server HTTPS on port ${PORT + 1}`); });
} catch (e) {
  console.log('HTTPS not available (no certificate), HTTP only on port', PORT);
}

export { app, server, httpsServer };