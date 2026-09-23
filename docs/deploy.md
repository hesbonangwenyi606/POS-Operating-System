# Open Doors POS — Deployment & Operations Guide

Open Doors Laundromat POS is an offline-first, Kenya-focused point-of-sale system for laundromat operations. It runs as a single-page application (SPA) in the browser, backed by an Express API server and PostgreSQL database. POS terminals operate on the local network and sync transactions when connectivity is available.

This document covers:

* local development
* local production-style deployment
* deployment to another device on the same network
* production deployment online
* environment configuration
* database setup
* HTTPS
* offline functionality
* frontend/backend deployment
* updates
* backups
* troubleshooting

---

# 1. System Requirements

### Required

* **Node.js** 20+ (the project uses Vite 7, Express 4, pg, Dexie.js)
* **npm** 10+ (bundled with Node.js)
* **PostgreSQL** 14+ (the server database; the only supported server database)
* **Git** (for cloning and updates)

### Optional

* **Docker** (not implemented — no Dockerfile or docker-compose.yml exists)
* **nginx** (for production reverse proxy; not configured in the repository)
* **Let's Encrypt / certbot** (for production TLS certificates)

### Development only

* **Vite dev server** (started via `npm run dev`)
* **vitest** (test runner)

### Production only

* **PostgreSQL** server (required for the backend API)
* **HTTPS certificates** (recommended for production; self-signed certs work for LAN)

---

# 2. Project Architecture

```text
Browser / POS Device
        |
        v
Frontend (Vite, Vanilla JS, Neo-Brutalist CSS)
  - Serves on port 5173 (dev) or / (production, static)
  - Proxies /api/* to backend
        |
        v
Backend API (Express, port 3005)
  - JWT authentication
  - Role-based authorization (owner, manager, cashier, laundry_staff, delivery_staff, viewer)
  - PostgreSQL queries
  - Sync queue processing
  - M-Pesa STK push (mock/sandbox)
  - Notification dispatch (SMS/email — requires provider config)
        |
        +------ PostgreSQL (port 5432)
        |
        +------ IndexedDB (Dexie.js) — browser-side offline cache
        |
        +------ Sync Queue (outbox pattern with idempotency keys)
```

### Component locations

* **Frontend**: `src/` — Vanilla JS modules, CSS, service worker
* **Backend**: `server/` — Express app, routes, database pool
* **Database**: PostgreSQL (server) + IndexedDB (browser)
* **Auth**: JWT tokens, 24h expiry, stored in `localStorage` under `od_auth_token`
* **Offline storage**: Dexie.js IndexedDB in the browser (`OpenDoorsPOS` database)
* **Sync**: Outbox queue in PostgreSQL `sync_queue` table; client polls every 30s
* **Service worker**: `src/workers/sw.js` — caches API responses, serves offline fallback
* **Static assets**: `dist/` after build; served by Express static middleware

### Where each component runs

* **POS device**: Frontend + IndexedDB + Service Worker
* **Local server**: Backend API + PostgreSQL
* **Online production**: Backend API + PostgreSQL + Reverse Proxy + TLS

---

# 3. Repository Structure

```text
.
├── index.html              # Entry HTML, loads src/main.js
├── package.json            # Scripts, dependencies
├── vite.config.js          # Vite config, proxy to :3005, build to dist/
├── src/
│   ├── main.js             # App bootstrap, auth, sync engine, service worker registration
│   ├── api/client.js       # API client (fetch wrapper, JWT auth header)
│   ├── auth/auth.js        # Login/logout/token validation
│   ├── db/database.js      # Dexie.js IndexedDB schema, sync queue helpers
│   ├── services/sync.js    # Sync engine (outbox push, retry)
│   ├── components/
│   │   ├── app.js          # POS, Orders, Laundry, Settings, Dashboard renders
│   │   ├── login.js        # Login form
│   │   └── ...
│   ├── workers/sw.js       # Service worker (cache-first for static, network-first for API)
│   └── style.css           # Neo-Brutalist styles
├── server/
│   ├── index.js            # Express app, port 3005, HTTPS on 3006, rate limiting
│   ├── routes/index.js     # All API routes (auth, orders, payments, customers, services, reports, settings, sync, mpesa, hardware, delivery, inventory, expenses, cash-shift, backup, dashboard, register, notifications)
│   ├── db/
│   │   ├── database.js     # PostgreSQL pool, query helper, initWithSeed, sync helpers
│   │   └── postgres.js     # PostgreSQL pool (duplicate of database.js)
│   └── migrations/
│       ├── 001_init.sql    # PostgreSQL schema (tables, indexes)
│       ├── seed.js         # Seed admin user, branches, roles, settings, services
│       └── import-sqlite.js # Import from SQLite (optional)
├── public/
│   └── manifest.json       # PWA manifest
├── docs/
│   └── deploy.md           # This document
└── .env.example            # Environment variable template
```

---

# 4. Environment Configuration

### Actual `.env.example` contents

| Variable | Required | Development | Production | Description |
| -------- | -------- | ----------- | ---------- | ----------- |
| `PORT` | No | `3005` | `3005` | Backend API HTTP port |
| `JWT_SECRET` | Yes | `change-me-in-production-use-a-strong-random-secret` | Strong random string | JWT signing secret |
| `ADMIN_USERNAME` | No | `admin` | Admin username | Default admin login |
| `ADMIN_PASSWORD` | No | `change-me-in-production` | Strong password | Default admin password |
| `MPESA_CONSUMER_KEY` | No | empty | Daraja API key | M-Pesa Daraja consumer key |
| `MPESA_CONSUMER_SECRET` | No | empty | Daraja API secret | M-Pesa Daraja consumer secret |
| `MPESA_PASSKEY` | No | empty | Daraja passkey | M-Pesa Daraja passkey |
| `MPESA_ENVIRONMENT` | No | `sandbox` | `production` | M-Pesa environment |
| `NODE_ENV` | No | `development` | `production` | Node environment |
| `DATABASE_URL` | No | `postgresql://postgres:postgres@localhost:5432/open_doors_pos` | Production URL | PostgreSQL connection string |
| `DB_HOST` | No | `localhost` | DB host | PostgreSQL host |
| `DB_PORT` | No | `5432` | DB port | PostgreSQL port |
| `DB_NAME` | No | `open_doors_pos` | DB name | PostgreSQL database name |
| `DB_USER` | No | `postgres` | DB user | PostgreSQL user |
| `DB_PASSWORD` | No | `postgres` | DB password | PostgreSQL password |
| `DB_SSL` | No | `false` | `true` | Enable SSL for PostgreSQL |

### `.env` vs `.env.example`

* `.env.example` is committed — use it as a template
* `.env` is gitignored — never commit it
* Copy `.env.example` to `.env` and fill in values before starting the server

### Missing configuration

The `.env.example` does not include:

* `BCRYPT_ROUNDS` (default 10, used in `server/db/database.js`)
* `OD_ORDER_COUNTER` (localStorage-based, not env)

These are optional with safe defaults.

---

# 5. Initial Local Setup

### Prerequisites

1. Install Node.js 20+ and npm 10+
2. Install PostgreSQL 14+ and start the service
3. Create the database:

```bash
sudo -u postgres createdb open_doors_pos
```

4. Clone the repository:

```bash
git clone <repository-url>
cd POS-Operating-System
```

### Setup steps

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Edit .env with your values (especially DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD)
#    The defaults in .env.example work for local development:
#    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/open_doors_pos
#    DB_HOST=localhost
#    DB_PORT=5432
#    DB_NAME=open_doors_pos
#    DB_USER=postgres
#    DB_PASSWORD=postgres

# 4. Run migrations (creates tables)
npm run db:migrate

# 5. Seed data (admin user, branches, roles, settings, services)
npm run db:seed

# 6. Build frontend
npm run build

# 7. Start the server
node server/index.js
```

### Verify

```bash
curl http://localhost:3005/api/health
# {"status":"ok","uptime":...,"database":{"ok":1,...}}
```

### Required directories

* `dist/` — created by `npm run build`
* `server/cert.pem` and `server/key.pem` — optional, for HTTPS (see section 12)

---

# 6. Database Setup

### PostgreSQL only

The server uses PostgreSQL exclusively. SQLite is supported only for import via `import-sqlite.js` (not for production runtime).

### Database creation

```bash
sudo -u postgres createdb open_doors_pos
```

### User and credentials

Default credentials (from `.env.example`):

```text
DB_USER=postgres
DB_PASSWORD=postgres
```

Change these for production. The connection string format:

```text
postgresql://user:password@host:port/database
```

### Migrations

The migration file is `server/migrations/001_init.sql` (SQL, not JS). The `db:migrate` script in `package.json` references `001_init.pgsql.js` which does not exist — this is a bug. To run migrations manually:

```bash
psql -h localhost -U postgres -d open_doors_pos -f server/migrations/001_init.sql
```

Or fix the script: change `db:migrate` in `package.json` to `node server/migrations/import-sqlite.js` (which handles both SQLite and PostgreSQL) or create the missing `001_init.pgsql.js` wrapper.

* `branches`, `roles`, `employees`, `settings`
* `customers`, `services`, `orders`, `order_items`
* `payments`, `audit_log`, `sync_queue`, `cash_shifts`
* `inventory`, `expenses`, `promotions`, `delivery_zones`
* `workflow_history`
* Indexes on all foreign keys and common query columns

### Seeding

```bash
npm run db:seed
```

Creates:

* Admin user (`admin` / `admin123` by default)
* 4 branches (OD-KIT, OD-ATHI, OD-KIS, OD-ISA)
* 6 roles (owner, manager, cashier, laundry_staff, delivery_staff, viewer)
* 27 default services
* Default settings

### Testing connectivity

```bash
curl http://localhost:3005/api/health
```

The health endpoint verifies PostgreSQL connectivity.

---

# 7. Running in Development

### Start both frontend and backend

```bash
npm run dev
```

This starts:

1. **Backend API** on port 3005 (HTTP) and port 3006 (HTTPS if certs present)
2. **Frontend dev server** on port 5173 with Vite HMR

### URLs

* **Frontend**: `http://localhost:5173`
* **Backend API**: `http://localhost:3005`
* **Health check**: `http://localhost:3005/api/health`
* **API proxy**: Vite proxies `/api/*` from `:5173` to `:3005`

### Hot reload

Vite provides HMR for frontend changes. Backend changes require a restart.

### Logs

Backend logs go to stdout. Frontend logs go to the browser console.

### Stop

```bash
# Kill the background processes
pkill -f "node server/index.js"
pkill -f "vite"
```

### Running frontend/backend independently

**Backend only**:

```bash
node server/index.js
```

**Frontend only** (requires backend running):

```bash
npx vite --host 0.0.0.0 --port 5173
```

---

# 8. Development Troubleshooting

### Port already in use

```bash
# Find process on port 3005
lsof -i :3005
# Kill it
kill <PID>
```

### Database connection failure

Verify:

```bash
# Is PostgreSQL running?
pg_isready -h localhost -p 5432

# Can you connect?
psql -h localhost -U postgres -d open_doors_pos -c "SELECT 1"
```

Check `.env`:

* `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
* `DATABASE_URL` overrides individual DB vars

### npm dependency problems

```bash
rm -rf node_modules package-lock.json
npm install
```

### API unavailable

```bash
curl http://localhost:3005/api/health
```

If this fails, the backend is not running. Start it:

```bash
node server/index.js
```

### CORS/proxy problems

In development, the Vite dev server proxies `/api/*` to `http://localhost:3005`. The proxy config is in `vite.config.js`:

```js
proxy: {
  '/api': {
    target: 'http://localhost:3005',
    changeOrigin: true,
    secure: false,
    rewrite: (path) => path,
  },
},
```

If the backend is on a different host, change the `target` or set `API_BASE` in the client.

### Authentication problems

* Token stored in `localStorage` as `od_auth_token`
* Token validated via `GET /api/auth/me`
* If token is invalid/expired, user is redirected to login
* Check browser Application > Local Storage for `od_auth_token`

### Offline mode problems

* Service Worker: check `navigator.serviceWorker.controller` in browser console
* IndexedDB: check Dexie `db` object in console
* Sync queue: `GET /api/sync/queue` or `GET /api/sync/status`
* Connection status: green/red indicator in sidebar

---

# 9. Building for Production

```bash
npm run build
```

### Output

* `dist/index.html` — entry HTML
* `dist/assets/index-*.js` — bundled frontend JS
* `dist/assets/index-*.css` — bundled CSS
* Source maps generated (`*.js.map`, `*.css.map`)

### Backend compilation

No backend build step — the server runs directly from source with `node server/index.js`.

### Static assets

The Express server serves `dist/` statically:

```js
app.use(express.static(join(__dirname, '../dist')));
app.use('/api/assets', express.static(join(__dirname, '../assets')));
```

### Verify build locally

```bash
npm run build
node server/index.js
# Open http://localhost:3005
```

---

# 10. Running Production Locally

### Development vs Production

| | Development | Production |
|---|-----------|-----------|
| Frontend | Vite dev server (`:5173`, HMR) | Static files from `dist/` |
| Backend | `node server/index.js` | `node server/index.js` |
| API proxy | Vite proxies `:5173` → `:3005` | Direct `:3005` or reverse proxy |
| Database | PostgreSQL | PostgreSQL |
| HTTPS | No (unless certs present) | Recommended (see section 12) |

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Configure production environment
cp .env.example .env
# Edit .env: set strong JWT_SECRET, ADMIN_PASSWORD, DATABASE_URL

# 3. Initialize database
npm run db:migrate
npm run db:seed

# 4. Build frontend
npm run build

# 5. Start backend
node server/index.js

# 6. Test
curl http://localhost:3005/api/health
```

### Access

* `http://localhost:3005` — serves the built frontend
* `http://localhost:3005/api/health` — health check

---

# 11. Deploying to Another Device on the Local Network

This is the primary deployment model for the laundromat POS: a local server machine serves the API and frontend, and POS terminals (tablets/computers) access it via the LAN.

### Local Server

1. Select a machine to act as the server (any Linux/macOS/Windows PC)
2. Install Node.js 20+ and PostgreSQL
3. Clone the repo and configure `.env`
4. Run migrations and seed
5. Start the backend:

```bash
node server/index.js
```

6. Bind to the LAN interface if needed. The server listens on all interfaces by default (`0.0.0.0` for Vite, `::` for Express). To confirm:

```bash
ss -tlnp | grep 3005
```

### POS Client

On any device on the same LAN:

```text
http://<SERVER_IP>:3005
```

Find the server's LAN IP:

```bash
# Linux
ip addr show | grep "inet "

# macOS
ifconfig | grep "inet "
```

Example: `http://192.168.1.50:3005`

### Firewall

Allow these ports:

* `3005` — Backend API (HTTP)
* `3006` — Backend API (HTTPS, if certs present)
* `5432` — PostgreSQL (only from the server, not from the internet)
* `5173` — Vite dev server (development only, not needed in production)

### Database

Client devices never connect directly to PostgreSQL. All database access goes through the backend API on port 3005.

### Offline Mode

If the LAN or internet goes down:

1. POS terminals continue operating normally
2. Orders, payments, and customer data are saved to IndexedDB
3. Operations are queued in the sync queue
4. When connectivity returns, the sync engine automatically pushes queued operations
5. Idempotency keys prevent duplicates
6. Connection status indicator shows offline state

### Sync behavior

* Sync interval: 30 seconds (configurable via settings)
* Batch size: 20 operations per sync
* Retry: exponential backoff, up to 3 retries
* Failed operations stay in queue for manual retry

---

# 12. HTTPS on a Local Network

### Current state

The server supports HTTPS on port 3006 if certificate files are present:

```js
// server/index.js lines 96-105
let httpsServer = null;
try {
  const https = await import('https');
  const fs = await import('fs');
  const key = fs.readFileSync(join(__dirname, 'cert.pem'));
  const cert = fs.readFileSync(join(__dirname, 'cert.pem'));
  httpsServer = https.createServer({ key, cert }, app).listen(PORT + 1, ...);
} catch (e) {
  console.log('HTTPS not available (no certificate), HTTP only on port', PORT);
}
```

**Note**: The code reads both `key` and `cert` from `cert.pem` — this is a bug. The key should be read from `key.pem`. This must be fixed before HTTPS will work.

### Certificate files

* Expected location: `server/cert.pem` and `server/key.pem`
* These are gitignored (`.gitignore` includes `*.pem`)
* Never commit private keys or certificates

### Generating self-signed certs (for testing only)

```bash
openssl req -x509 -newkey rsa:2048 -keyout server/key.pem -out server/cert.pem -days 365 -nodes -subj "/CN=localhost"
```

### Browser trust

Self-signed certificates trigger browser warnings. For production, use Let's Encrypt or a trusted CA.

### HTTPS not currently implemented for production

The repository does not include a production HTTPS setup. To add it:

1. Fix the key/cert file path bug in `server/index.js`
2. Obtain a real certificate (Let's Encrypt or CA)
3. Configure the server to use it
4. Redirect HTTP → HTTPS

---

# 13. Production Online Deployment

### Architecture

```text
Internet
   |
   v
Domain (e.g., pos.example.com)
   |
   v
HTTPS / Reverse Proxy (nginx)
   |
   +---- Frontend (static files from dist/)
   |
   +---- Backend API (Express, port 3005)
             |
             +---- PostgreSQL (port 5432, local only)
```

### Deployment environments

* **VPS** — Install Node.js, PostgreSQL, nginx on a cloud VM
* **Cloud VM** — Same as VPS (AWS EC2, DigitalOcean Droplet, etc.)
* **Docker** — Not implemented (no Dockerfile exists)
* **Managed database** — Supported (just change `DATABASE_URL`)
* **Static frontend hosting** — Not recommended (API requires backend)

### Steps

1. Provision a VPS/VM (2GB RAM minimum)
2. Install Node.js 20+, PostgreSQL, nginx
3. Clone repo, configure `.env`
4. Run migrations and seed
5. Build frontend: `npm run build`
6. Configure nginx reverse proxy (see section 15)
7. Configure HTTPS (see section 16)
8. Start backend with process manager (see section 18)
9. Verify deployment
10. Configure backups (see section 25)

---

# 14. Domain Configuration

### Example configuration

```text
pos.example.com      → A record → server IP
api.example.com      → A record → server IP (if separating frontend/backend)
```

### DNS records

```text
Type  Name    Value
A     @       <SERVER_IP>
A     pos     <SERVER_IP>
A     api     <SERVER_IP>
```

### Note

The repository does not include DNS configuration. Set up A records with your domain registrar.

---

# 15. Reverse Proxy / nginx

### Not currently configured

The repository does not include an nginx configuration file. To deploy behind nginx, create `/etc/nginx/sites-available/pos`:

```nginx
server {
    listen 80;
    server_name pos.example.com;

    location / {
        proxy_pass http://localhost:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Then enable:

```bash
sudo ln -s /etc/nginx/sites-available/pos /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### WebSocket support

Not required — the application uses HTTP polling, not WebSockets.

---

# 16. HTTPS / TLS

### Certificate acquisition

Use Let's Encrypt:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d pos.example.com
```

### Certificate installation

Certificates are issued to `/etc/letsencrypt/live/pos.example.com/`. Update `server/index.js` to read from these paths, or configure nginx to terminate TLS and proxy HTTP to the backend.

### HTTP → HTTPS redirect

```nginx
server {
    listen 80;
    server_name pos.example.com;
    return 301 https://$host$request_uri;
}
```

### Certificate renewal

```bash
sudo certbot renew --dry-run
# Add cron job: 0 3 * * * certbot renew --quiet
```

### Secure cookies

Not implemented — JWT tokens are stored in `localStorage`, not cookies. This is acceptable for SPA architecture but vulnerable to XSS. Consider HttpOnly cookies for production.

### API security

* All API endpoints require JWT authentication (except `/api/auth/login`, `/api/auth/register`, `/api/health`, `/api/sample-services`)
* Rate limiting: 100 requests/minute per IP
* CORS: not explicitly configured (relies on same-origin or proxy)

---

# 17. Production Database

### PostgreSQL provisioning

```bash
sudo -u postgres psql -c "CREATE DATABASE open_doors_pos;"
sudo -u postgres psql -c "CREATE USER pos_user WITH PASSWORD 'strong-password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE open_doors_pos TO pos_user;"
```

### Permissions

* Never expose PostgreSQL to the public internet (port 5432 should only be accessible from the backend server)
* Use a dedicated database user with minimal required permissions
* Enable SSL in `.env`: `DB_SSL=true`

### Connection pooling

The server uses `pg` Pool with:

* `max: 20` connections
* `idleTimeoutMillis: 30000`
* `connectionTimeoutMillis: 10000`

### Migrations

```bash
npm run db:migrate
```

### Seeding

```bash
npm run db:seed
```

---

# 18. Production Process Management

### Not implemented

The repository does not include systemd, PM2, Docker Compose, or supervisor configuration. The backend is started with:

```bash
node server/index.js
```

### Recommended setup (systemd)

Create `/etc/systemd/system/od-pos.service`:

```ini
[Unit]
Description=Open Doors POS API Server
After=network.target postgresql.service

[Service]
Type=simple
User=pos
WorkingDirectory=/opt/od-pos
EnvironmentFile=/opt/od-pos/.env
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable od-pos
sudo systemctl start od-pos
sudo systemctl status od-pos
sudo journalctl -u od-pos -f
```

### PM2 alternative

```bash
npm install -g pm2
pm2 start server/index.js --name od-pos
pm2 save
pm2 startup
```

### Commands

```bash
# systemd
sudo systemctl start od-pos
sudo systemctl stop od-pos
sudo systemctl restart od-pos
sudo systemctl status od-pos
sudo journalctl -u od-pos -f

# PM2
pm2 start od-pos
pm2 stop od-pos
pm2 restart od-pos
pm2 status
pm2 logs od-pos
```

---

# 19. Docker Deployment

### Not implemented

The repository does not include a `Dockerfile` or `docker-compose.yml`. Docker deployment is not supported out of the box.

To add Docker support, you would need to:

1. Create a `Dockerfile` with Node.js 20 base image
2. Create a `docker-compose.yml` with the API server and PostgreSQL
3. Configure volumes for `dist/`, `.env`, and PostgreSQL data
4. Set up health checks and restart policies

---

# 20. Offline-First Deployment

### Local storage

POS data is stored in the browser's IndexedDB via Dexie.js (`OpenDoorsPOS` database). Tables include:

* `orders`, `orderItems`, `customers`, `services`, `payments`
* `employees`, `roles`, `settings`, `branches`
* `auditLog`, `syncQueue`, `cashShifts`, `inventory`, `expenses`
* `promotions`, `deliveryZones`, `posSessions`

### Outbox

When offline, operations are queued in the `sync_queue` table (PostgreSQL) and the client-side `syncQueue` store (IndexedDB). Each operation has:

* `entity` — table name
* `entityId` — record ID
* `action` — create/update_status/payment/delete
* `payload` — the data
* `idempotencyKey` — prevents duplicates
* `status` — pending/synced/failed

### Synchronization

1. Client polls sync queue every 30 seconds
2. Batches up to 20 pending operations
3. Sends `POST /api/sync/sync` with operations
4. Server marks operations as `synced` by idempotency key
5. Client marks synced operations in IndexedDB

### Retry

* Exponential backoff: 1s, 2s, 4s, 8s... up to 30s
* Max 3 retries before marking as failed
* Failed operations remain in queue for manual retry
* Manual retry via Settings > Offline & Sync

### Conflict handling

The server uses last-write-wins for order updates. The sync queue uses idempotency keys to prevent duplicate processing. No explicit conflict resolution strategy is implemented beyond idempotency.

### Service Worker

* Registered in `src/main.js` via `navigator.serviceWorker.register('/src/workers/sw.js')`
* Caches static assets (cache-first) and API responses (network-first)
* Offline fallback: serves cached content or "Working offline" message
* Updates on activation by deleting old caches

### Browser requirements

* **IndexedDB**: supported in all modern browsers
* **Service Workers**: requires HTTPS in production (localhost exempt)
* **Browser support**: Chrome, Firefox, Safari, Edge (modern versions)

---

# 21. POS Device Setup

### Checklist

```text
[ ] Install supported OS (Linux/macOS/Windows)
[ ] Install browser (Chrome, Firefox, Safari, Edge)
[ ] Connect to LAN/Wi-Fi
[ ] Open POS (http://<server-ip>:3005)
[ ] Sign in (admin / admin123 first run)
[ ] Configure business (Settings > General)
[ ] Configure services (Settings > POS)
[ ] Configure prices (Settings > POS)
[ ] Configure payment methods (Settings > Payments)
[ ] Configure receipt printer (Settings > Receipts)
[ ] Test printing
[ ] Test offline mode (disconnect network, create order)
[ ] Test synchronization (reconnect, verify sync)
[ ] Test customer creation
[ ] Test order creation
[ ] Test payment
[ ] Test receipt
```

---

# 22. Receipt Printer / Hardware

### Current state

**Not currently implemented.** The hardware abstraction layer returns mock status:

```json
{
  "printer": { "connected": false, "type": "browser" },
  "cashDrawer": { "connected": false },
  "barcodeScanner": { "connected": false },
  "scale": { "connected": false },
  "customerDisplay": { "connected": false }
}
```

### Supported (planned)

* **Receipt printers**: Browser print → ESC/POS adapters (not implemented)
* **USB printers**: Not implemented
* **Network printers**: Not implemented
* **Browser printing**: Basic `window.print()` (not ESC/POS)
* **Cash drawer**: Not implemented
* **Barcode scanners**: Not implemented
* **Customer displays**: Not implemented

### Receipt generation

Receipts are generated as JSON via `GET /api/orders/:id/receipt`. The frontend renders them in the browser. Physical printing requires browser print or a future ESC/POS integration.

---

# 23. M-Pesa / Payment Configuration

### Current state

M-Pesa integration is **mock/sandbox only**. The STK push endpoint records a payment as `pending` and returns a mock `CheckoutRequestID`. The callback endpoint updates the order status. No real Daraja API calls are made.

### Configuration

Set in Settings > Payments or via `.env`:

```text
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_PASSKEY=
MPESA_ENVIRONMENT=sandbox
```

### Sandbox vs production

* `MPESA_ENVIRONMENT=sandbox` — mock mode (default)
* `MPESA_ENVIRONMENT=production` — would use real Daraja API (not implemented)

### Callback URL

Configured in settings: `mpesa_callback_url = /api/mpesa/callback`

### Transaction verification

Not implemented — payments are recorded as `pending` and never confirmed via real API.

### Reconciliation

Not implemented — no automated reconciliation with M-Pesa statements.

---

# 24. Security Checklist

### Implemented

* [x] JWT authentication (24h expiry)
* [x] Role-based authorization (owner, manager, cashier, laundry_staff, delivery_staff, viewer)
* [x] bcrypt password hashing (10 rounds)
* [x] Rate limiting (100 req/min per IP)
* [x] Input validation on endpoints
* [x] Audit log table (not actively written)
* [x] Settings whitelist (only allowed keys can be updated)
* [x] Sensitive settings filtered from GET responses
* [x] `.env` gitignored
* [x] `*.pem` gitignored

### Recommended improvements

* [ ] HTTPS in production (currently HTTP only; HTTPS support has a bug)
* [ ] HttpOnly cookies instead of localStorage for JWT
* [ ] CORS configuration
* [ ] CSRF protection
* [ ] SQL injection protection (parameterized queries — already implemented)
* [ ] XSS protection headers
* [ ] Content Security Policy
* [ ] Database encryption at rest
* [ ] Backup encryption
* [ ] Dependency vulnerability scanning
* [ ] Audit log writes (table exists but is not actively populated)
* [ ] Password complexity requirements
* [ ] Account lockout after failed attempts
* [ ] Session management (logout all devices)
* [ ] API request size limits (10MB configured)

---

# 25. Backups

### Database

PostgreSQL backup:

```bash
pg_dump -h localhost -U postgres open_doors_pos > backup_$(date +%Y%m%d).sql
```

Restore:

```bash
psql -h localhost -U postgres open_doors_pos < backup_$(date +%Y%m%d).sql
```

### Local POS

IndexedDB data is browser-local. There is no built-in export for local POS data. To back up:

1. Export orders via CSV from the Orders page
2. Back up the browser's IndexedDB manually (DevTools > Application > IndexedDB)

### Uploaded files

No file upload functionality exists in the current implementation.

### Restore

```bash
# Database restore
psql -h localhost -U postgres open_doors_pos < backup.sql

# Re-seed if needed
npm run db:seed
```

### Backup schedule

The settings include `backup_enabled` and `backup_interval_hours` (default 24h), but no automated backup job is implemented. Set up a cron job:

```bash
# Daily backup at 2 AM
0 2 * * * pg_dump -h localhost -U postgres open_doors_pos > /backups/od-pos-$(date +\%Y\%m\%d).sql
```

---

# 26. Updating an Existing Production Installation

### Safe update procedure

```bash
# 1. Back up the database
pg_dump -h localhost -U postgres open_doors_pos > backup-pre-update.sql

# 2. Pull latest code
git pull origin main

# 3. Install dependencies
npm install

# 4. Run migrations (if any new ones)
npm run db:migrate

# 5. Rebuild frontend
npm run build

# 6. Restart backend
sudo systemctl restart od-pos
# or
pm2 restart od-pos
```

### Database migrations

Check `server/migrations/` for new SQL files. Run:

```bash
npm run db:migrate
```

### Frontend deployment

The `dist/` directory is rebuilt by `npm run build`. The Express server serves `dist/` statically, so rebuilding is sufficient — no separate frontend deployment step.

### Cache / service worker updates

The service worker caches `CACHE_NAME = 'od-pos-v3'`. To force clients to update:

1. Increment `CACHE_NAME` in `src/workers/sw.js`
2. Rebuild frontend
3. Clients will automatically pick up the new service worker on next visit

### Rollback

If the update fails:

1. Restore database from backup
2. Revert code: `git checkout <previous-tag>`
3. Rebuild and restart

---

# 27. Rollback

### Application code rollback

```bash
git checkout <previous-tag-or-commit>
npm install
npm run build
sudo systemctl restart od-pos
```

### Frontend rollback

Rebuild with the previous code version. The `dist/` directory is replaced.

### Backend rollback

Restart the backend process after reverting code.

### Database migrations

**Warning**: Some migrations may be irreversible. Always back up the database before running migrations.

Check `server/migrations/001_init.sql` for the current schema. If a migration adds columns or tables, it can be rolled back manually. If it drops columns, data is lost.

---

# 28. Monitoring and Logs

### Backend logs

Logs go to stdout. With systemd:

```bash
sudo journalctl -u od-pos -f
```

With PM2:

```bash
pm2 logs od-pos
```

### Frontend errors

Check the browser console (F12 > Console). The service worker also logs to console.

### Database errors

PostgreSQL logs are at `/var/log/postgresql/` (Linux) or configured in `postgresql.conf`.

### Sync failures

Check sync status:

```bash
curl http://localhost:3005/api/sync/status -H "Authorization: Bearer <token>"
```

Or in the UI: Settings > Offline & Sync.

### Authentication failures

Check the `audit_log` table (not actively populated — see security checklist).

### Monitoring

**Not implemented.** No Prometheus, Grafana, or APM integration exists. Health check endpoint available:

```bash
curl http://localhost:3005/api/health
```

---

# 29. Health Checks

### Endpoint

```text
GET /api/health
```

### Response

```json
{
  "status": "ok",
  "uptime": 123.456,
  "timestamp": "2026-09-23T18:00:00.000Z",
  "database": {
    "ok": 1,
    "now": "2026-09-23T18:00:00.000Z",
    "poolSize": 2,
    "idleCount": 2,
    "waitingCount": 0
  }
}
```

### What it verifies

* PostgreSQL connectivity (`SELECT 1`)
* Pool size and idle connections
* Server uptime

### Additional status endpoints

```text
GET /api/sync-status        # Pending/failed sync counts
GET /api/db-stats           # Row counts per table
GET /api/mpesa/status       # M-Pesa integration status
GET /api/hardware/status    # Hardware device status
```

---

# 30. Production Verification Checklist

```text
[ ] Domain resolves
[ ] HTTPS works (if configured)
[ ] Frontend loads
[ ] Backend responds
[ ] Database connection works
[ ] Authentication works (login with admin)
[ ] Customer creation works
[ ] Service creation works
[ ] Order creation works
[ ] Payment works
[ ] Receipt works
[ ] Dashboard works
[ ] Reports work
[ ] Offline mode works
[ ] Offline transaction queues
[ ] Synchronization works
[ ] Browser refresh works
[ ] Multiple POS devices work
[ ] Backups work
[ ] M-Pesa sandbox works (if configured)
[ ] Notifications work (if provider configured)
```

---

# 31. Troubleshooting

| Problem | Likely Cause | How to Diagnose | Solution |
| ------- | ------------ | --------------- | -------- |
| Frontend doesn't start | Missing dependencies or build error | `npm run build` output | `npm install`, then `npm run build` |
| Backend doesn't start | PostgreSQL not running or wrong credentials | `curl http://localhost:3005/api/health` | Start PostgreSQL, check `.env` DB settings |
| Port 3005 already in use | Another process using the port | `lsof -i :3005` | Kill the process or change `PORT` in `.env` |
| Port 5173 already in use | Another Vite instance | `lsof -i :5173` | Kill the process |
| Database unavailable | PostgreSQL not running or wrong host | `pg_isready -h localhost -p 5432` | Start PostgreSQL, verify `DB_HOST`/`DB_PORT` |
| Migrations fail | SQL syntax error or missing permissions | Run `npm run db:migrate` manually | Check PostgreSQL user permissions |
| API returns 500 | Server error (check logs) | `curl -v http://localhost:3005/api/health` | Check server stdout/stderr |
| Authentication fails | Invalid token or expired JWT | Check `localStorage.od_auth_token` | Re-login, check `JWT_SECRET` consistency |
| CORS errors | Frontend and backend on different origins | Browser console | Configure CORS or use Vite proxy |
| Offline mode doesn't work | Service worker not registered | `navigator.serviceWorker.controller` in console | Ensure HTTPS (production), check `sw.js` path |
| Service worker doesn't update | Cache name unchanged | Check `CACHE_NAME` in `sw.js` | Increment `CACHE_NAME`, rebuild |
| Sync fails | Backend unreachable or token expired | Check sync queue via API | Verify backend running, re-login |
| LAN devices cannot connect | Firewall blocking port 3005 | `curl http://<server-ip>:3005/api/health` from client | Allow port 3005 in firewall |
| HTTPS certificate warning | Self-signed cert or expired cert | Browser address bar | Use Let's Encrypt or trusted CA |
| Production build fails | Missing dependencies or syntax error | `npm run build` output | Fix errors, rebuild |
| Printer doesn't work | Hardware abstraction not implemented | Check `GET /api/hardware/status` | Use browser print for now |
| M-Pesa not working | Sandbox mode, no real credentials | Check `GET /api/mpesa/status` | Configure Daraja credentials in settings |
| Receipt not printing | Browser print only, no ESC/POS | Check printer settings | Configure thermal printer or use browser print |

---

# 32. Useful Commands

```bash
# Install dependencies
npm install

# Development (frontend + backend)
npm run dev

# Build frontend
npm run build

# Preview production build
npm run preview

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Database
npm run db:migrate
npm run db:seed
npm run db:import-sqlite   # Optional: import from SQLite

# Server
node server/index.js

# Health check
curl http://localhost:3005/api/health

# Logs (systemd)
sudo journalctl -u od-pos -f

# Logs (PM2)
pm2 logs od-pos

# Process management
sudo systemctl start od-pos
sudo systemctl stop od-pos
sudo systemctl restart od-pos
sudo systemctl status od-pos
```

---

# 33. Deployment Quick Start

## Development

```text
1. Clone repository
2. Install dependencies (npm install)
3. Configure environment (.env from .env.example)
4. Initialize database (npm run db:migrate && npm run db:seed)
5. Start development server (npm run dev)
6. Open POS at http://localhost:5173
```

## Local Production

```text
1. Install dependencies
2. Configure production environment (.env with strong secrets)
3. Initialize database (migrate + seed)
4. Build frontend (npm run build)
5. Start backend (node server/index.js)
6. Open POS at http://localhost:3005
```

## LAN Deployment

```text
1. Prepare local server (install Node.js, PostgreSQL)
2. Configure LAN binding (server listens on 0.0.0.0)
3. Start application (node server/index.js)
4. Configure firewall (allow port 3005)
5. Find server IP (ip addr / ifconfig)
6. Open POS from client devices (http://<IP>:3005)
7. Test offline/sync
```

## Online Production

```text
1. Provision server (VPS/VM, 2GB RAM minimum)
2. Configure domain (DNS A record to server IP)
3. Install dependencies (Node.js, PostgreSQL, nginx)
4. Configure database (create DB, user, permissions)
5. Configure environment (.env with production values)
6. Run migrations (npm run db:migrate)
7. Build application (npm run build)
8. Configure reverse proxy (nginx)
9. Configure HTTPS (Let's Encrypt)
10. Start application (systemd or PM2)
11. Verify deployment (health check, login, POS workflow)
12. Configure backups (pg_dump cron job)
```

---

# Verified Against Repository

### Files inspected

* `package.json` — scripts, dependencies, ports
* `vite.config.js` — frontend dev server, proxy config, build output
* `server/index.js` — backend entry, ports, HTTPS, rate limiting, static serving
* `server/routes/index.js` — all API routes, auth middleware, settings whitelist
* `server/db/database.js` — PostgreSQL pool, query helper, sync queue
* `server/db/postgres.js` — PostgreSQL pool (duplicate)
* `server/migrations/001_init.sql` — database schema
* `server/migrations/seed.js` — seed data
* `server/migrations/import-sqlite.js` — SQLite import (optional)
* `src/main.js` — app bootstrap, auth, sync engine, service worker
* `src/api/client.js` — API client, all endpoints
* `src/auth/auth.js` — JWT token management
* `src/db/database.js` — Dexie.js IndexedDB schema
* `src/services/sync.js` — sync engine
* `src/workers/sw.js` — service worker
* `src/components/app.js` — POS, Orders, Laundry, Settings renders
* `src/components/login.js` — login form
* `index.html` — entry HTML, PWA manifest link
* `public/manifest.json` — PWA manifest
* `.env.example` — environment variables
* `.gitignore` — gitignore patterns
* `README.md` — existing documentation

### Ports verified

* `5173` — Vite dev server (frontend)
* `3005` — Express API server (HTTP)
* `3006` — Express API server (HTTPS, if certs present)
* `5432` — PostgreSQL

### Commands verified

* `npm install` — installs all dependencies
* `npm run dev` — starts frontend + backend
* `npm run build` — builds frontend to `dist/`
* `npm run preview` — previews production build
* `npm test` — runs vitest
* `npm run db:seed` — runs `server/migrations/seed.js`
* `npm run db:import-sqlite` — runs `server/migrations/import-sqlite.js`
* `npm run db:migrate` — **broken** (references missing `001_init.pgsql.js`; use psql directly or fix the script)

### Date

2026-09-23

---

# Known Gaps

1. **HTTPS bug**: `server/index.js` reads both key and cert from `cert.pem` — the key should be from `key.pem`. Fix before using HTTPS.
2. **No Docker**: No Dockerfile or docker-compose.yml exists.
3. **No nginx config**: No nginx configuration in the repository.
4. **No process manager**: No systemd/PM2 config. Must be created manually.
5. **M-Pesa mock**: M-Pesa integration is sandbox/mock only. No real Daraja API calls.
6. **Hardware mock**: All hardware status returns `connected: false`.
7. **Audit log**: Table exists but is not actively populated.
8. **No automated backups**: `backup_enabled` setting exists but no cron job or automated backup is implemented.
9. **No CORS configuration**: Relies on same-origin or Vite proxy.
10. **No password complexity**: Default admin password `admin123` must be changed manually.