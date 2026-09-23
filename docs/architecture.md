# Architecture Documentation

## Overview

Open Doors Laundromat POS v2.0 uses a modular monolith architecture with a clear separation between the frontend, backend API, and data layers.

## Frontend (Browser)

The frontend is a vanilla JavaScript PWA that runs in any modern browser. It does NOT use a heavy framework — instead, it uses well-structured modules.

### Module Structure

```
src/
├── main.js              # Entry point and state management
├── db/
│   └── indexedDB.js     # Dexie.js IndexedDB layer
├── api/
│   └── client.js        # API client with offline fallback
├── auth/
│   └── auth.js          # JWT-based authentication
├── services/
│   ├── orders.js        # Order business logic
│   ├── payments.js      # Payment processing
│   ├── customers.js     # Customer management
│   ├── services.js      # Service catalog
│   ├── reports.js       # Reporting
│   └── sync.js          # Synchronization engine
├── components/
│   ├── app.js           # Main UI renderer
│   └── login.js         # Login screen
├── integrations/        # M-Pesa, SMS, WhatsApp
├── hardware/            # Printer, scanner, scale adapters
├── utils/
│   ├── money.js         # KES calculations (integer minor units)
│   └── helpers.js       # Utilities (phone, dates, etc.)
├── styles/
│   └── main.css         # Neo-brutalist styling
└── workers/
    └── sw.js            # Service worker for PWA/offline
```

### Data Flow

1. User action triggers a service method
2. Service validates and prepares data
3. Data is saved to IndexedDB (local)
4. Operation added to sync queue
5. API call made to backend
6. On success, server confirms and sync queue is cleared
7. On failure, retry mechanism handles it

## Backend (API Server)

The backend is an Express.js server that provides a REST API and handles authentication.

### Database Layer

- **Primary**: Better-SQLite3 for persistent storage
- **Schema**: 16+ tables for orders, customers, services, payments, etc.
- **Migrations**: Schema versioned in `server/db/database.js`

### API Design

All API routes follow REST conventions:
- `/api/auth/*` — Authentication
- `/api/orders/*` — Order CRUD
- `/api/payments/*` — Payment processing
- `/api/customers/*` — Customer management
- `/api/services/*` — Service catalog
- `/api/reports/*` — Reporting
- `/api/sync/*` — Synchronization
- `/api/mpesa/*` — M-Pesa integration
- `/api/settings/*` — System settings
- `/api/backup/*` — Backup/restore

## Offline-First Design

The system is designed to work without internet:

1. **IndexedDB** stores all data locally
2. **Dexie.js** provides a clean abstraction over IndexedDB
3. **Sync queue** captures operations when offline
4. **Service worker** caches assets and API responses
5. **Connection status** indicator shows online/offline state
6. **Idempotency keys** prevent duplicate operations on retry

## Authentication

- JWT tokens with 24-hour expiry
- Role-based access control (6 roles)
- All API calls require Bearer token
- No credentials in frontend source code
- Passwords stored as hashes

## Money Handling

All financial calculations use integer minor units (cents) to avoid floating-point errors:
- KES 100.50 = 10050 minor units
- All arithmetic uses integer operations
- Formatting converts back to display format

## Hardware Abstraction

The `src/hardware/` module provides interfaces for:
- Receipt printers (browser print → ESC/POS)
- Barcode scanners (USB keyboard input)
- Cash drawers (serial/USB trigger)
- Weighing scales (serial/API)
- Customer displays

## Multi-Branch Support

The system supports multiple branches with:
- Branch-specific configuration
- Branch-level reporting
- Multi-user access across branches
- Centralized inventory (optional)

## Synchronization

The sync engine uses an outbox pattern:
1. Local operation executed immediately
2. Operation recorded in sync queue
3. When online, queue is processed
4. Server responds with success/failure
5. Operations marked as synced or retried
6. Failed operations require manual retry
