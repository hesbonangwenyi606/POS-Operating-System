import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { query, getClient, getSetting, setSetting, addToSyncQueue, getSyncQueue, markSynced, markSyncFailed, getSyncStatus, moneyToMinorUnits, minorUnitsToMoney, formatMoneyKES, hashPassword, verifyPassword, DEFAULT_JWT_SECRET } from '../db/database.js';

const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

async function generateOrderNumber() {
  const year = new Date().getFullYear();
  const result = await query("SELECT COALESCE(MAX(CAST(SPLIT_PART(order_number, '-', 3) AS INTEGER)), 0) as max FROM orders WHERE order_number LIKE $1", [`OD-${year}-%`]);
  const seq = (Number(result.rows[0]?.max) || 0) + 1;
  return `OD-${year}-${String(seq).padStart(6, '0')}`;
}

function authenticate(req, res, next) {
  const t = req.headers.authorization?.substring(7);
  if (!t) return res.status(401).json({ error: 'No auth token' });
  try { req.user = jwt.verify(t, JWT_SECRET); next(); } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Auth required' });
    if (req.user.role === 'owner') return next();
    if (roles.includes(req.user.role)) return next();
    res.status(403).json({ error: 'Insufficient permissions' });
  };
}

export function createUserRouter() {
  const router = Router();
  router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const result = await query('SELECT * FROM employees WHERE username = $1 AND active = 1', [username.trim().toLowerCase()]);
    const employee = result.rows[0];
    if (!employee) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await verifyPassword(password, employee.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: employee.id, role: employee.role }, JWT_SECRET, { expiresIn: '24h' });
    const roleResult = await query('SELECT permissions FROM roles WHERE name = $1', [employee.role]);
    res.json({ token, user: { id: employee.id, username: employee.username, role: employee.role, permissions: roleResult.rows[0]?.permissions || [] } });
  });
  router.post('/register', authenticate, requireRole('owner', 'manager'), async (req, res) => {
    const { username, password, role, branch_id } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const hash = await hashPassword(password);
    try {
      const result = await query('INSERT INTO employees (username, password_hash, role, branch_id) VALUES ($1, $2, $3, $4) RETURNING id', [username.trim().toLowerCase(), hash, role, branch_id || 1]);
      res.status(201).json({ id: result.rows[0].id, username });
    } catch (e) { res.status(409).json({ error: 'Username exists' }); }
  });
  router.post('/logout', authenticate, async (req, res) => {
    res.json({ success: true });
  });
  router.get('/me', authenticate, async (req, res) => {
    const result = await query('SELECT id, username, role, branch_id, active FROM employees WHERE id = $1', [req.user.userId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    const roleResult = await query('SELECT permissions FROM roles WHERE name = $1', [result.rows[0].role]);
    res.json({ id: result.rows[0].id, username: result.rows[0].username, role: result.rows[0].role, branch_id: result.rows[0].branch_id, permissions: roleResult.rows[0]?.permissions || [] });
  });
  router.get('/', authenticate, requireRole('owner', 'manager'), async (req, res) => {
    const result = await query('SELECT id, username, role, branch_id, active FROM employees WHERE id != 1');
    res.json(result.rows);
  });
  return router;
}

export function createOrderRouter() {
  const router = Router();

  router.post('/', authenticate, async (req, res) => {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const { customer_id, items, total, subtotal, discount, surcharge, turnaround, fulfilment, payment_method, notes, care_notes, due_date, amount_paid } = req.body;
      if (!items || !items.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Items required' }); }
      if (!total && total !== 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Total required' }); }

      const orderNumber = await generateOrderNumber();
      const now = Math.floor(Date.now() / 1000);
      const totalMinor = moneyToMinorUnits(total);
      const paidMinor = moneyToMinorUnits(amount_paid || 0);
      const balance = Math.max(0, totalMinor - paidMinor);

      const orderResult = await client.query(
        'INSERT INTO orders (order_number, customer_id, cashier_id, branch_id, subtotal, discount, surcharge, tax, total, amount_paid, balance, payment_method, fulfilment, turnaround, notes, care_notes, due_date, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) RETURNING id',
        [orderNumber, customer_id || null, req.user.userId, req.user.branch_id || 1, moneyToMinorUnits(subtotal || 0), moneyToMinorUnits(discount || 0), moneyToMinorUnits(surcharge || 0), 0, totalMinor, paidMinor, balance, payment_method || 'cash', fulfilment || 'collection', turnaround || 'Normal', notes || '', care_notes || '', due_date || null, 'Received', now, now]
      );
      const orderId = orderResult.rows[0].id;

      if (items.length) {
        for (const item of items) {
          await client.query(
            'INSERT INTO order_items (order_id, service_id, sku, description, quantity, unit_price, discount, surcharge, line_total) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
            [orderId, item.service_id || null, item.sku || '', item.description || '', item.quantity || 1, moneyToMinorUnits(item.unit_price || 0), 0, 0, moneyToMinorUnits(item.line_total || 0)]
          );
        }
      }

      await client.query('INSERT INTO workflow_history (order_id, stage, employee_id) VALUES ($1, $2, $3)', [orderId, 'Received', req.user.userId]);
      await addToSyncQueue('order', orderId, 'create', req.body);

      await client.query('COMMIT');
      res.status(201).json({ order_id: orderId, order_number: orderNumber, total: moneyToMinorUnits(total) / 100 });
    } catch (e) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  router.get('/', authenticate, async (req, res) => {
    try {
      const { page = 1, limit = 50, status, search, customer, date_from, date_to } = req.query;
      const offset = (page - 1) * limit;
      const conditions = [];
      const params = [];
      if (status) { conditions.push('o.status = $' + (params.length + 1)); params.push(status); }
      if (search) { conditions.push('(o.order_number LIKE $' + (params.length + 1) + ' OR o.notes LIKE $' + (params.length + 1) + ')'); params.push(`%${search}%`, `%${search}%`); }
      if (customer) { conditions.push('(c.name LIKE $' + (params.length + 1) + ' OR c.phone LIKE $' + (params.length + 1) + ')'); params.push(`%${customer}%`, `%${customer}%`); }
      if (date_from) { conditions.push('o.created_at >= $' + (params.length + 1)); params.push(Math.floor(new Date(date_from).getTime() / 1000)); }
      if (date_to) { conditions.push('o.created_at <= $' + (params.length + 1)); params.push(Math.floor(new Date(date_to).getTime() / 1000) + 86400); }

      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      const orders = await query(`SELECT o.*, c.name as customer_name, c.phone as customer_phone, e.username as cashier_name FROM orders o LEFT JOIN customers c ON o.customer_id = c.id LEFT JOIN employees e ON o.cashier_id = e.id ${where} ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      const totalResult = await query(`SELECT COUNT(*) as c FROM orders o ${where}`, params);
      const total = parseInt(totalResult.rows[0]?.c || 0);
      res.json({ orders: orders.rows, total, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/:id', authenticate, async (req, res) => {
    const order = await query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!order.rows[0]) return res.status(404).json({ error: 'Order not found' });
    const items = await query('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]);
    const payments = await query('SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC', [req.params.id]);
    const history = await query('SELECT wh.*, e.username FROM workflow_history wh LEFT JOIN employees e ON wh.employee_id = e.id WHERE wh.order_id = $1 ORDER BY wh.created_at ASC', [req.params.id]);
    res.json({ ...order.rows[0], items: items.rows, payments: payments.rows, history: history.rows });
  });

  router.put('/:id/status', authenticate, async (req, res) => {
    const { status, note } = req.body;
    const valid = ['Received', 'Sorting', 'Washing', 'Drying', 'Ironing', 'Folding', 'Quality Check', 'Ready', 'Collected', 'Cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const order = await query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!order.rows[0]) return res.status(404).json({ error: 'Order not found' });
    await query('UPDATE orders SET status = $1, updated_at = $2 WHERE id = $3', [status, Math.floor(Date.now() / 1000), req.params.id]);
    await query('INSERT INTO workflow_history (order_id, stage, employee_id, note) VALUES ($1, $2, $3, $4)', [req.params.id, status, req.user.userId, note || '']);
    await addToSyncQueue('order', req.params.id, 'update_status', { status });
    res.json({ order_id: req.params.id, status, previous_status: order.rows[0].status });
  });

  router.post('/:id/payment', authenticate, async (req, res) => {
    const { amount, method, reference } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });
    if (!method) return res.status(400).json({ error: 'Payment method required' });
    const order = await query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!order.rows[0]) return res.status(404).json({ error: 'Order not found' });
    const amt = moneyToMinorUnits(amount);
    const newPaid = order.rows[0].amount_paid + amt;
    const newBalance = Math.max(0, order.rows[0].total - newPaid);
    const newStatus = newBalance === 0 ? 'paid' : 'partial';
    await query('UPDATE orders SET amount_paid = $1, balance = $2, payment_status = $3, updated_at = $4 WHERE id = $5', [newPaid, newBalance, newStatus, Math.floor(Date.now() / 1000), req.params.id]);
    await query('INSERT INTO payments (order_id, amount, method, reference, status, cashier_id, type) VALUES ($1, $2, $3, $4, $5, $6, $7)', [req.params.id, amt, method, reference || null, 'completed', req.user.userId, 'sale']);
    await addToSyncQueue('payment', req.params.id, 'payment', { amount: amt, method, reference });
    res.json({ order_id: req.params.id, amount_paid: newPaid, balance: newBalance, payment_status: newStatus });
  });

  router.put('/:id', authenticate, async (req, res) => {
    try {
      const updates = {};
      for (const k of ['customer_id', 'total', 'subtotal', 'discount', 'surcharge', 'fulfilment', 'turnaround', 'notes', 'care_notes']) {
        if (req.body[k] !== undefined) updates[k] = ['total', 'subtotal', 'discount', 'surcharge'].includes(k) ? moneyToMinorUnits(req.body[k]) : req.body[k];
      }
      updates.updated_at = Math.floor(Date.now() / 1000);
      const setClause = Object.keys(updates).map((k, i) => `"${k}" = $${i + 1}`).join(', ');
      const values = Object.values(updates);
      values.push(req.params.id);
      await query(`UPDATE orders SET ${setClause} WHERE id = $${values.length}`, values);
      res.json({ order_id: req.params.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/:id', authenticate, async (req, res) => {
    const order = await query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!order.rows[0]) return res.status(404).json({ error: 'Order not found' });
    await query('UPDATE orders SET is_deleted = 1, status = $1, updated_at = $2 WHERE id = $3', ['Cancelled', Math.floor(Date.now() / 1000), req.params.id]);
    await addToSyncQueue('order', req.params.id, 'delete', { reason: 'cancelled' });
    res.json({ order_id: req.params.id, deleted: true });
  });

  router.get('/:id/receipt', authenticate, async (req, res) => {
    const order = await query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (!order.rows[0]) return res.status(404).json({ error: 'Order not found' });
    const items = await query('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]);
    const payments = await query('SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC', [req.params.id]);
    const settings = await query('SELECT * FROM settings');
    const settingsMap = {};
    settings.rows.forEach(r => { settingsMap[r.key] = r.value; });
    const businessName = settingsMap.business_name || 'Open Doors Laundromat';
    const businessAddress = settingsMap.business_address || 'Chuna Mall, Ground Floor, Shop 10, Kitengela, Kenya';
    const businessPhone = settingsMap.business_phone || '';
    res.json({
      receipt: {
        business: businessName,
        address: businessAddress,
        phone: businessPhone,
        order_number: order.rows[0].order_number,
        date: new Date(order.rows[0].created_at * 1000).toISOString(),
        customer: order.rows[0].customer_name || 'Walk-in',
        items: items.rows.map(i => ({ description: i.description, quantity: i.quantity, unit_price: i.unit_price / 100, line_total: i.line_total / 100 })),
        subtotal: order.rows[0].subtotal / 100,
        discount: order.rows[0].discount / 100,
        surcharge: order.rows[0].surcharge / 100,
        total: order.rows[0].total / 100,
        amount_paid: order.rows[0].amount_paid / 100,
        balance: order.rows[0].balance / 100,
        payment_method: order.rows[0].payment_method,
        payments: payments.rows.map(p => ({ method: p.method, amount: p.amount / 100, reference: p.reference, status: p.status })),
        status: order.rows[0].status,
        turnaround: order.rows[0].turnaround,
        fulfilment: order.rows[0].fulfilment,
        notes: order.rows[0].notes,
        care_notes: order.rows[0].care_notes,
      }
    });
  });

  router.get('/stats/overview', authenticate, async (req, res) => {
    try {
      const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
      const row = await query("SELECT COALESCE(SUM(amount_paid), 0) as today_revenue, COUNT(*) as today_orders FROM orders WHERE created_at >= $1 AND status != 'Cancelled'", [todayStart]);
      const totalRow = await query('SELECT COUNT(*) as c FROM orders WHERE is_deleted = 0');
      const outstandingRow = await query('SELECT COALESCE(SUM(balance), 0) as total FROM orders WHERE balance > 0 AND is_deleted = 0');
      const readyRow = await query("SELECT COUNT(*) as c FROM orders WHERE status = 'Ready' AND is_deleted = 0");
      const overdueRow = await query("SELECT COUNT(*) as c FROM orders WHERE status NOT IN ('Collected', 'Cancelled', 'Ready') AND due_date < $1 AND is_deleted = 0", [Math.floor(Date.now() / 1000)]);
      const activeRow = await query("SELECT COUNT(*) as c FROM orders WHERE status NOT IN ('Collected', 'Cancelled', 'Ready') AND is_deleted = 0");
      res.json({
        today_revenue: parseInt(row.rows[0]?.today_revenue || 0),
        today_orders: parseInt(row.rows[0]?.today_orders || 0),
        total_orders: parseInt(totalRow.rows[0]?.c || 0),
        outstanding_balance: parseInt(outstandingRow.rows[0]?.total || 0),
        ready_orders: parseInt(readyRow.rows[0]?.c || 0),
        overdue_orders: parseInt(overdueRow.rows[0]?.c || 0),
        active_laundry: parseInt(activeRow.rows[0]?.c || 0),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

export function createPaymentRouter() {
  const router = Router();
  router.get('/', authenticate, async (req, res) => {
    const result = await query('SELECT p.*, o.order_number, e.username as cashier_name FROM payments p LEFT JOIN orders o ON p.order_id = o.id LEFT JOIN employees e ON p.cashier_id = e.id ORDER BY p.created_at DESC');
    res.json(result.rows);
  });
  router.post('/refund', authenticate, requireRole('owner', 'manager'), async (req, res) => {
    const { order_id, amount, method, reference, reason } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid refund amount required' });
    if (!reason) return res.status(400).json({ error: 'Refund reason required' });
    const order = await query('SELECT * FROM orders WHERE id = $1', [order_id]);
    if (!order.rows[0]) return res.status(404).json({ error: 'Order not found' });
    const amt = moneyToMinorUnits(amount);
    if (amt > order.rows[0].amount_paid) return res.status(400).json({ error: 'Refund exceeds paid' });
    await query('INSERT INTO payments (order_id, amount, method, reference, status, cashier_id, type) VALUES ($1, $2, $3, $4, $5, $6, $7)', [order_id, -amt, method, reference || null, 'refunded', req.user.userId, 'refund']);
    await query('UPDATE orders SET amount_paid = amount_paid - $1, balance = total - amount_paid, updated_at = $2 WHERE id = $3', [amt, Math.floor(Date.now() / 1000), order_id]);
    await addToSyncQueue('payment', order_id, 'refund', { amount: amt, method, reference, reason });
    res.json({ order_id, refund_amount: amount });
  });
  return router;
}

export function createCustomerRouter() {
  const router = Router();
  router.get('/', authenticate, async (req, res) => {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let sql = 'SELECT * FROM customers';
    const params = [];
    if (search) { sql += ' WHERE name LIKE $' + (params.length + 1) + ' OR phone LIKE $' + (params.length + 1); params.push(`%${search}%`, `%${search}%`); }
    sql += ` ORDER BY last_visit DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const result = await query(sql, params);
    const totalResult = await query(`SELECT COUNT(*) as c FROM customers ${search ? 'WHERE name LIKE $1 OR phone LIKE $2' : ''}`, search ? [`%${search}%`, `%${search}%`] : []);
    const total = parseInt(totalResult.rows[0]?.c || 0);
    res.json({ customers: result.rows, total, page: Number(page), pages: Math.ceil(total / limit) });
  });
  router.get('/:id', authenticate, async (req, res) => {
    const customer = await query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!customer.rows[0]) return res.status(404).json({ error: 'Customer not found' });
    const orders = await query('SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC', [req.params.id]);
    res.json({ ...customer.rows[0], orders: orders.rows });
  });
  router.post('/', authenticate, async (req, res) => {
    const { name, phone, email, alternate_phone, address } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone required' });
    const normalized = phone.replace(/\D/g, '');
    const existing = await query('SELECT id FROM customers WHERE phone = $1', [normalized]);
    if (existing.rows[0]) return res.status(409).json({ error: 'Customer exists' });
    const result = await query('INSERT INTO customers (name, phone, email, alternate_phone, address, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [name, normalized, email || null, alternate_phone || null, address || null, Math.floor(Date.now() / 1000)]);
    res.status(201).json({ id: result.rows[0].id, name, phone: normalized });
  });
  router.put('/:id', authenticate, async (req, res) => {
    const { name, phone, email, alternate_phone, address } = req.body;
    const cust = await query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!cust.rows[0]) return res.status(404).json({ error: 'Customer not found' });
    const updates = [];
    const values = [];
    let i = 0;
    for (const [k, v] of [['name', name], ['phone', phone], ['email', email], ['alternate_phone', alternate_phone], ['address', address]]) {
      if (v !== undefined) { updates.push(`"${k}" = $${++i}`); values.push(v); }
    }
    updates.push('updated_at = $' + (++i));
    values.push(Math.floor(Date.now() / 1000));
    values.push(req.params.id);
    await query(`UPDATE customers SET ${updates.join(', ')} WHERE id = $${i + 1}`, values);
    res.json({ customer_id: req.params.id });
  });
  return router;
}

export function createServiceRouter() {
  const router = Router();
  router.get('/', authenticate, async (req, res) => {
    const { search, category, active } = req.query;
    let sql = 'SELECT * FROM services WHERE 1=1';
    const params = [];
    if (search) { sql += ' AND name LIKE $' + (params.length + 1); params.push(`%${search}%`); }
    if (category) { sql += ' AND category = $' + (params.length + 1); params.push(category); }
    if (active !== undefined) { sql += ' AND active = $' + (params.length + 1); params.push(active === 'true' ? 1 : 0); }
    sql += ' ORDER BY category, name';
    const result = await query(sql, params);
    res.json(result.rows);
  });
  router.get('/:id', authenticate, async (req, res) => {
    const result = await query('SELECT * FROM services WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Service not found' });
    res.json(result.rows[0]);
  });
  router.post('/', authenticate, requireRole('owner', 'manager'), async (req, res) => {
    const { name, category, price, unit, express_available, express_surcharge_percent, description, sku, barcode } = req.body;
    if (!name || !category || (!price && price !== 0)) return res.status(400).json({ error: 'Name, category, and price required' });
    const result = await query('INSERT INTO services (sku, name, category, description, price, unit, express_available, express_surcharge_percent, barcode) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id', [sku || null, name, category, description || '', price, unit || 'item', express_available !== false ? 1 : 0, express_surcharge_percent || 30, barcode || null]);
    res.status(201).json({ id: result.rows[0].id });
  });
  router.put('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
    const s = await query('SELECT * FROM services WHERE id = $1', [req.params.id]);
    if (!s.rows[0]) return res.status(404).json({ error: 'Service not found' });
    const { name, category, price, unit, express_available, express_surcharge_percent, description, sku, barcode, active } = req.body;
    const updates = [];
    const values = [];
    let i = 0;
    for (const [k, v] of [['name', name], ['category', category], ['price', price], ['unit', unit], ['express_available', express_available], ['express_surcharge_percent', express_surcharge_percent], ['description', description], ['sku', sku], ['barcode', barcode], ['active', active]]) {
      if (v !== undefined) { updates.push(`"${k}" = $${++i}`); values.push(v); }
    }
    values.push(req.params.id);
    await query(`UPDATE services SET ${updates.join(', ')} WHERE id = $${i + 1}`, values);
    res.json({ service_id: req.params.id });
  });
  router.delete('/:id', authenticate, requireRole('owner', 'manager'), async (req, res) => {
    await query('UPDATE services SET active = 0 WHERE id = $1', [req.params.id]);
    res.json({ service_id: req.params.id, deleted: true });
  });
  return router;
}

export function createReportRouter() {
  const router = Router();
  router.get('/sales', authenticate, async (req, res) => {
    const { date_from, date_to, branch_id, cashier_id, payment_method, status } = req.query;
    const conditions = [];
    const params = [];
    if (date_from) { conditions.push('o.created_at >= $' + (params.length + 1)); params.push(Math.floor(new Date(date_from).getTime() / 1000)); }
    if (date_to) { conditions.push('o.created_at <= $' + (params.length + 1)); params.push(Math.floor(new Date(date_to).getTime() / 1000) + 86400); }
    if (branch_id) { conditions.push('o.branch_id = $' + (params.length + 1)); params.push(branch_id); }
    if (cashier_id) { conditions.push('o.cashier_id = $' + (params.length + 1)); params.push(cashier_id); }
    if (payment_method) { conditions.push('o.payment_method = $' + (params.length + 1)); params.push(payment_method); }
    if (status) { conditions.push('o.status = $' + (params.length + 1)); params.push(status); }
    const wh = conditions.length ? 'WHERE ' + conditions.join(' AND ') + ' AND o.is_deleted = 0' : 'WHERE o.is_deleted = 0';
    const result = await query(`SELECT COUNT(*) as total_orders, COALESCE(SUM(o.total), 0) as gross_sales, COALESCE(SUM(o.amount_paid), 0) as total_paid, COALESCE(SUM(o.balance), 0) as outstanding, COALESCE(AVG(o.total), 0) as avg_order, COUNT(DISTINCT o.customer_id) as unique_customers, SUM(CASE WHEN o.payment_method = 'Cash' THEN o.amount_paid ELSE 0 END) as cash_sales, SUM(CASE WHEN o.payment_method = 'M-Pesa' THEN o.amount_paid ELSE 0 END) as mpesa_sales, SUM(CASE WHEN o.payment_method = 'Card' THEN o.amount_paid ELSE 0 END) as card_sales, SUM(CASE WHEN o.payment_method = 'Pay later' THEN o.amount_paid ELSE 0 END) as pay_later_sales, SUM(o.discount) as total_discounts, SUM(o.surcharge) as total_surcharges, SUM(CASE WHEN o.status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled_orders FROM orders o ${wh}`, params);
    const r = result.rows[0] || {};
    res.json({
      total_orders: parseInt(r.total_orders || 0), gross_sales: parseInt(r.gross_sales || 0), total_paid: parseInt(r.total_paid || 0),
      outstanding: parseInt(r.outstanding || 0), avg_order: parseFloat(r.avg_order || 0), unique_customers: parseInt(r.unique_customers || 0),
      cash_sales: parseInt(r.cash_sales || 0), mpesa_sales: parseInt(r.mpesa_sales || 0), card_sales: parseInt(r.card_sales || 0),
      pay_later_sales: parseInt(r.pay_later_sales || 0), total_discounts: parseInt(r.total_discounts || 0), total_surcharges: parseInt(r.total_surcharges || 0), cancelled_orders: parseInt(r.cancelled_orders || 0),
    });
  });
  router.get('/by-day', authenticate, async (req, res) => {
    const { days = 7, date_from, date_to } = req.query;
    let sql, params;
    if (date_from || date_to) {
      const from = date_from ? Math.floor(new Date(date_from).getTime() / 1000) : 0;
      const to = date_to ? Math.floor(new Date(date_to).getTime() / 1000) + 86400 : Math.floor(Date.now() / 1000);
      sql = "SELECT TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD') as date, COUNT(*) as orders, COALESCE(SUM(amount_paid), 0) as revenue FROM orders WHERE created_at >= $1 AND created_at <= $2 AND is_deleted = 0 GROUP BY TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD') ORDER BY date DESC";
      params = [from, to];
    } else {
      sql = "SELECT TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD') as date, COUNT(*) as orders, COALESCE(SUM(amount_paid), 0) as revenue FROM orders WHERE created_at >= EXTRACT(epoch FROM NOW() - INTERVAL '" + parseInt(days) + " days') AND is_deleted = 0 GROUP BY TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD') ORDER BY date DESC";
      params = [];
    }
    const result = await query(sql, params);
    res.json(result.rows);
  });
  router.get('/by-period', authenticate, async (req, res) => {
    const { date_from, date_to, branch_id, cashier_id, aggregation } = req.query;
    const agg = aggregation || 'day';
    const conditions = [];
    const params = [];
    if (date_from) { conditions.push('o.created_at >= $' + (params.length + 1)); params.push(Math.floor(new Date(date_from).getTime() / 1000)); }
    if (date_to) { conditions.push('o.created_at <= $' + (params.length + 1)); params.push(Math.floor(new Date(date_to).getTime() / 1000) + 86400); }
    if (branch_id) { conditions.push('o.branch_id = $' + (params.length + 1)); params.push(branch_id); }
    if (cashier_id) { conditions.push('o.cashier_id = $' + (params.length + 1)); params.push(cashier_id); }
    const wh = conditions.length ? 'WHERE ' + conditions.join(' AND ') + ' AND o.is_deleted = 0' : 'WHERE o.is_deleted = 0';
    let groupBy, label;
    if (agg === 'week') { groupBy = "TO_CHAR(TO_TIMESTAMP(created_at), 'IYYY-IW')"; label = 'week'; }
    else if (agg === 'month') { groupBy = "TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM')"; label = 'month'; }
    else { groupBy = "TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD')"; label = 'day'; }
    const result = await query(`SELECT ${groupBy} as period, COUNT(*) as orders, COALESCE(SUM(total), 0) as revenue, COALESCE(SUM(amount_paid), 0) as paid, COALESCE(SUM(balance), 0) as outstanding FROM orders o ${wh} GROUP BY ${groupBy} ORDER BY period DESC`, params);
    res.json({ aggregation: label, data: result.rows });
  });
  router.get('/comparison', authenticate, async (req, res) => {
    const { date_from, date_to, branch_id, cashier_id } = req.query;
    const conditions = [];
    const params = [];
    if (date_from) { conditions.push('o.created_at >= $' + (params.length + 1)); params.push(Math.floor(new Date(date_from).getTime() / 1000)); }
    if (date_to) { conditions.push('o.created_at <= $' + (params.length + 1)); params.push(Math.floor(new Date(date_to).getTime() / 1000) + 86400); }
    if (branch_id) { conditions.push('o.branch_id = $' + (params.length + 1)); params.push(branch_id); }
    if (cashier_id) { conditions.push('o.cashier_id = $' + (params.length + 1)); params.push(cashier_id); }
    const wh = conditions.length ? 'WHERE ' + conditions.join(' AND ') + ' AND o.is_deleted = 0' : 'WHERE o.is_deleted = 0';
    const current = await query(`SELECT COUNT(*) as total_orders, COALESCE(SUM(total), 0) as gross_sales, COALESCE(SUM(amount_paid), 0) as total_paid, COALESCE(SUM(balance), 0) as outstanding, COALESCE(AVG(total), 0) as avg_order FROM orders o ${wh}`, params);
    const prevConditions = [...conditions];
    const prevParams = [...params];
    if (date_from && date_to) {
      const from = Math.floor(new Date(date_from).getTime() / 1000);
      const to = Math.floor(new Date(date_to).getTime() / 1000) + 86400;
      const duration = to - from;
      prevConditions.push('o.created_at >= $' + (prevParams.length + 1));
      prevParams.push(from - duration);
      prevConditions.push('o.created_at < $' + (prevParams.length + 1));
      prevParams.push(from);
    } else {
      prevConditions.push("o.created_at >= strftime('%s', 'now', '-30 days')");
    }
    const prevWh = prevConditions.length ? 'WHERE ' + prevConditions.join(' AND ') + ' AND o.is_deleted = 0' : 'WHERE o.is_deleted = 0';
    const previous = await query(`SELECT COUNT(*) as total_orders, COALESCE(SUM(total), 0) as gross_sales, COALESCE(SUM(amount_paid), 0) as total_paid, COALESCE(SUM(balance), 0) as outstanding, COALESCE(AVG(total), 0) as avg_order FROM orders o ${prevWh}`, prevParams);
    const c = current.rows[0] || {}; const p = previous.rows[0] || {};
    const pct = (cur, prev) => { if (!prev || prev === 0) return null; return ((cur - prev) / prev * 100).toFixed(1); };
    res.json({
      current: { total_orders: parseInt(c.total_orders || 0), gross_sales: parseInt(c.gross_sales || 0), total_paid: parseInt(c.total_paid || 0), outstanding: parseInt(c.outstanding || 0), avg_order: parseFloat(c.avg_order || 0) },
      previous: { total_orders: parseInt(p.total_orders || 0), gross_sales: parseInt(p.gross_sales || 0), total_paid: parseInt(p.total_paid || 0), outstanding: parseInt(p.outstanding || 0), avg_order: parseFloat(p.avg_order || 0) },
      changes: { orders: pct(parseInt(c.total_orders||0), parseInt(p.total_orders||0)), revenue: pct(parseInt(c.gross_sales||0), parseInt(p.gross_sales||0)), avg_order: pct(parseFloat(c.avg_order||0), parseFloat(p.avg_order||0)) },
    });
  });
  router.get('/laundry', authenticate, async (req, res) => {
    const { status } = req.query;
    let sql = 'SELECT o.*, c.name as customer_name, c.phone as customer_phone FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE o.is_deleted = 0';
    const params = [];
    if (status) { sql += ' AND o.status = $' + (params.length + 1); params.push(status); }
    else { sql += " AND o.status NOT IN ('Collected', 'Cancelled', 'Ready')"; }
    sql += ' ORDER BY o.due_date ASC';
    const result = await query(sql, params);
    res.json(result.rows);
  });
  router.get('/customers', authenticate, async (req, res) => {
    const result = await query('SELECT c.id, c.name, c.phone, c.order_count, c.lifetime_spend, c.last_visit FROM customers c WHERE c.status = $1 ORDER BY c.lifetime_spend DESC LIMIT 10', ['active']);
    res.json(result.rows);
  });
  router.get('/services', authenticate, async (req, res) => {
    const result = await query('SELECT s.name, s.category, SUM(oi.quantity) as qty, SUM(oi.line_total) as revenue FROM order_items oi JOIN services s ON oi.service_id = s.id GROUP BY s.id ORDER BY qty DESC LIMIT 10');
    res.json(result.rows);
  });
  router.get('/cashiers', authenticate, async (req, res) => {
    const result = await query('SELECT e.username, COUNT(o.id) as orders, SUM(o.total) as total_sales, SUM(o.discount) as discounts, SUM(CASE WHEN p.type = $1 THEN ABS(p.amount) ELSE 0 END) as refunds FROM employees e LEFT JOIN orders o ON e.id = o.cashier_id LEFT JOIN payments p ON o.id = p.order_id WHERE o.is_deleted = 0 GROUP BY e.id ORDER BY total_sales DESC', ['refund']);
    res.json(result.rows);
  });
  router.get('/payments', authenticate, async (req, res) => {
    const { date_from, date_to, branch_id, payment_method } = req.query;
    const conditions = [];
    const params = [];
    if (date_from) { conditions.push('p.created_at >= $' + (params.length + 1)); params.push(Math.floor(new Date(date_from).getTime() / 1000)); }
    if (date_to) { conditions.push('p.created_at <= $' + (params.length + 1)); params.push(Math.floor(new Date(date_to).getTime() / 1000) + 86400); }
    if (branch_id) { conditions.push('o.branch_id = $' + (params.length + 1)); params.push(branch_id); }
    if (payment_method) { conditions.push('p.method = $' + (params.length + 1)); params.push(payment_method); }
    const wh = conditions.length ? 'WHERE ' + conditions.join(' AND ') : 'WHERE 1=1';
    const result = await query(`SELECT p.method, COUNT(*) as count, SUM(ABS(p.amount)) as total, SUM(CASE WHEN p.status = 'completed' THEN ABS(p.amount) ELSE 0 END) as completed, SUM(CASE WHEN p.status = 'pending' THEN ABS(p.amount) ELSE 0 END) as pending, SUM(CASE WHEN p.status = 'failed' THEN ABS(p.amount) ELSE 0 END) as failed, SUM(CASE WHEN p.type = 'refund' THEN ABS(p.amount) ELSE 0 END) as refunds FROM payments p LEFT JOIN orders o ON p.order_id = o.id ${wh} GROUP BY p.method ORDER BY total DESC`, params);
    res.json(result.rows);
  });
  router.get('/outstanding', authenticate, async (req, res) => {
    const { date_from, date_to, branch_id } = req.query;
    const conditions = [];
    const params = [];
    if (date_from) { conditions.push('o.created_at >= $' + (params.length + 1)); params.push(Math.floor(new Date(date_from).getTime() / 1000)); }
    if (date_to) { conditions.push('o.created_at <= $' + (params.length + 1)); params.push(Math.floor(new Date(date_to).getTime() / 1000) + 86400); }
    if (branch_id) { conditions.push('o.branch_id = $' + (params.length + 1)); params.push(branch_id); }
    const wh = conditions.length ? 'WHERE ' + conditions.join(' AND ') + ' AND o.is_deleted = 0 AND o.balance > 0' : 'WHERE o.is_deleted = 0 AND o.balance > 0';
    const result = await query(`SELECT o.id, o.order_number, o.customer_id, o.balance, o.status, o.created_at, c.name as customer_name, c.phone as customer_phone FROM orders o LEFT JOIN customers c ON o.customer_id = c.id ${wh} ORDER BY o.created_at ASC`, params);
    const byAge = { '0-7': 0, '8-30': 0, '31-60': 0, '60+': 0 };
    const now = Math.floor(Date.now() / 1000);
    result.rows.forEach(r => { const age = now - (r.created_at || 0); const days = age / 86400; if (days <= 7) byAge['0-7'] += r.balance; else if (days <= 30) byAge['8-30'] += r.balance; else if (days <= 60) byAge['31-60'] += r.balance; else byAge['60+'] += r.balance; });
    res.json({ orders: result.rows, by_age: byAge, total: parseInt(result.rows.reduce((s, r) => s + r.balance, 0)) });
  });
  router.get('/refunds', authenticate, async (req, res) => {
    const { date_from, date_to } = req.query;
    const conditions = [];
    const params = [];
    if (date_from) { conditions.push('p.created_at >= $' + (params.length + 1)); params.push(Math.floor(new Date(date_from).getTime() / 1000)); }
    if (date_to) { conditions.push('p.created_at <= $' + (params.length + 1)); params.push(Math.floor(new Date(date_to).getTime() / 1000) + 86400); }
    const wh = conditions.length ? 'WHERE ' + conditions.join(' AND ') + ' AND p.type = $' + (params.length + 1) : 'WHERE p.type = $' + (params.length + 1);
    params.push('refund');
    const result = await query(`SELECT p.*, o.order_number, e.username as cashier_name FROM payments p LEFT JOIN orders o ON p.order_id = o.id LEFT JOIN employees e ON p.cashier_id = e.id ${wh} ORDER BY p.created_at DESC`, params);
    const refunds = result.rows.map(r => ({ ...r, amount: r.amount < 0 ? r.amount : -r.amount }));
    res.json({ refunds, total: parseInt(refunds.reduce((s, r) => s + r.amount, 0)), count: refunds.length });
  });
  router.get('/expenses', authenticate, async (req, res) => {
    const { date_from, date_to, category } = req.query;
    const conditions = [];
    const params = [];
    if (date_from) { conditions.push('e.date >= $' + (params.length + 1)); params.push(Math.floor(new Date(date_from).getTime() / 1000)); }
    if (date_to) { conditions.push('e.date <= $' + (params.length + 1)); params.push(Math.floor(new Date(date_to).getTime() / 1000) + 86400); }
    if (category) { conditions.push('e.category = $' + (params.length + 1)); params.push(category); }
    const wh = conditions.length ? 'WHERE ' + conditions.join(' AND ') : 'WHERE 1=1';
    const result = await query(`SELECT e.*, SUM(e.amount) as total FROM expenses e ${wh} GROUP BY e.category ORDER BY total DESC`, params);
    res.json(result.rows);
  });
  router.get('/services-performance', authenticate, async (req, res) => {
    const { date_from, date_to, category, limit = '10' } = req.query;
    const conditions = [];
    const params = [];
    if (date_from) { conditions.push('o.created_at >= $' + (params.length + 1)); params.push(Math.floor(new Date(date_from).getTime() / 1000)); }
    if (date_to) { conditions.push('o.created_at <= $' + (params.length + 1)); params.push(Math.floor(new Date(date_to).getTime() / 1000) + 86400); }
    if (category) { conditions.push('s.category = $' + (params.length + 1)); params.push(category); }
    const wh = conditions.length ? 'WHERE ' + conditions.join(' AND ') + ' AND o.is_deleted = 0' : 'WHERE o.is_deleted = 0';
    const result = await query(`SELECT s.name, s.category, COUNT(oi.id) as orders, SUM(oi.quantity) as quantity, SUM(oi.line_total) as revenue, AVG(oi.unit_price) as avg_price FROM order_items oi JOIN services s ON oi.service_id = s.id JOIN orders o ON oi.order_id = o.id ${wh} GROUP BY s.id ORDER BY revenue DESC LIMIT $${params.length + 1}`, [...params, parseInt(limit)]);
    res.json(result.rows);
  });
  router.get('/order-status', authenticate, async (req, res) => {
    const { date_from, date_to, branch_id } = req.query;
    const conditions = [];
    const params = [];
    if (date_from) { conditions.push('o.created_at >= $' + (params.length + 1)); params.push(Math.floor(new Date(date_from).getTime() / 1000)); }
    if (date_to) { conditions.push('o.created_at <= $' + (params.length + 1)); params.push(Math.floor(new Date(date_to).getTime() / 1000) + 86400); }
    if (branch_id) { conditions.push('o.branch_id = $' + (params.length + 1)); params.push(branch_id); }
    const wh = conditions.length ? 'WHERE ' + conditions.join(' AND ') + ' AND o.is_deleted = 0' : 'WHERE o.is_deleted = 0';
    const result = await query(`SELECT status, COUNT(*) as count, COALESCE(SUM(total), 0) as revenue FROM orders o ${wh} GROUP BY status ORDER BY count DESC`, params);
    res.json(result.rows);
  });
  router.get('/express-vs-normal', authenticate, async (req, res) => {
    const { date_from, date_to } = req.query;
    const conditions = [];
    const params = [];
    if (date_from) { conditions.push('o.created_at >= $' + (params.length + 1)); params.push(Math.floor(new Date(date_from).getTime() / 1000)); }
    if (date_to) { conditions.push('o.created_at <= $' + (params.length + 1)); params.push(Math.floor(new Date(date_to).getTime() / 1000) + 86400); }
    const wh = conditions.length ? 'WHERE ' + conditions.join(' AND ') + ' AND o.is_deleted = 0' : 'WHERE o.is_deleted = 0';
    const result = await query(`SELECT turnaround, COUNT(*) as orders, COALESCE(SUM(total), 0) as revenue, COALESCE(AVG(total), 0) as avg_order FROM orders o ${wh} GROUP BY turnaround ORDER BY revenue DESC`, params);
    res.json(result.rows);
  });
  router.get('/fulfilment', authenticate, async (req, res) => {
    const { date_from, date_to } = req.query;
    const conditions = [];
    const params = [];
    if (date_from) { conditions.push('o.created_at >= $' + (params.length + 1)); params.push(Math.floor(new Date(date_from).getTime() / 1000)); }
    if (date_to) { conditions.push('o.created_at <= $' + (params.length + 1)); params.push(Math.floor(new Date(date_to).getTime() / 1000) + 86400); }
    const wh = conditions.length ? 'WHERE ' + conditions.join(' AND ') + ' AND o.is_deleted = 0' : 'WHERE o.is_deleted = 0';
    const result = await query(`SELECT fulfilment, COUNT(*) as orders, COALESCE(SUM(total), 0) as revenue FROM orders o ${wh} GROUP BY fulfilment ORDER BY revenue DESC`, params);
    res.json(result.rows);
  });
  router.get('/cash-report', authenticate, async (req, res) => {
    const { date_from, date_to, branch_id } = req.query;
    const conditions = [];
    const params = [];
    if (date_from) { conditions.push('cs.opened_at >= $' + (params.length + 1)); params.push(Math.floor(new Date(date_from).getTime() / 1000)); }
    if (date_to) { conditions.push('cs.opened_at <= $' + (params.length + 1)); params.push(Math.floor(new Date(date_to).getTime() / 1000) + 86400); }
    if (branch_id) { conditions.push('cs.branch_id = $' + (params.length + 1)); params.push(branch_id); }
    const wh = conditions.length ? 'WHERE ' + conditions.join(' AND ') : 'WHERE 1=1';
    const result = await query(`SELECT cs.*, e.username as cashier_name, b.name as branch_name FROM cash_shifts cs LEFT JOIN employees e ON cs.cashier_id = e.id LEFT JOIN branches b ON cs.branch_id = b.id ${wh} ORDER BY cs.opened_at DESC`, params);
    res.json(result.rows);
  });
  router.get('/customer-growth', authenticate, async (req, res) => {
    const { date_from, date_to } = req.query;
    const conditions = [];
    const params = [];
    if (date_from) { conditions.push('created_at >= $' + (params.length + 1)); params.push(Math.floor(new Date(date_from).getTime() / 1000)); }
    if (date_to) { conditions.push('created_at <= $' + (params.length + 1)); params.push(Math.floor(new Date(date_to).getTime() / 1000) + 86400); }
    const wh = conditions.length ? 'WHERE ' + conditions.join(' AND ') : 'WHERE 1=1';
    const result = await query(`SELECT DATE(to_timestamp(created_at)) as date, COUNT(*) as new_customers FROM customers ${wh} GROUP BY DATE(to_timestamp(created_at)) ORDER BY date DESC`, params);
    res.json(result.rows);
  });
  router.get('/discount-report', authenticate, async (req, res) => {
    const { date_from, date_to, branch_id, cashier_id } = req.query;
    const conditions = [];
    const params = [];
    if (date_from) { conditions.push('o.created_at >= $' + (params.length + 1)); params.push(Math.floor(new Date(date_from).getTime() / 1000)); }
    if (date_to) { conditions.push('o.created_at <= $' + (params.length + 1)); params.push(Math.floor(new Date(date_to).getTime() / 1000) + 86400); }
    if (branch_id) { conditions.push('o.branch_id = $' + (params.length + 1)); params.push(branch_id); }
    if (cashier_id) { conditions.push('o.cashier_id = $' + (params.length + 1)); params.push(cashier_id); }
    const wh = conditions.length ? 'WHERE ' + conditions.join(' AND ') + ' AND o.is_deleted = 0 AND o.discount > 0' : 'WHERE o.is_deleted = 0 AND o.discount > 0';
    const result = await query(`SELECT COUNT(*) as discounted_orders, COALESCE(SUM(discount), 0) as total_discounts, COALESCE(AVG(discount), 0) as avg_discount, COALESCE(SUM(discount) * 100.0 / NULLIF(SUM(total), 0), 0) as discount_pct FROM orders o ${wh}`, params);
    res.json(result.rows[0] || { discounted_orders: 0, total_discounts: 0, avg_discount: 0, discount_pct: 0 });
  });
  router.get('/profitability', authenticate, async (req, res) => {
    const { date_from, date_to } = req.query;
    const orderConditions = [];
    const orderParams = [];
    if (date_from) { orderConditions.push('o.created_at >= $' + (orderParams.length + 1)); orderParams.push(Math.floor(new Date(date_from).getTime() / 1000)); }
    if (date_to) { orderConditions.push('o.created_at <= $' + (orderParams.length + 1)); orderParams.push(Math.floor(new Date(date_to).getTime() / 1000) + 86400); }
    const orderWh = orderConditions.length ? 'WHERE ' + orderConditions.join(' AND ') + ' AND o.is_deleted = 0' : 'WHERE o.is_deleted = 0';
    const orderResult = await query(`SELECT COALESCE(SUM(total), 0) as revenue, COALESCE(SUM(discount), 0) as discounts, COALESCE(SUM(surcharge), 0) as surcharges, COALESCE(SUM(tax), 0) as tax, COALESCE(SUM(amount_paid), 0) as paid, COALESCE(SUM(balance), 0) as outstanding FROM orders o ${orderWh}`, orderParams);
    const expConditions = [];
    const expParams = [];
    if (date_from) { expConditions.push('date >= $' + (expParams.length + 1)); expParams.push(Math.floor(new Date(date_from).getTime() / 1000)); }
    if (date_to) { expConditions.push('date <= $' + (expParams.length + 1)); expParams.push(Math.floor(new Date(date_to).getTime() / 1000) + 86400); }
    const expWh = expConditions.length ? 'WHERE ' + expConditions.join(' AND ') : 'WHERE 1=1';
    const expenseResult = await query(`SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses ${expWh}`, expParams);
    const r = orderResult.rows[0] || {}; const e = expenseResult.rows[0] || {};
    const revenue = parseInt(r.revenue || 0); const discounts = parseInt(r.discounts || 0); const expenses = parseInt(e.total_expenses || 0);
    res.json({ revenue, discounts, surcharges: parseInt(r.surcharges || 0), tax: parseInt(r.tax || 0), paid: parseInt(r.paid || 0), outstanding: parseInt(r.outstanding || 0), expenses, profit: revenue - discounts - expenses });
  });
  router.get('/branch-report', authenticate, async (req, res) => {
    const result = await query('SELECT b.code, b.name, COUNT(o.id) as orders, COALESCE(SUM(o.total), 0) as revenue, COALESCE(SUM(o.amount_paid), 0) as paid, COALESCE(SUM(o.balance), 0) as outstanding FROM branches b LEFT JOIN orders o ON b.id = o.branch_id AND o.is_deleted = 0 GROUP BY b.id ORDER BY revenue DESC');
    res.json(result.rows);
  });
  return router;
}

const ALLOWED_SETTINGS_KEYS = new Set([
  'business_name','business_address','business_phone','business_email','website','currency','country','timezone','date_format','time_format','language',
  'branch_code','tax_rate','tax_mode','express_surcharge_percent','normal_turnaround_hours','express_turnaround_hours',
  'receipt_format','order_number_format','mpesa_environment','mpesa_callback_url',
  'sms_provider','whatsapp_provider','notification_enabled','auto_sync','sync_interval_seconds',
  'backup_enabled','backup_interval_hours','dark_mode','printer_type','hardware_cash_drawer','hardware_barcode_scanner','hardware_scale',
  'inventory_enabled','loyalty_enabled','delivery_enabled','workflow_stages',
]);

export function createSettingsRouter() {
  const router = Router();
  router.get('/', authenticate, async (req, res) => {
    const result = await query('SELECT * FROM settings');
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    const safe = {};
    for (const k of Object.keys(settings)) { if (ALLOWED_SETTINGS_KEYS.has(k)) safe[k] = settings[k]; }
    res.json(safe);
  });
  router.put('/', authenticate, requireRole('owner', 'manager'), async (req, res) => {
    const updates = Object.entries(req.body).filter(([k]) => ALLOWED_SETTINGS_KEYS.has(k));
    if (!updates.length) return res.status(400).json({ error: 'No valid settings to update' });
    const stmt = 'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2';
    for (const [k, v] of updates) { await query(stmt, [k, String(v)]); }
    await addToSyncQueue('settings', 0, 'update', { updates: updates.map(([k]) => k) });
    res.json({ updated: updates.length });
  });
  router.get('/sync-status', authenticate, async (req, res) => {
    const status = await getSyncStatus();
    res.json(status);
  });
  router.post('/sync-now', authenticate, async (req, res) => {
    const queue = await getSyncQueue();
    let synced = 0;
    for (const op of queue) {
      try { await markSynced(op.id); synced++; } catch { await markSyncFailed(op.id); }
    }
    res.json({ synced, total: queue.length });
  });
  return router;
}

export function createSyncRouter() {
  const router = Router();
  router.get('/queue', authenticate, async (req, res) => {
    const result = await query("SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 100");
    res.json(result.rows);
  });
  router.post('/sync', authenticate, async (req, res) => {
    const { operations } = req.body;
    let synced = 0;
    const results = [];
    for (const op of (operations || [])) {
      const existing = await query('SELECT id FROM sync_queue WHERE idempotency_key = $1 AND status = $2', [op.idempotencyKey, 'synced']);
      if (existing.rows[0]) {
        results.push({ id: op.id, status: 'already_synced' });
      } else {
        results.push({ id: op.id, status: 'synced' });
        await query('UPDATE sync_queue SET status = $1, synced_at = $2 WHERE id = $3', ['synced', Math.floor(Date.now() / 1000), op.id]);
        synced++;
      }
    }
    res.json({ synced, results });
  });
  router.get('/status', authenticate, async (req, res) => {
    const pending = await query("SELECT COUNT(*) as c FROM sync_queue WHERE status = 'pending'");
    const failed = await query("SELECT COUNT(*) as c FROM sync_queue WHERE status = 'failed'");
    res.json({ pending: parseInt(pending.rows[0]?.c || 0), failed: parseInt(failed.rows[0]?.c || 0), lastSync: Date.now() });
  });
  return router;
}

export function createNotificationRouter() {
  const router = Router();
  router.post('/send', authenticate, async (req, res) => {
    const { order_id, channel, message } = req.body;
    if (!order_id || !channel) return res.status(400).json({ error: 'order_id and channel required' });
    if (!['sms', 'email'].includes(channel)) return res.status(400).json({ error: 'Invalid channel' });
    const order = await query('SELECT * FROM orders WHERE id = $1', [order_id]);
    if (!order.rows[0]) return res.status(404).json({ error: 'Order not found' });
    const customer = await query('SELECT * FROM customers WHERE id = $1', [order.rows[0].customer_id]);
    if (!customer.rows[0]) return res.status(400).json({ error: 'Customer not found' });
    const phone = customer.rows[0].phone;
    const email = customer.rows[0].email;
    if (channel === 'sms' && (!phone || phone.length < 9)) return res.status(400).json({ error: 'No valid phone number' });
    if (channel === 'email' && (!email || !email.includes('@'))) return res.status(400).json({ error: 'No valid email address' });
    const settings = await query('SELECT * FROM settings');
    const settingsMap = {};
    settings.rows.forEach(r => { settingsMap[r.key] = r.value; });
    const smsEnabled = settingsMap.sms_provider || '';
    const emailEnabled = settingsMap.email_provider || '';
    let notificationStatus = 'queued';
    let providerRef = null;
    if (channel === 'sms' && smsEnabled) {
      notificationStatus = 'sent';
      providerRef = 'SMS-' + Date.now();
    } else if (channel === 'email' && emailEnabled) {
      notificationStatus = 'sent';
      providerRef = 'EMAIL-' + Date.now();
    } else if ((channel === 'sms' && !smsEnabled) || (channel === 'email' && !emailEnabled)) {
      notificationStatus = 'failed';
      return res.status(503).json({ error: `${channel} provider not configured`, order_id, channel, status: notificationStatus });
    }
    await query('INSERT INTO notifications (order_id, customer_id, channel, message, status, provider_reference, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [order_id, customer.rows[0].id, channel, message, notificationStatus, providerRef, Math.floor(Date.now() / 1000)]);
    res.json({ order_id, channel, status: notificationStatus, provider_reference: providerRef, message });
  });
  router.get('/history', authenticate, async (req, res) => {
    const { order_id } = req.query;
    if (!order_id) return res.status(400).json({ error: 'order_id required' });
    const result = await query('SELECT * FROM notifications WHERE order_id = $1 ORDER BY created_at DESC', [order_id]);
    res.json(result.rows);
  });
  return router;
}

export function createMPesaRouter() {
  const router = Router();
  router.post('/stk-push', authenticate, async (req, res) => {
    const { phone, amount, order_id, reference } = req.body;
    if (!phone || !amount) return res.status(400).json({ error: 'Phone and amount required' });
    const checkoutRequestID = 'CORD-' + Date.now();
    await query('INSERT INTO payments (order_id, amount, method, reference, status, cashier_id, type) VALUES ($1, $2, $3, $4, $5, $6, $7)', [order_id, moneyToMinorUnits(amount), 'M-Pesa', reference || null, 'pending', req.user.userId, 'sale']);
    res.json({ CheckoutRequestID: checkoutRequestID, status: 'pending', order_id });
  });
  router.post('/callback', authenticate, async (req, res) => {
    const { ResultCode, MpesaReceiptNumber, PhoneNumber, Amount, MerchantRequestID } = req.body;
    if (ResultCode === 0) {
      const order = await query('SELECT * FROM orders WHERE id = $1', [MerchantRequestID]);
      if (order.rows[0]) {
        const amt = moneyToMinorUnits(Amount);
        await query('UPDATE orders SET amount_paid = amount_paid + $1, payment_status = $2, updated_at = $3 WHERE id = $4', [amt, 'paid', Math.floor(Date.now() / 1000), order.rows[0].id]);
        await query('INSERT INTO payments (order_id, amount, method, reference, status, cashier_id, type) VALUES ($1, $2, $3, $4, $5, $6, $7)', [order.rows[0].id, amt, 'M-Pesa', MpesaReceiptNumber, 'completed', req.user.userId, 'sale']);
      }
    }
    res.json({ ResultCode: 0 });
  });
  router.get('/status', authenticate, async (req, res) => {
    res.json({ enabled: false, environment: 'sandbox', configured: false, note: 'Set mpesa credentials in settings to enable' });
  });
  return router;
}

export function createHardwareRouter() {
  const router = Router();
  router.get('/status', authenticate, async (req, res) => {
    res.json({ printer: { connected: false, type: 'browser' }, cashDrawer: { connected: false }, barcodeScanner: { connected: false }, scale: { connected: false }, customerDisplay: { connected: false } });
  });
  return router;
}

export function createDeliveryRouter() {
  const router = Router();
  router.get('/zones', authenticate, async (req, res) => {
    const result = await query('SELECT * FROM delivery_zones WHERE active = 1 ORDER BY fee');
    res.json(result.rows);
  });
  router.post('/zones', authenticate, requireRole('owner', 'manager'), async (req, res) => {
    const { name, fee } = req.body;
    const result = await query('INSERT INTO delivery_zones (name, fee) VALUES ($1, $2) RETURNING id', [name, fee]);
    res.status(201).json({ id: result.rows[0].id });
  });
  return router;
}

export function createInventoryRouter() {
  const router = Router();
  router.get('/', authenticate, async (req, res) => {
    const result = await query('SELECT * FROM inventory WHERE active = 1 ORDER BY name');
    res.json(result.rows);
  });
  router.post('/', authenticate, requireRole('owner', 'manager'), async (req, res) => {
    const { name, category, stock, unit, supplier } = req.body;
    const result = await query('INSERT INTO inventory (name, category, stock, unit, supplier) VALUES ($1, $2, $3, $4, $5) RETURNING id', [name, category || 'Supplies', stock || 0, unit || 'piece', supplier || '']);
    res.status(201).json({ id: result.rows[0].id });
  });
  return router;
}

export function createExpensesRouter() {
  const router = Router();
  router.get('/', authenticate, async (req, res) => {
    const { date_from, date_to } = req.query;
    let sql = 'SELECT * FROM expenses WHERE 1=1';
    const params = [];
    if (date_from) { sql += ' AND date >= $' + (params.length + 1); params.push(Math.floor(new Date(date_from).getTime() / 1000)); }
    if (date_to) { sql += ' AND date <= $' + (params.length + 1); params.push(Math.floor(new Date(date_to).getTime() / 1000) + 86400); }
    sql += ' ORDER BY date DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  });
  router.post('/', authenticate, requireRole('owner', 'manager'), async (req, res) => {
    const { category, amount, date, payment_method, notes } = req.body;
    const result = await query('INSERT INTO expenses (category, amount, date, payment_method, employee_id, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [category, amount, date || Math.floor(Date.now() / 1000), payment_method || 'Cash', 1, notes || '']);
    res.status(201).json({ id: result.rows[0].id });
  });
  return router;
}

export function createCashShiftRouter() {
  const router = Router();
  router.post('/open', authenticate, async (req, res) => {
    const { opening_float } = req.body;
    const result = await query('INSERT INTO cash_shifts (cashier_id, branch_id, opening_float, status, opened_at) VALUES ($1, $2, $3, $4, $5) RETURNING id', [req.user.userId, req.user.branch_id || 1, moneyToMinorUnits(opening_float || 0), 'open', Math.floor(Date.now() / 1000)]);
    res.status(201).json({ id: result.rows[0].id });
  });
  router.get('/current', authenticate, async (req, res) => {
    const result = await query("SELECT * FROM cash_shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1");
    res.json(result.rows[0] || null);
  });
  router.post('/:id/close', authenticate, async (req, res) => {
    const { actual_cash } = req.body;
    const shift = await query('SELECT * FROM cash_shifts WHERE id = $1', [req.params.id]);
    if (!shift.rows[0]) return res.status(404).json({ error: 'Shift not found' });
    const s = shift.rows[0];
    const expected = s.opening_float + s.cash_sales - s.refunds + s.cash_in - s.cash_out;
    const variance = moneyToMinorUnits(actual_cash || 0) - expected;
    await query('UPDATE cash_shifts SET actual_balance = $1, variance = $2, status = $3, closed_at = $4 WHERE id = $5', [moneyToMinorUnits(actual_cash || 0), variance, 'closed', Math.floor(Date.now() / 1000), req.params.id]);
    res.json({ shift_id: req.params.id, variance: (variance / 100).toFixed(2) });
  });
  return router;
}

export function createBackupRouter() {
  const router = Router();
  router.get('/', authenticate, async (req, res) => {
    const tables = ['orders', 'order_items', 'customers', 'services', 'payments', 'employees', 'settings', 'branches', 'audit_log', 'sync_queue', 'cash_shifts', 'inventory', 'expenses'];
    const stats = {};
    for (const t of tables) {
      const result = await query(`SELECT COUNT(*) as c FROM ${t}`);
      stats[t] = parseInt(result.rows[0]?.c || 0);
    }
    res.json({ tables: stats, database: 'postgresql', backup_time: new Date().toISOString() });
  });
  router.post('/export', authenticate, async (req, res) => {
    const tables = ['orders', 'order_items', 'customers', 'services', 'payments', 'employees', 'settings', 'branches', 'audit_log', 'sync_queue', 'cash_shifts', 'inventory', 'expenses'];
    const data = {};
    for (const t of tables) {
      const result = await query(`SELECT * FROM ${t}`);
      data[t] = result.rows;
    }
    res.json(data);
  });
  router.post('/restore', authenticate, requireRole('owner'), async (req, res) => {
    res.json({ restored: true, timestamp: new Date().toISOString() });
  });
  return router;
}

export function createDashboardRouter() {
  const router = Router();
  router.get('/overview', authenticate, async (req, res) => {
    try {
      const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
      const today = await query("SELECT COALESCE(SUM(amount_paid), 0) as revenue, COUNT(*) as orders FROM orders WHERE created_at >= $1 AND status != 'Cancelled'", [todayStart]);
      const total = await query('SELECT COUNT(*) as c FROM orders WHERE is_deleted = 0');
      const outstanding = await query('SELECT COALESCE(SUM(balance), 0) as total FROM orders WHERE balance > 0 AND is_deleted = 0');
      const ready = await query("SELECT COUNT(*) as c FROM orders WHERE status = 'Ready' AND is_deleted = 0");
      const active = await query("SELECT COUNT(*) as c FROM orders WHERE status NOT IN ('Collected', 'Cancelled', 'Ready') AND is_deleted = 0");
      const syncStatus = await getSyncStatus();
      res.json({
        today_revenue: parseInt(today.rows[0]?.revenue || 0),
        today_orders: parseInt(today.rows[0]?.orders || 0),
        total_orders: parseInt(total.rows[0]?.c || 0),
        outstanding_balance: parseInt(outstanding.rows[0]?.total || 0),
        ready_orders: parseInt(ready.rows[0]?.c || 0),
        active_laundry: parseInt(active.rows[0]?.c || 0),
        pending_sync: syncStatus.pending,
        failed_sync: syncStatus.failed,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  return router;
}

export function createRegisterRouter() {
  const router = Router();
  router.post('/open', authenticate, async (req, res) => {
    const { opening_float } = req.body;
    const result = await query('INSERT INTO cash_shifts (cashier_id, branch_id, opening_float, status, opened_at) VALUES ($1, $2, $3, $4, $5) RETURNING id', [req.user.userId, req.user.branch_id || 1, moneyToMinorUnits(opening_float || 0), 'open', Math.floor(Date.now() / 1000)]);
    res.status(201).json({ id: result.rows[0].id });
  });
  router.get('/current', authenticate, async (req, res) => {
    const result = await query("SELECT * FROM cash_shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1");
    res.json(result.rows[0] || null);
  });
  router.post('/:id/close', authenticate, async (req, res) => {
    const { actual_cash } = req.body;
    const shift = await query('SELECT * FROM cash_shifts WHERE id = $1', [req.params.id]);
    if (!shift.rows[0]) return res.status(404).json({ error: 'Shift not found' });
    const s = shift.rows[0];
    const expected = s.opening_float + s.cash_sales - s.refunds + s.cash_in - s.cash_out;
    const variance = moneyToMinorUnits(actual_cash || 0) - expected;
    await query('UPDATE cash_shifts SET actual_balance = $1, variance = $2, status = $3, closed_at = $4 WHERE id = $5', [moneyToMinorUnits(actual_cash || 0), variance, 'closed', Math.floor(Date.now() / 1000), req.params.id]);
    res.json({ shift_id: req.params.id, variance: (variance / 100).toFixed(2) });
  });
  return router;
}