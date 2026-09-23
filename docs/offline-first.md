# Offline-First Design

## Philosophy

The POS must work without internet. Cashiers should never be blocked from creating orders, accepting payments, or updating laundry status.

## Data Layer

### IndexedDB (Dexie.js)

All application data is stored in IndexedDB via Dexie.js. This includes:
- Orders (with full item details)
- Customers
- Services
- Payments
- Settings
- Sync queue
- Audit logs
- Cash shifts
- Inventory

### Local-First Operations

1. When a cashier creates an order, it is saved to IndexedDB immediately
2. The operation is added to the sync queue
3. The cashier continues working without waiting
4. When the connection is restored, the sync engine processes pending operations
5. Server acknowledges and clears the queue

### Connection Status

The UI shows a persistent connection indicator:
- 🟢 Online
- 🔴 Offline
- 🟡 Syncing (when reconnected and processing queue)

### Duplicate Prevention

Each operation has an idempotency key. If a retry sends the same operation twice, the server recognizes it and does not create a duplicate.

## Service Worker

The service worker (`src/workers/sw.js`) handles:
- Asset caching for offline shell
- API response caching (network-first strategy)
- Background sync when reconnected
- Offline fallback pages

### Cache Strategies

- **API calls**: Network-first, fall back to cache
- **Assets**: Cache-first, update in background
- **Sync operations**: Background sync when connection returns

## Offline Scenarios

### Create Order Offline
1. User fills checkout form
2. Order saved to IndexedDB immediately
3. Sync queue updated
4. Receipt generated
5. When online, sync to server

### Accept Payment Offline
1. Cash payment recorded locally
2. M-Pesa manual payment recorded with reference
3. Live STK Push not available offline
4. Balance updated locally
5. Sync when reconnected

### Update Workflow Offline
1. Status changes saved locally
2. Workflow history recorded
3. Sync when reconnected

## Reconnection

When the connection returns:
1. Sync engine automatically processes queue
2. Failed operations are retried
3. User notified of sync status
4. Dashboard updates with synced data
