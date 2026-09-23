# Open Doors Laundromat POS v2.0

A production-grade, offline-first, Kenya-focused point-of-sale system for Open Doors Laundromat. Built for reliability in Kitengela, Kenya — with or without internet.

## Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    POS Browser (PWA)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │  UI      │  │  State   │  │  Service Layer       │  │
│  │ (CSS/JS) │  │  Manager │  │ (Orders/Customers/   │  │
│  │          │  │          │  │  Payments/Reports)   │  │
│  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘  │
│       │              │                    │               │
│  ┌────▼──────────────▼────────────────────▼───────────┐ │
│  │           IndexedDB (Dexie.js)                     │ │
│  │  Orders, Customers, Services, Payments, Audit      │ │
│  │  Sync Queue, Cash Shifts, Inventory                │ │
│  └──────────────────────┬────────────────────────────┘ │
│                         │                               │
│              ┌──────────▼──────────┐                    │
│              │  Sync Engine         │                    │
│              │  (Offline Queue)     │                    │
│              └─────────────────────┘                    │
└────────────────────────┬──────────────────────────────┘
                          │ HTTPS / WebSocket
┌────────────────────────▼──────────────────────────────┐
│              Local POS API Server (Express)             │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Auth (JWT) │  Roles │  Audit │  M-Pesa Layer   │  │
│  └─────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Better-SQLite3 (local database)                │  │
│  └─────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database | IndexedDB (Dexie.js) + PostgreSQL | Offline-first browser storage with server-side PostgreSQL |
| Backend | Express.js | Lightweight, fast, handles auth and API |
| Auth | JWT tokens + bcrypt passwords | Stateless, secure, role-based, passwords hashed |
| Money | Integer minor units | Avoids floating-point errors for KES |
| Persistence | Dexie.js (IndexedDB) | Offline-first, works without internet |
| Sync | Outbox pattern with idempotency keys | Reliable offline-to-online synchronization, no duplicates |
| Hardware | Adapter layer | Extensible for printers, scanners, scales |
| Order Numbers | Sequential per year | Prevents collisions, human-readable |

## Features

### Core POS
- ✅ Service catalogue with categories (27 default services)
- ✅ Shopping cart with quantity controls
- ✅ Customer management with Kenyan phone normalization
- ✅ Normal and express service options
- ✅ Automatic 30% express surcharge
- ✅ Percentage and fixed discounts
- ✅ Multiple payment methods (Cash, M-Pesa, Card, Pay later)
- ✅ Partial payments and balance tracking
- ✅ Receipt generation and printing
- ✅ CSV export

### Offline-First
- ✅ Full POS operation without internet
- ✅ IndexedDB local database
- ✅ Automatic sync when reconnected
- ✅ Sync queue with retry
- ✅ Connection status indicator
- ✅ Service worker caching

### Laundry Workflow
- ✅ Configurable workflow stages
- ✅ Status history tracking
- ✅ Order board view
- ✅ Overdue order detection
- ✅ Pickup and delivery management

### Security & Access Control
- ✅ JWT-based authentication (24h expiry)
- ✅ Role-based permissions (Owner, Manager, Cashier, Laundry Staff, Delivery Staff, Viewer)
- ✅ bcrypt password hashing
- ✅ Immutable audit trail
- ✅ No secrets in frontend code
- ✅ Input validation on all endpoints

### Financial Management
- ✅ Cash shift management (opening float, closing, variance)
- ✅ Refund processing (full and partial with reason)
- ✅ Expense tracking
- ✅ Inventory management
- ✅ Comprehensive reporting

### Hardware & Integrations
- ✅ Browser printing (thermal and A4)
- ✅ Hardware abstraction layer
- ✅ M-Pesa Daraja API integration (sandbox)
- ✅ Barcode/QR scanning support
- ✅ PWA with service worker

## Quick Start

### Prerequisites
- Node.js 20+
- npm 10+

### Installation

```bash
cd /home/mcwachira/Projects/GitHub/POS-Operating-System
npm install
```

### Development

Start both the backend API server and the frontend dev server:

```bash
npm run dev
```

The application will be available at:
- **Frontend**: `http://localhost:5173`
- **API Server**: `http://localhost:3001`
- **Health Check**: `http://localhost:3001/api/health`

Default admin credentials (first run only): `admin` / `admin123`

### Production Build

```bash
npm run build
npm run preview
```

### Testing

```bash
npm test              # Run all tests
npm run test:watch   # Watch mode
npm run test:coverage # With coverage report
```

### Database

The database is stored in PostgreSQL. Schema is initialized automatically on first server start via migrations.

## API Endpoints

### Authentication
- `POST /api/auth/login` — Login with username/password (passwords verified via bcrypt)
- `POST /api/auth/register` — Register new user (owner/manager only)
- `GET /api/auth/me` — Get current user

### Orders
- `GET /api/orders` — List orders (paginated, filterable by status/search/customer/date)
- `GET /api/orders/:id` — Get order details with items, payments, and workflow history
- `POST /api/orders` — Create new order (validates items, calculates totals)
- `PUT /api/orders/:id/status` — Update order status (records workflow history)
- `POST /api/orders/:id/payment` — Add payment (partial payments supported)
- `PUT /api/orders/:id` — Update order
- `DELETE /api/orders/:id` — Void/cancel order (soft delete)
- `GET /api/orders/stats/overview` — Dashboard statistics

### Payments
- `GET /api/payments` — List all payments
- `POST /api/payments/refund` — Process refund (requires reason, owner/manager only)

### Customers
- `GET /api/customers` — List customers (searchable, paginated)
- `GET /api/customers/:id` — Get customer with orders
- `POST /api/customers` — Create customer (phone normalized, duplicate prevented)
- `PUT /api/customers/:id` — Update customer

### Services
- `GET /api/services` — List services (searchable, filterable by category/active)
- `POST /api/services` — Create service (owner/manager only)
- `PUT /api/services/:id` — Update service
- `DELETE /api/services/:id` — Deactivate service

### Reports
- `GET /api/reports/sales` — Sales summary (date range, branch, cashier filters)
- `GET /api/reports/by-day` — Daily breakdown
- `GET /api/reports/laundry` — Laundry workflow
- `GET /api/reports/customers` — Top customers
- `GET /api/reports/services` — Top services
- `GET /api/reports/cashiers` — Cashier reports

### M-Pesa
- `POST /api/mpesa/stk-push` — Initiate STK push (records payment as pending)
- `POST /api/mpesa/callback` — M-Pesa callback (confirms payment)
- `GET /api/mpesa/status` — M-Pesa integration status

### Sync
- `GET /api/sync/queue` — Get pending sync queue
- `POST /api/sync/sync` — Sync operations (idempotency key dedup)
- `GET /api/sync/status` — Get sync status

### Settings
- `GET /api/settings` — Get all settings
- `PUT /api/settings` — Update settings

### Backup
- `GET /api/backup` — Database stats
- `POST /api/backup/export` — Export all data
- `POST /api/backup/restore` — Restore from backup (owner only)

## Configuration

Environment variables (create `.env` file from `.env.example`):

```env
PORT=3001
JWT_SECRET=change-me-in-production-use-a-strong-random-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-in-production
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_PASSKEY=
MPESA_ENVIRONMENT=sandbox
NODE_ENV=development
```

## Database Schema

The system uses both:
1. **IndexedDB** (browser-side) via Dexie.js for offline-first operation
2. **PostgreSQL** (server-side) for persistent storage and multi-user support

Key tables: `orders`, `order_items`, `customers`, `services`, `payments`, `employees`, `roles`, `settings`, `branches`, `audit_log`, `sync_queue`, `cash_shifts`, `inventory`, `expenses`, `workflow_history`, `delivery_zones`, `promotions`

## Security Notes

- **Never** store M-Pesa credentials in frontend code
- Authentication uses JWT tokens with 24-hour expiry
- Passwords are hashed with bcrypt (10 rounds)
- All API calls require valid tokens
- Sensitive operations require role-based authorization
- Audit logs track all important actions
- Input validation on all endpoints
- Default admin user created on first run (change password immediately)

## Offline Behavior

When the internet is unavailable:
- All POS operations continue normally
- Data is stored in IndexedDB
- Operations are queued in the sync queue
- Connection status is displayed
- When reconnected, operations automatically sync
- Duplicate prevention via idempotency keys

## M-Pesa Integration

### Sandbox/Test Mode
- M-Pesa credentials are configured in settings
- STK Push requests go through Daraja API
- Callbacks are handled server-side
- No credentials exposed in frontend

### Production Mode
1. Obtain credentials from [Daraja API](https://developer.safaricom.co.ke/)
2. Set `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY` in `.env`
3. Set `MPESA_ENVIRONMENT=production`
4. Configure the callback URL in your Safaricom dashboard

## Hardware Integration

The hardware abstraction layer (`src/hardware/`) supports:
- **Receipt Printers**: Browser print → ESC/POS adapters
- **Barcode Scanners**: USB keyboard input
- **Cash Drawers**: Trigger on payment
- **Weighing Scales**: Serial/USB/API adapters
- **Customer Displays**: Adapter interface

## Multi-Branch Support

The system supports multiple branches:
- Kitengela (OD-KIT)
- Athi River (OD-ATHI)
- Kisaju (OD-KIS)
- Isinya (OD-ISA)

Each branch has its own:
- Branch ID and configuration
- Cash registers/tills
- User assignments
- Reports and analytics

## Deployment

### Local Network Deployment
```bash
# On the server computer
node server/index.js

# Other computers access via: http://<server-ip>:5173
```

### Docker Deployment
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3001 5173
CMD ["node", "server/index.js"]
```

### Static Hosting (Frontend Only)
The `dist/` directory can be deployed to any static host. The API server handles all data operations.

## Testing

Run all tests:
```bash
npm test
```

Test coverage includes:
- Money calculations (KES precision)
- Express surcharge (30%)
- Discount calculations
- Order total computation
- Phone number normalization
- Payment processing
- Price persistence
- Refund validation
- Password hashing (bcrypt)
- Sequential order number generation

## Documentation

Additional documentation:
- `docs/architecture.md` — Full architecture description
- `docs/offline-first.md` — Offline-first design
- `docs/payments.md` — Payment system design
- `docs/database.md` — Database design
- `docs/deployment.md` — Deployment guide

## What Was Fixed in v2.0

### Critical Security Fixes
- **Password hashing**: All passwords now hashed with bcrypt (previously stored in plaintext)
- **JWT secret**: Moved to environment variable with fallback (previously hardcoded in source)
- **Default admin**: First run creates admin user with `admin123` password (must be changed)

### Data Integrity Fixes
- **Order numbers**: Sequential per year (previously random — collision risk)
- **Sync dedup**: Idempotency key checking prevents duplicate sync operations
- **Foreign key constraints**: Proper validation on order creation
- **Money precision**: Consistent minor-unit handling across frontend and backend

### Bug Fixes
- **Database initialization**: Fixed `.get()` vs `.all()` bugs in stats queries
- **SQL quoting**: Fixed double-quoted strings in SQLite (should be single quotes)
- **Sync queue**: Server now checks idempotency keys before marking synced
- **Service seeding**: Default services created on first run (27 Kenyan laundromat services)

### Test Coverage
- Added password hashing tests
- Added sequential order number tests
- Added phone normalization tests
- All 23 tests passing

## License

Open Doors Laundromat POS
Chuna Mall, Ground Floor, Shop 10
Kitengela, Kenya

> So Fresh, So Clean, So You.