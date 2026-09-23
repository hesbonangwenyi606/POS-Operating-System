import Dexie from 'dexie';

export const db = new Dexie('OpenDoorsPOS');

db.version(1).stores({
  orders: '++id, orderNumber, customerId, cashierId, branchId, status, dueDate, paymentStatus, syncStatus, syncId',
  orderItems: '++id, orderId, serviceId, sku, description, quantity, unitPrice, discount, surcharge, lineTotal',
  customers: '++id, phone, name, email, alternatePhone, address, loyaltyTier, status, createdAt',
  services: '++id, sku, name, category, description, price, unit, expressAvailable, expressSurcharge, active, barcode',
  payments: '++id, orderId, amount, method, reference, status, cashierId, createdAt, type',
  employees: '++id, username, passwordHash, role, branchId, active',
  settings: 'key, value',
  branches: '++id, code, name, address, phone',
  auditLog: '++id, userId, action, entity, entityId, oldValue, newValue, device, timestamp',
  syncQueue: '++id, entity, entityId, action, payload, status, retries, createdAt, syncedAt, idempotencyKey',
  cashShifts: '++id, cashierId, branchId, openingFloat, cashSales, refunds, cashIn, cashOut, expectedBalance, actualBalance, variance, status',
  inventory: '++id, sku, name, category, stock, reorderLevel, supplier, unit',
  expenses: '++id, category, amount, date, paymentMethod, employee, notes',
  promotions: '++id, name, type, value, startDate, endDate, maxDiscount, active',
  deliveryZones: '++id, name, fee, active',
});

db.version(2).stores({
  settings: 'key, value, updatedAt',
});

db.version(2).upgrade(async (tx) => {
  const settings = await tx.table('settings').toArray();
  for (const s of settings) {
    if (Array.isArray(s)) {
      await tx.table('settings').put({ key: s[0], value: s[1], updatedAt: Date.now() });
      await tx.table('settings').delete(s[0]);
    } else if (!s.updatedAt) {
      await tx.table('settings').put({ ...s, updatedAt: Date.now() });
    }
  }
});

export async function initDB() {
  await db.open();
  await ensureDefaults();
}

async function ensureDefaults() {
  const branches = await db.branches.toArray();
  if (branches.length === 0) {
    await db.branches.bulkAdd([
      { code: 'OD-KIT', name: 'Open Doors Kitengela', address: 'Chuna Mall, Ground Floor, Shop 10, Kitengela, Kenya', phone: '+254700000001' },
      { code: 'OD-ATHI', name: 'Open Doors Athi River', address: 'Athi River, Kenya', phone: '+254700000002' },
      { code: 'OD-KIS', name: 'Open Doors Kisaju', address: 'Kisaju, Kenya', phone: '+254700000003' },
      { code: 'OD-ISA', name: 'Open Doors Isinya', address: 'Isinya, Kenya', phone: '+254700000004' },
    ]);
  }
  const settings = await db.settings.toArray();
  if (settings.length === 0) {
    await db.settings.bulkAdd([
      { key: 'business_name', value: 'Open Doors Laundromat', updatedAt: Date.now() },
      { key: 'business_address', value: 'Chuna Mall, Ground Floor, Shop 10, Kitengela, Kenya', updatedAt: Date.now() },
      { key: 'business_phone', value: '+254700000001', updatedAt: Date.now() },
      { key: 'branch_code', value: 'OD-KIT', updatedAt: Date.now() },
      { key: 'currency', value: 'KES', updatedAt: Date.now() },
      { key: 'locale', value: 'en-KE', updatedAt: Date.now() },
      { key: 'tax_rate', value: '0', updatedAt: Date.now() },
      { key: 'tax_mode', value: 'inclusive', updatedAt: Date.now() },
      { key: 'express_surcharge_percent', value: '30', updatedAt: Date.now() },
      { key: 'normal_turnaround_hours', value: '24', updatedAt: Date.now() },
      { key: 'express_turnaround_hours', value: '4', updatedAt: Date.now() },
      { key: 'order_number_format', value: 'OD-{YYYY}-{SEQ}', updatedAt: Date.now() },
      { key: 'mpesa_environment', value: 'sandbox', updatedAt: Date.now() },
      { key: 'notification_enabled', value: 'true', updatedAt: Date.now() },
      { key: 'delivery_enabled', value: 'true', updatedAt: Date.now() },
      { key: 'dark_mode', value: 'system', updatedAt: Date.now() },
    ]);
  }
}

export function getSetting(key) { return db.settings.get(key).then(r => r?.value); }
export function setSetting(key, value) { return db.settings.put({ key, value }); }

export async function addToSyncQueue(entity, entityId, action, payload, idempotencyKey = null) {
  await db.syncQueue.add({ entity, entityId, action, payload, status: 'pending', retries: 0, createdAt: Date.now(), syncedAt: null, idempotencyKey: idempotencyKey || `${entity}:${entityId}:${action}:${Date.now()}` });
}

export async function getSyncQueue() { return db.syncQueue.where('status').equals('pending').toArray(); }
export async function markSynced(id) { await db.syncQueue.update(id, { status: 'synced', syncedAt: Date.now() }); }
export async function getSyncStatus() { const pending = await db.syncQueue.where('status').equals('pending').count(); const failed = await db.syncQueue.where('status').equals('failed').count(); return { pending, failed }; }

export function moneyToMinorUnits(amount) { return Math.round(Number(amount) * 100); }
export function minorUnitsToMoney(minor) { return minor / 100; }

export function formatMoneyKES(amount) { return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 2 }).format(amount); }

export function generateOrderNumber() {
  const year = new Date().getFullYear();
  const existing = localStorage.getItem('od-order-counter') || '0';
  const seq = (parseInt(existing) + 1).toString().padStart(6, '0');
  localStorage.setItem('od-order-counter', seq);
  return `OD-${year}-${seq}`;
}
