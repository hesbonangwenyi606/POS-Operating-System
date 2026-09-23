import Dexie from 'dexie';

export const db = new Dexie('OpenDoorsPOS');

db.version(1).stores({
  orders: '++id, orderNumber, customerId, cashierId, branchId, status, dueDate, paymentStatus, syncStatus, syncId',
  orderItems: '++id, orderId, serviceId, sku, description, quantity, unitPrice, discount, surcharge, lineTotal',
  customers: '++id, phone, name, email, alternatePhone, address, loyaltyTier, status, createdAt, updatedAt',
  services: '++id, sku, name, category, description, price, unit, expressAvailable, expressSurcharge, active, barcode',
  payments: '++id, orderId, amount, method, reference, status, cashierId, createdAt, type',
  employees: '++id, username, passwordHash, role, branchId, active',
  roles: '++id, name, permissions',
  settings: 'key, value',
  branches: '++id, code, name, address, phone',
  auditLog: '++id, userId, action, entity, entityId, oldValue, newValue, device, ip, timestamp',
  syncQueue: '++id, entity, entityId, action, payload, status, retries, createdAt, syncedAt, idempotencyKey',
  cashShifts: '++id, cashierId, branchId, openingFloat, cashSales, refunds, cashIn, cashOut, expectedBalance, actualBalance, variance, status, openedAt, closedAt',
  inventory: '++id, sku, name, category, stock, reorderLevel, supplier, unit',
  expenses: '++id, category, amount, date, paymentMethod, employee, notes',
  promotions: '++id, name, type, value, startDate, endDate, maxDiscount, active',
  deliveryZones: '++id, name, fee, active',
  posSessions: 'id, cart, customer, discountType, discountValue, turnaround, fulfilment, amountPaid, holdMode, paymentState, mpesaPhone, updatedAt',
});

db.version(2).stores({
  orders: '++id, orderNumber, customerId, cashierId, branchId, status, dueDate, paymentStatus, syncStatus, syncId, isDeleted',
  syncQueue: '++id, entity, entityId, action, payload, status, retries, createdAt, syncedAt, idempotencyKey',
});

db.version(3).stores({
  settings: 'key, value, updatedAt',
});

db.version(3).upgrade(async (tx) => {
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
  try {
    await db.open();
    await ensureDefaults();
  } catch (err) {
    console.error('[Dexie] Startup error:', err.message);
    throw err;
  }
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
  const roles = await db.roles.toArray();
  if (roles.length === 0) {
    await db.roles.bulkAdd([
      { name: 'owner', permissions: JSON.stringify(['*']) },
      { name: 'manager', permissions: JSON.stringify(['create_order','edit_order','cancel_order','apply_discount','refund_payment','manage_services','view_reports','export_reports','manage_users','manage_settings','close_shift']) },
      { name: 'cashier', permissions: JSON.stringify(['create_order','edit_order','apply_discount','view_reports']) },
      { name: 'laundry_staff', permissions: JSON.stringify(['update_workflow','view_orders']) },
      { name: 'delivery_staff', permissions: JSON.stringify(['update_delivery','view_orders']) },
      { name: 'viewer', permissions: JSON.stringify(['view_reports']) },
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
      { key: 'receipt_format', value: 'thermal_80mm', updatedAt: Date.now() },
      { key: 'order_number_format', value: 'OD-{YYYY}-{SEQ}', updatedAt: Date.now() },
      { key: 'next_order_number', value: '1', updatedAt: Date.now() },
      { key: 'mpesa_callback_url', value: '/api/mpesa/callback', updatedAt: Date.now() },
      { key: 'mpesa_consumer_key', value: '', updatedAt: Date.now() },
      { key: 'mpesa_consumer_secret', value: '', updatedAt: Date.now() },
      { key: 'mpesa_passkey', value: '', updatedAt: Date.now() },
      { key: 'mpesa_environment', value: 'sandbox', updatedAt: Date.now() },
      { key: 'sms_provider', value: '', updatedAt: Date.now() },
      { key: 'whatsapp_provider', value: '', updatedAt: Date.now() },
      { key: 'notification_enabled', value: 'true', updatedAt: Date.now() },
      { key: 'auto_sync', value: 'true', updatedAt: Date.now() },
      { key: 'sync_interval_seconds', value: '30', updatedAt: Date.now() },
      { key: 'backup_enabled', value: 'true', updatedAt: Date.now() },
      { key: 'backup_interval_hours', value: '24', updatedAt: Date.now() },
      { key: 'dark_mode', value: 'system', updatedAt: Date.now() },
      { key: 'printer_type', value: 'browser', updatedAt: Date.now() },
      { key: 'hardware_cash_drawer', value: 'false', updatedAt: Date.now() },
      { key: 'hardware_barcode_scanner', value: 'false', updatedAt: Date.now() },
      { key: 'hardware_scale', value: 'false', updatedAt: Date.now() },
      { key: 'inventory_enabled', value: 'false', updatedAt: Date.now() },
      { key: 'loyalty_enabled', value: 'false', updatedAt: Date.now() },
      { key: 'delivery_enabled', value: 'true', updatedAt: Date.now() },
      { key: 'workflow_stages', value: 'Received|Sorting|Washing|Drying|Ironing|Folding|Quality Check|Ready|Collected', updatedAt: Date.now() },
    ]);
  }
}

export function getSetting(key) {
  return db.settings.get(key).then(r => r?.value ?? null);
}

export function setSetting(key, value) {
  return db.settings.put({ key, value, updatedAt: Date.now() });
}

export function getBranch() {
  return db.branches.get(getSetting('branch_code'));
}

export function moneyToMinorUnits(amount) {
  return Math.round(Number(amount) * 100);
}

export function minorUnitsToMoney(minor) {
  return (minor / 100).toFixed(2);
}

export function safeAdd(a, b) {
  return moneyToMinorUnits(a) + moneyToMinorUnits(b);
}

export function safeSubtract(a, b) {
  return moneyToMinorUnits(a) - moneyToMinorUnits(b);
}

export function safeMultiply(a, b) {
  return moneyToMinorUnits(a) * b;
}

export function safeDivide(minor, divisor) {
  return Math.round(minor / divisor);
}

export function formatMoneyKES(amount) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 2 }).format(amount);
}

export function generateOrderNumber() {
  const year = new Date().getFullYear();
  const counter = localStorage.getItem('od-order-counter') || '0';
  const seq = (parseInt(counter) + 1).toString().padStart(6, '0');
  localStorage.setItem('od-order-counter', seq);
  return `OD-${year}-${seq}`;
}

export async function addToSyncQueue(entity, entityId, action, payload, idempotencyKey = null) {
  const key = idempotencyKey || `${entity}:${entityId}:${action}:${Date.now()}`;
  await db.syncQueue.add({ entity, entityId, action, payload, status: 'pending', retries: 0, createdAt: Date.now(), syncedAt: null, idempotencyKey: key });
}

export async function getSyncQueue() {
  return db.syncQueue.where('status').equals('pending').toArray();
}

export async function markSynced(id) {
  await db.syncQueue.update(id, { status: 'synced', syncedAt: Date.now() });
}

export async function markSyncFailed(id) {
  const row = await db.syncQueue.get(id);
  await db.syncQueue.update(id, { status: 'failed', retries: (row?.retries || 0) + 1 });
}

export async function getSyncStatus() {
  const pending = await db.syncQueue.where('status').equals('pending').count();
  const failed = await db.syncQueue.where('status').equals('failed').count();
  return { pending, failed, lastSync: await getSetting('last_sync_at') };
}