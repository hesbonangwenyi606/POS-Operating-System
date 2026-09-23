import { api } from '../api/client.js';
import { db, formatMoneyKES, moneyToMinorUnits, generateOrderNumber, getSetting, setSetting, addToSyncQueue, getSyncQueue, markSynced, markSyncFailed } from '../db/database.js';
import { toast, showModal, closeModal } from '../utils/helpers.js';
import { createAuth } from '../auth/auth.js';

const TAX_RATE_DEFAULT = 0;
const EXPRESS_SURCHARGE_DEFAULT = 30;
const NORMAL_TURNAROUND_DEFAULT = 24;
const EXPRESS_TURNAROUND_DEFAULT = 4;

function stat(label, value, color = 'blue') {
  return `<div class="mini-stat"><span>${label}</span><b>${value}</b></div>`;
}

function metric(label, value, desc) {
  return `<div class="metric"><span>${label}</span><b>${value}</b><small>${desc}</small></div>`;
}

function renderApp(s) {
  const app = document.querySelector('#app');
  if (!app) return;
  app.innerHTML = `<aside class="sidebar"><div class="brand"><div class="brand-mark">🧺</div><div><b>Open Doors</b><small>LAUNDROMAT</small></div></div><nav>${navBtn('pos', 'POS')}${navBtn('dashboard', 'Dashboard')}${navBtn('orders', 'Orders')}${navBtn('customers', 'Customers')}${navBtn('services', 'Services')}${navBtn('reports', 'Reports')}${navBtn('laundry', 'Laundry')}${navBtn('settings', 'Settings')}</nav><div class="side-foot"><div class="profile"><span>${s.user?.username || 'Cashier'}</span><small>${s.user?.role || 'cashier'}</small></div><button class="logout-btn" id="logout" aria-label="Logout">⏻</button></div></aside><main><div id="connection-status" class="connection-status ${s.online ? 'online' : 'offline'}">${s.online ? '🟢 Online' : '🔴 Offline'}</div><div id="view"></div></main><div id="modal"></div><div id="toast"></div>`;
  document.querySelector('#logout')?.addEventListener('click', async () => { await api.logout?.(); localStorage.removeItem('od_auth_token'); s.user = null; renderLogin(); });
  document.querySelectorAll('.nav-btn').forEach(btn => { btn.addEventListener('click', () => { s.view = btn.dataset.view; renderApp(s); renderView(s); }); });
}

function navBtn(view, label) {
  return `<button class="nav-btn ${state.view === view ? 'active' : ''}" data-view="${view}" aria-label="${label}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span>${label}</span></button>`;
}

async function renderView(s) {
  const view = document.querySelector('#view');
  if (!view) return;
  switch (s.view) {
    case 'pos': await renderPOS(s); break;
    case 'dashboard': await renderDashboard(s); break;
    case 'orders': await renderOrders(s); break;
    case 'customers': await renderCustomers(s); break;
    case 'services': await renderServices(s); break;
    case 'reports': await renderReports(s); break;
    case 'laundry': await renderLaundry(s); break;
    case 'settings': await renderSettings(s); break;
    default: await renderPOS(s);
  }
}

async function renderDashboard(s) {
  let overview;
  try { overview = await api.getDashboardOverview(); } catch { overview = null; }
  const view = document.querySelector('#view');
  if (!view) return;
  view.innerHTML = `<header class="topbar"><div><h1>Dashboard</h1><p>Operational overview</p></div></header><section class="page"><div class="dashboard-grid">${metric('Today Revenue', overview ? formatMoneyKES(overview.today_revenue) : '—', 'Today')}${metric('Today Orders', overview?.today_orders || 0, 'Orders')}${metric('Total Orders', overview?.total_orders || 0, 'All time')}${metric('Outstanding', overview ? formatMoneyKES(overview.outstanding_balance) : '—', 'Balance')}${metric('Ready', overview?.ready_orders || 0, 'Ready for collection')}${metric('Active Laundry', overview?.active_laundry || 0, 'In progress')}</div><div class="panel"><h3>Sync Status</h3><div style="display:flex;gap:8px;margin-top:8px;"><span class="sync-badge ${(overview?.pending_sync || 0) > 0 ? 'pending' : 'synced'}">Pending: ${overview?.pending_sync || 0}</span><span class="sync-badge ${(overview?.failed_sync || 0) > 0 ? 'failed' : 'synced'}">Failed: ${overview?.failed_sync || 0}</span></div></div><div class="panel" style="margin-top:16px;"><h3>Quick Actions</h3><div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;"><button class="btn primary" id="dash-new-order">+ New Order</button><button class="btn secondary" id="dash-new-customer">+ New Customer</button></div></div></section>`;
  document.querySelector('#dash-new-order')?.addEventListener('click', () => { s.view = 'pos'; s.cart = []; renderApp(s); renderView(s); });
  document.querySelector('#dash-new-customer')?.addEventListener('click', () => { s.view = 'customers'; renderApp(s); renderView(s); showCustomerForm(s, null); });
}

async function loadOrders(s) {
  try { const res = await api.getOrders({ page: s.page || 1, limit: 50, status: s.filterStatus || '', search: s.searchQuery || '' }); s.orders = res.orders || res; s.totalOrders = res.total || s.orders.length; s.orderPages = res.pages || 1; } catch { s.orders = await db.orders.toArray(); s.totalOrders = s.orders.length; s.orderPages = 1; }
}

async function loadServices(s) {
  try { s.services = await api.getServices(); } catch { s.services = await db.services.toArray(); }
}

async function loadCustomers(s) {
  const page = s.customerPage || 1;
  const limit = 50;
  const search = s.customerSearch || '';
  try {
    const res = await api.getCustomers({ page, limit, search });
    const serverCustomers = res.customers || res || [];
    s.customers = serverCustomers;
    s.totalCustomers = res.total || serverCustomers.length;
    try { await db.customers.bulkPut(serverCustomers.map(c => ({ ...c, id: c.id, phone: c.phone, name: c.name, email: c.email || '', alternatePhone: c.alternate_phone || '', address: c.address || '', loyaltyTier: c.loyalty_tier || 'bronze', status: c.status || 'active', createdAt: (c.created_at || c.createdAt) * 1000, updatedAt: (c.updated_at || c.updatedAt) * 1000 }))); } catch {}
  } catch {
    const localCustomers = await db.customers.toArray();
    s.customers = localCustomers;
    s.totalCustomers = localCustomers.length;
  }
}

async function loadReports(s) {
  try { s.reportData = await api.getReports({ date_from: s.dateFrom || '', date_to: s.dateTo || '' }); } catch { s.reportData = null; }
}

async function renderPOS(s) {
  await loadServices(s);
  const view = document.querySelector('#view');
  if (!view) return;
  const cart = s.cart || [];
  const subtotal = cart.reduce((sum, item) => sum + moneyToMinorUnits(item.unit_price) * (item.quantity || 1), 0);
  const discountAmount = moneyToMinorUnits(s.discountValue || 0);
  const discountType = s.discountType || 'none';
  const discountMinor = discountType === 'percentage' ? Math.round(subtotal * (discountAmount / 100)) : discountAmount;
  const taxRate = parseFloat(s.settings?.tax_rate || TAX_RATE_DEFAULT);
  const taxAmount = Math.round((subtotal - discountMinor) * (taxRate / 100));
  const surcharge = s.turnaround === 'Express' ? Math.round(subtotal * (parseFloat(s.settings?.express_surcharge_percent || EXPRESS_SURCHARGE_DEFAULT) / 100)) : 0;
  const total = subtotal - discountMinor + taxAmount + surcharge;
  const balance = Math.max(0, total - moneyToMinorUnits(s.amountPaid || 0));

  view.innerHTML = `<header class="topbar"><div><h1>Point of Sale</h1><p>Create and process a new laundry order</p></div><div class="top-actions"><button class="secondary compact" id="held-orders-btn" aria-label="Held Orders">⏸ Held (${s.heldOrders?.length || 0})</button><button class="primary compact" id="new-order" aria-label="New Order">+ New Order</button></div></header><section class="page"><div class="stat-strip">${stat('Cart Items', cart.reduce((a, b) => a + (b.quantity || 0), 0),'blue')}${stat('Subtotal', formatMoneyKES(subtotal),'green')}${stat('Discount', discountMinor ? '-' + formatMoneyKES(discountMinor) : 'None','orange')}${stat('Total', formatMoneyKES(total),'blue')}${stat('Balance', formatMoneyKES(balance), balance > 0 ? 'red' : 'green')}</div><div class="pos-layout"><div class="catalog"><div class="search-row"><input id="service-search" placeholder="Search services…" value="${s.query || ''}" aria-label="Search services"></div><div class="service-grid" id="service-grid">${s.services?.length ? s.services.map(sv => `<div class="service-card" data-id="${sv.id}" tabindex="0" role="button" aria-label="Add ${sv.name}"><b>${sv.name}</b><div class="price">${formatMoneyKES(sv.price)}</div><small>${sv.category || ''} · ${sv.unit || 'item'}</small>${sv.express_available ? '<small style="color:var(--orange)">Express +30%</small>' : ''}</div>`).join('') : '<div class="empty"><b>No services</b></div>'}</div></div><aside class="cart"><h2>Current Order</h2><div id="customer-info" style="padding:12px;border:2px solid var(--border);border-radius:var(--radius-base);margin-bottom:12px;background:var(--bg);"><div style="display:flex;justify-content:space-between;align-items:center;"><div><b>${s.customer?.name || 'Walk-in Customer'}</b><small>${s.customer?.phone || ''}</small></div><button class="btn-sm secondary" id="change-customer" aria-label="Change Customer">Change</button></div></div><div class="cart-items" id="cart-items">${cart.length ? cart.map((item, i) => `<div class="cart-item"><strong>${item.name}</strong><div class="stepper"><button data-action="dec" data-idx="${i}" aria-label="Decrease">−</button><span>${item.quantity}</span><button data-action="inc" data-idx="${i}" aria-label="Increase">+</button></div><strong>${formatMoneyKES(item.unit_price * item.quantity)}</strong><button data-action="remove" data-idx="${i}" aria-label="Remove">✕</button></div>`).join('') : '<div class="empty-cart"><b>Your order is empty</b></div>'}</div><div style="padding:12px 0;border-bottom:2px solid var(--border);"><label><span>Discount</span><select id="discount-type" aria-label="Discount type"><option value="none" ${s.discountType === 'none' ? 'selected' : ''}>None</option><option value="percentage" ${s.discountType === 'percentage' ? 'selected' : ''}>Percentage</option><option value="fixed" ${s.discountType === 'fixed' ? 'selected' : ''}>Fixed (KSh)</option></select></label><label style="margin-top:8px;"><span>Discount Value</span><input id="discount-value" type="number" min="0" value="${s.discountValue || 0}" aria-label="Discount value"></label></div><div class="cart-total"><span>Total</span><strong id="cart-total">${formatMoneyKES(total)}</strong></div><div style="padding:12px 0;border-bottom:2px solid var(--border);"><label><span>Fulfilment</span><select id="fulfilment" aria-label="Fulfilment"><option value="collection" ${s.fulfilment === 'delivery' ? '' : 'selected'}>Collection</option><option value="delivery" ${s.fulfilment === 'delivery' ? 'selected' : ''}>Delivery</option></select></label><label style="margin-top:8px;"><span>Turnaround</span><div style="display:flex;gap:8px;"><label class="choice ${s.turnaround === 'Normal' ? 'active' : ''}"><input type="radio" name="turnaround" value="Normal" ${s.turnaround === 'Express' ? '' : 'checked'}><span>Normal · 24h</span></label><label class="choice ${s.turnaround === 'Express' ? 'active' : ''}"><input type="radio" name="turnaround" value="Express" ${s.turnaround === 'Express' ? 'checked' : ''}><span>Express · 4h</span></label></div></div><div style="margin-top:8px;"><label><span>Amount Received</span><input id="amount-paid" type="number" min="0" value="${s.amountPaid || total}" aria-label="Amount received"></label></div></div><button class="primary submit-order" id="checkout" aria-label="Checkout">Checkout →</button></aside></section></section>`;

  document.querySelector('#new-order')?.addEventListener('click', () => { resetPOS(s); renderApp(s); renderView(s); });
  document.querySelector('#held-orders-btn')?.addEventListener('click', () => showHeldOrders(s));
  document.querySelector('#change-customer')?.addEventListener('click', () => showCustomerSearch(s));
  document.querySelector('#service-search')?.addEventListener('input', (e) => { s.query = e.target.value; renderPOS(s); });
  document.querySelectorAll('.service-card').forEach(card => { card.addEventListener('click', () => { const id = card.dataset.id; const sv = s.services?.find(x => String(x.id) === id); if (!sv) return; const existing = cart.find(item => String(item.service_id) === id); if (existing) { existing.quantity++; } else { cart.push({ service_id: sv.id, name: sv.name, unit_price: sv.price, quantity: 1 }); } s.cart = cart; persistCart(s); renderPOS(s); }); });
  document.querySelectorAll('.stepper button, .cart-item button[data-action="remove"]').forEach(btn => { btn.addEventListener('click', () => { const idx = parseInt(btn.dataset.idx); const action = btn.dataset.action; if (action === 'remove') { cart.splice(idx, 1); } else if (action === 'inc') { cart[idx].quantity++; } else if (action === 'dec') { cart[idx].quantity--; if (cart[idx].quantity <= 0) cart.splice(idx, 1); } s.cart = cart; persistCart(s); renderPOS(s); }); });
  document.querySelector('#discount-type')?.addEventListener('change', (e) => { s.discountType = e.target.value; renderPOS(s); });
  document.querySelector('#discount-value')?.addEventListener('input', (e) => { s.discountValue = e.target.value; renderPOS(s); });
  document.querySelector('#fulfilment')?.addEventListener('change', (e) => { s.fulfilment = e.target.value; renderPOS(s); });
  document.querySelectorAll('input[name="turnaround"]').forEach(radio => { radio.addEventListener('change', (e) => { s.turnaround = e.target.value; renderPOS(s); }); });
  document.querySelector('#amount-paid')?.addEventListener('input', (e) => { s.amountPaid = e.target.value; renderPOS(s); });
  document.querySelector('#checkout')?.addEventListener('click', () => checkoutModal(s));
  persistCart(s);
}

function resetPOS(s) {
  s.cart = []; s.customer = null; s.discountType = 'none'; s.discountValue = 0; s.turnaround = 'Normal'; s.fulfilment = 'collection'; s.amountPaid = 0; s.holdMode = false; s.paymentState = 'idle';
  persistCart(s);
}

async function persistCart(s) {
  try { await db.pos_sessions.put({ id: 'current', cart: s.cart || [], customer: s.customer || null, discountType: s.discountType || 'none', discountValue: s.discountValue || 0, turnaround: s.turnaround || 'Normal', fulfilment: s.fulfilment || 'collection', amountPaid: s.amountPaid || 0, holdMode: s.holdMode || false, paymentState: s.paymentState || 'idle', updatedAt: Date.now() }); } catch {}
}

async function restoreCart(s) {
  try { const session = await db.pos_sessions.get('current'); if (session) { s.cart = session.cart || []; s.customer = session.customer || null; s.discountType = session.discountType || 'none'; s.discountValue = session.discountValue || 0; s.turnaround = session.turnaround || 'Normal'; s.fulfilment = session.fulfilment || 'collection'; s.amountPaid = session.amountPaid || 0; s.holdMode = session.holdMode || false; s.paymentState = session.paymentState || 'idle'; } } catch {}
}

async function showCustomerSearch(s) {
  await loadCustomers(s);
  const customers = s.customers || [];
  showModal(`<div class="modal" style="max-width:600px;"><div class="modal-head"><span class="eyebrow">CUSTOMER</span><h2>Select Customer</h2><button data-close aria-label="Close">×</button></div><div class="modal-body"><div class="search-row" style="margin-bottom:16px;"><input id="customer-search-modal" placeholder="Search by name or phone…" aria-label="Search customers"></div><div id="customer-list" style="max-height:400px;overflow-y:auto;">${customers.length ? customers.map(c => `<div class="cart-item" data-customer-id="${c.id}" style="cursor:pointer;"><div><b>${c.name}</b><small>${c.phone||''}</small><br><small>${c.email||''}</small></div></div>`).join('') : '<div class="empty"><b>No customers</b></div>'}</div><button class="primary" id="new-customer-from-pos" style="margin-top:12px;width:100%;">+ New Customer</button></div></div>`);
  document.querySelector('#customer-search-modal')?.addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); document.querySelectorAll('#customer-list > [data-customer-id]').forEach(el => { const name = (el.querySelector('b')?.textContent || '').toLowerCase(); const phone = (el.querySelector('small')?.textContent || '').toLowerCase(); el.style.display = name.includes(q) || phone.includes(q) ? '' : 'none'; }); });
  document.querySelectorAll('#customer-list > [data-customer-id]').forEach(el => { el.addEventListener('click', () => { const id = el.dataset.customerId; const c = customers.find(x => String(x.id) === id); if (c) { s.customer = c; persistCart(s); closeModal(); renderPOS(s); } }); });
  document.querySelector('#new-customer-from-pos')?.addEventListener('click', () => { closeModal(); showCustomerForm(s, null); });
}

function showHeldOrders(s) {
  const held = s.heldOrders || [];
  showModal(`<div class="modal" style="max-width:600px;"><div class="modal-head"><span class="eyebrow">HELD ORDERS</span><h2>Held Orders</h2><button data-close aria-label="Close">×</button></div><div class="modal-body">${held.length ? held.map((o, i) => `<div class="cart-item" style="cursor:pointer;" data-held-idx="${i}"><div><b>${o.orderNumber}</b><small>${o.customerName||'Walk-in'}</small><br><small>${formatMoneyKES(o.total)} · ${o.status}</small></div><button class="btn-sm danger" data-held-delete="${i}" aria-label="Delete held order">✕</button></div>`).join('') : '<div class="empty"><b>No held orders</b></div>'}</div></div>`);
  document.querySelectorAll('[data-held-idx]').forEach(el => { el.addEventListener('click', (e) => { if (e.target.closest('[data-held-delete]')) return; const idx = parseInt(el.dataset.heldIdx); const held = s.heldOrders || []; if (held[idx]) { s.cart = held[idx].cart || []; s.customer = held[idx].customer || null; s.discountType = held[idx].discountType || 'none'; s.discountValue = held[idx].discountValue || 0; s.turnaround = held[idx].turnaround || 'Normal'; s.fulfilment = held[idx].fulfilment || 'collection'; s.amountPaid = held[idx].amountPaid || 0; persistCart(s); closeModal(); renderPOS(s); } }); });
  document.querySelectorAll('[data-held-delete]').forEach(btn => { btn.addEventListener('click', () => { const idx = parseInt(btn.dataset.heldDelete); if (s.heldOrders) s.heldOrders.splice(idx, 1); persistCart(s); closeModal(); renderPOS(s); }); });
}

async function checkoutModal(s) {
  if (!s.cart || s.cart.length === 0) { toast('Cart is empty', 'error'); return; }
  const subtotal = s.cart.reduce((sum, item) => sum + moneyToMinorUnits(item.unit_price) * (item.quantity || 1), 0);
  const discountMinor = s.discountType === 'percentage' ? Math.round(subtotal * (moneyToMinorUnits(s.discountValue || 0) / 100)) : moneyToMinorUnits(s.discountValue || 0);
  const taxRate = parseFloat(s.settings?.tax_rate || TAX_RATE_DEFAULT);
  const taxAmount = Math.round((subtotal - discountMinor) * (taxRate / 100));
  const surcharge = s.turnaround === 'Express' ? Math.round(subtotal * (parseFloat(s.settings?.express_surcharge_percent || EXPRESS_SURCHARGE_DEFAULT) / 100)) : 0;
  const total = subtotal - discountMinor + taxAmount + surcharge;
  const balance = Math.max(0, total - moneyToMinorUnits(s.amountPaid || 0));

  const paymentState = s.paymentState || 'idle';
  const paymentStateLabel = { idle: 'Pending', initiating: 'Initiating…', prompt_sent: 'Awaiting M-Pesa…', awaiting_customer: 'Confirming…', confirmed: 'Confirmed', complete: 'Complete', failed: 'Failed' };

  showModal(`<div class="modal checkout-modal"><div class="modal-head"><span class="eyebrow">CHECKOUT</span><h2>Checkout</h2><button data-close aria-label="Close">×</button></div><div class="form-section"><h3>Customer</h3><div style="padding:12px;border:2px solid var(--border);border-radius:var(--radius-base);background:var(--bg);"><b>${s.customer?.name || 'Walk-in Customer'}</b><small>${s.customer?.phone || ''}</small></div><button class="btn-sm secondary" id="change-customer-checkout" style="margin-top:8px;">Change</button></div><div class="form-section"><h3>Order Summary</h3><div class="checkout-summary"><span>Subtotal</span><strong>${formatMoneyKES(subtotal)}</strong></div>${discountMinor ? `<div class="checkout-summary"><span>Discount (${s.discountType})</span><strong>-${formatMoneyKES(discountMinor)}</strong></div>` : ''}${taxAmount ? `<div class="checkout-summary"><span>Tax (${taxRate}%)</span><strong>${formatMoneyKES(taxAmount)}</strong></div>` : ''}${surcharge ? `<div class="checkout-summary"><span>Express Surcharge</span><strong>+${formatMoneyKES(surcharge)}</strong></div>` : ''}<div class="checkout-summary"><span>Total</span><strong>${formatMoneyKES(total)}</strong></div><div class="checkout-summary"><span>Amount Received</span><strong>${formatMoneyKES(s.amountPaid || total)}</strong></div>${balance > 0 ? `<div class="checkout-summary" style="color:var(--red);"><span>Balance</span><strong>${formatMoneyKES(balance)}</strong></div>` : '<div class="checkout-summary" style="color:var(--green);"><span>Paid</span><strong>✓ Full Payment</strong></div>'}</div><div class="form-section"><h3>Payment Method</h3><div style="display:flex;gap:8px;flex-wrap:wrap;"><label class="choice ${s.paymentMethod === 'Cash' ? 'active' : ''}"><input type="radio" name="payment-method" value="Cash" ${s.paymentMethod !== 'M-Pesa' && s.paymentMethod !== 'Card' ? 'checked' : ''}><span>Cash</span></label><label class="choice ${s.paymentMethod === 'M-Pesa' ? 'active' : ''}"><input type="radio" name="payment-method" value="M-Pesa" ${s.paymentMethod === 'M-Pesa' ? 'checked' : ''}><span>M-Pesa</span></label><label class="choice ${s.paymentMethod === 'Card' ? 'active' : ''}"><input type="radio" name="payment-method" value="Card" ${s.paymentMethod === 'Card' ? 'checked' : ''}><span>Card</span></label><label class="choice"><input type="radio" name="payment-method" value="Pay later"><span>Pay Later</span></label></div></div><div id="mpesa-section" style="display:${s.paymentMethod === 'M-Pesa' ? 'block' : 'none'};padding:12px;border:2px solid var(--border);border-radius:var(--radius-base);margin-top:12px;"><label><span>Phone Number</span><input id="mpesa-phone" type="tel" value="${s.mpesaPhone || ''}" placeholder="2547XXXXXXXX" aria-label="M-Pesa phone"></label><button class="primary" id="mpesa-push" style="margin-top:8px;width:100%;">Send STK Push</button><div id="mpesa-status" style="margin-top:8px;font-size:12px;color:var(--muted);">${paymentState !== 'idle' ? `State: ${paymentStateLabel[paymentState] || paymentState}` : ''}</div></div><div id="payment-state-badge" style="margin-top:12px;padding:8px;border-radius:var(--radius-base);border:2px solid var(--border);background:var(--bg);text-align:center;font-weight:600;">Payment: ${paymentStateLabel[paymentState] || 'Pending'}</div><button class="primary submit-order" id="submit-order" aria-label="Create Order" ${paymentState === 'initiating' || paymentState === 'prompt_sent' || paymentState === 'awaiting_customer' ? 'disabled' : ''}>${paymentState === 'confirmed' ? 'Confirm & Create Order' : 'Create Order & Receipt'}</button></div>`);

  document.querySelector('#change-customer-checkout')?.addEventListener('click', () => { closeModal(); showCustomerSearch(s); });
  document.querySelectorAll('input[name="payment-method"]').forEach(radio => { radio.addEventListener('change', (e) => { s.paymentMethod = e.target.value; const mpesaSection = document.querySelector('#mpesa-section'); if (mpesaSection) mpesaSection.style.display = e.target.value === 'M-Pesa' ? 'block' : 'none'; }); });
  document.querySelector('#mpesa-push')?.addEventListener('click', async () => { const phone = document.querySelector('#mpesa-phone')?.value; if (!phone) { toast('Enter phone number', 'error'); return; } s.mpesaPhone = phone; s.paymentState = 'initiating'; renderPOS(s); await processMPesaSTK(s, phone, total); });
  document.querySelector('#submit-order')?.addEventListener('click', () => { if (s.paymentState === 'confirmed') { s.paymentState = 'complete'; } submitOrder(s); });
}

async function processMPesaSTK(s, phone, amount) {
  try {
    const result = await api.mpesaSTKPush({ phone, amount: amount / 100, order_id: null });
    s.paymentState = 'prompt_sent';
    toast('M-Pesa STK Push sent. Waiting for confirmation…');
    const checkoutId = result.CheckoutRequestID;
    let polls = 0;
    const pollInterval = setInterval(async () => {
      polls++;
      try {
        const status = await api.getMPesaStatus();
        if (status && status.status === 'confirmed') {
          clearInterval(pollInterval);
          s.paymentState = 'confirmed';
          toast('M-Pesa payment confirmed!');
          renderPOS(s);
        } else if (polls > 20) {
          clearInterval(pollInterval);
          s.paymentState = 'failed';
          toast('M-Pesa payment timed out', 'error');
          renderPOS(s);
        }
      } catch {
        if (polls > 20) { clearInterval(pollInterval); s.paymentState = 'failed'; toast('Polling failed', 'error'); renderPOS(s); }
      }
    }, 3000);
  } catch (err) {
    s.paymentState = 'failed';
    toast('M-Pesa STK Push failed: ' + err.message, 'error');
    renderPOS(s);
  }
}

async function submitOrder(s) {
  if (!s.cart || s.cart.length === 0) { toast('Cart is empty', 'error'); return; }
  const subtotal = s.cart.reduce((sum, item) => sum + moneyToMinorUnits(item.unit_price) * (item.quantity || 1), 0);
  const discountMinor = s.discountType === 'percentage' ? Math.round(subtotal * (moneyToMinorUnits(s.discountValue || 0) / 100)) : moneyToMinorUnits(s.discountValue || 0);
  const taxRate = parseFloat(s.settings?.tax_rate || TAX_RATE_DEFAULT);
  const taxAmount = Math.round((subtotal - discountMinor) * (taxRate / 100));
  const surcharge = s.turnaround === 'Express' ? Math.round(subtotal * (parseFloat(s.settings?.express_surcharge_percent || EXPRESS_SURCHARGE_DEFAULT) / 100)) : 0;
  const total = subtotal - discountMinor + taxAmount + surcharge;
  const amountPaid = moneyToMinorUnits(s.amountPaid || 0);
  const balance = Math.max(0, total - amountPaid);
  const paymentMethod = s.paymentMethod || 'Cash';
  const orderNumber = generateOrderNumber();
  const now = Math.floor(Date.now() / 1000);

  try {
    const result = await api.createOrder({
      customer_id: s.customer?.id || null,
      items: s.cart.map(item => ({ service_id: item.service_id, sku: '', description: item.name, quantity: item.quantity, unit_price: item.unit_price, line_total: item.unit_price * item.quantity })),
      total: total / 100, subtotal: subtotal / 100, discount: discountMinor / 100, surcharge: surcharge / 100,
      amount_paid: amountPaid / 100, payment_method: paymentMethod, turnaround: s.turnaround, fulfilment: s.fulfilment,
      notes: '', care_notes: ''
    });
    toast(`Order ${result.order_number || orderNumber} created`);
    if (balance > 0 && paymentMethod !== 'Pay later') {
      try { await api.addPayment(result.order_id || result.id, { amount: (total - amountPaid) / 100, method: paymentMethod, reference: 'Balance payment' }); } catch {}
    }
    s.cart = []; s.customer = null; s.discountType = 'none'; s.discountValue = 0; s.turnaround = 'Normal'; s.fulfilment = 'collection'; s.amountPaid = 0; s.paymentMethod = 'Cash'; s.paymentState = 'idle'; s.mpesaPhone = '';
    persistCart(s);
    s.view = 'orders'; renderApp(s); renderView(s);
  } catch (err) {
    toast('Offline: saving locally', 'error');
    const order = {
      orderNumber, customerId: s.customer?.id || null, cashierId: 1, branchId: 1, status: 'Received',
      dueDate: now + (s.turnaround === 'Express' ? 4 : 24) * 3600000,
      subtotal, discount: discountMinor, surcharge, tax: taxAmount, total, amountPaid, balance,
      paymentMethod, fulfilment: s.fulfilment, turnaround: s.turnaround, notes: '', careNotes: '',
      items: s.cart.map(item => ({ serviceId: item.service_id, sku: '', description: item.name, quantity: item.quantity, unitPrice: item.unit_price, discount: 0, surcharge: 0, lineTotal: item.unit_price * item.quantity })),
      createdAt: Date.now(), updatedAt: Date.now(), syncStatus: 'pending'
    };
    await db.orders.add(order);
    await addToSyncQueue('order', order.id || Date.now(), 'create', order, `${order.orderNumber}:create`);
    toast('Order saved locally, will sync when online');
    s.cart = []; s.customer = null; s.discountType = 'none'; s.discountValue = 0; s.turnaround = 'Normal'; s.fulfilment = 'collection'; s.amountPaid = 0; s.paymentMethod = 'Cash'; s.paymentState = 'idle'; s.mpesaPhone = '';
    persistCart(s);
    s.view = 'orders'; renderApp(s); renderView(s);
  }
}

async function renderOrders(s) {
  await loadOrders(s);
  const view = document.querySelector('#view');
  if (!view) return;
  const orders = s.orders || [];
  const totalOrders = s.totalOrders || orders.length;
  const readyCount = orders.filter(o => o.status === 'Ready').length;
  const collectedCount = orders.filter(o => o.status === 'Collected').length;
  const cancelledCount = orders.filter(o => o.status === 'Cancelled').length;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const outstanding = orders.filter(o => (o.balance || 0) > 0).reduce((sum, o) => sum + (o.balance || 0), 0);

  view.innerHTML = `<header class="topbar"><div><h1>Orders</h1><p>Track and fulfil customer orders</p></div><div class="top-actions"><button class="secondary compact" id="export-orders" aria-label="Export CSV">Export CSV</button><button class="primary compact" id="new-order-btn" aria-label="New Order">+ New Order</button></div></header><section class="page"><div class="stat-strip">${stat('Orders', totalOrders,'blue')}${stat('Ready', readyCount,'green')}${stat('Collected', collectedCount,'blue')}${stat('Cancelled', cancelledCount,'red')}${stat('Revenue', formatMoneyKES(totalRevenue),'green')}${stat('Outstanding', formatMoneyKES(outstanding),'orange')}</div><div class="panel"><div class="search-row" style="margin-bottom:16px;flex-wrap:wrap;gap:8px;"><input id="order-search" placeholder="Search orders…" value="${s.searchQuery||''}" aria-label="Search orders" style="flex:1;min-width:180px;"><select id="order-status-filter" aria-label="Filter by status"><option value="">All Status</option><option value="Received">Received</option><option value="Sorting">Sorting</option><option value="Washing">Washing</option><option value="Drying">Drying</option><option value="Ironing">Ironing</option><option value="Folding">Folding</option><option value="Quality Check">Quality Check</option><option value="Ready">Ready</option><option value="Collected">Collected</option><option value="Cancelled">Cancelled</option></select><select id="order-sort" aria-label="Sort orders"><option value="newest">Newest First</option><option value="oldest">Oldest First</option><option value="total-asc">Total: Low→High</option><option value="total-desc">Total: High→Low</option><option value="status">Status</option></select><button class="btn-sm secondary" id="order-reset-filters" aria-label="Reset filters">Reset</button></div><div class="table-wrap"><table class="orders-table"><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Turnaround</th><th>Actions</th></tr></thead><tbody id="orders-tbody">${orders.length ? orders.map(o => `<tr><td><b>${o.order_number||'—'}</b><br><small>${o.id}</small></td><td>${o.customer_name||'Walk-in'}<br><small>${o.customer_phone||''}</small></td><td>${formatMoneyKES(o.total)}</td><td>${formatMoneyKES(o.amount_paid||0)}</td><td style="color:${(o.balance||0)>0?'var(--red)':'var(--green)'}">${formatMoneyKES(o.balance||0)}</td><td><span class="status ${o.status}">${o.status}</span></td><td>${o.turnaround||'—'}</td><td><div style="display:flex;gap:4px;flex-wrap:wrap;"><button class="btn-sm secondary view-order" data-id="${o.id}" aria-label="View order">View</button><button class="btn-sm secondary pay-order" data-id="${o.id}" data-balance="${o.balance||0}" aria-label="Record payment">Pay</button><button class="btn-sm danger cancel-order" data-id="${o.id}" data-status="${o.status}" aria-label="Cancel order">Cancel</button></div></td></tr>`).join('') : '<tr><td colspan="8" class="empty"><b>No orders</b></td></tr>'}</tbody></table></div>${s.orderPages > 1 ? `<div style="display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap;">${Array.from({length: s.orderPages}, (_, i) => `<button class="btn-sm ${s.page === i+1 ? 'primary' : 'secondary'}" data-page="${i+1}">${i+1}</button>`).join('')}</div>` : ''}</div></section>`;
  document.querySelector('#new-order-btn')?.addEventListener('click', () => { s.view='pos'; s.cart=[]; resetPOS(s); renderApp(s); renderView(s); });
  document.querySelector('#export-orders')?.addEventListener('click', () => { const csv = 'Order,Customer,Total,Paid,Balance,Status,Turnaround\n' + (orders||[]).map(o => `${o.order_number||''},${o.customer_name||''},${o.total||0},${o.amount_paid||0},${o.balance||0},${o.status||''},${o.turnaround||''}`).join('\n'); const blob = new Blob([csv], {type:'text/csv'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'orders.csv'; a.click(); });
  document.querySelector('#order-search')?.addEventListener('input', (e) => { s.searchQuery = e.target.value; s.page = 1; renderOrders(s); });
  document.querySelector('#order-status-filter')?.addEventListener('change', (e) => { s.filterStatus = e.target.value; s.page = 1; renderOrders(s); });
  document.querySelector('#order-sort')?.addEventListener('change', (e) => { s.orderSort = e.target.value; renderOrders(s); });
  document.querySelector('#order-reset-filters')?.addEventListener('click', () => { s.searchQuery = ''; s.filterStatus = ''; s.orderSort = 'newest'; s.page = 1; renderOrders(s); });
  document.querySelectorAll('.view-order').forEach(btn => { btn.addEventListener('click', async () => { const id = btn.dataset.id; let order; try { order = await api.getOrder(id); } catch { order = await db.orders.get(id); } if (order) showOrderDetail(s, order); }); });
  document.querySelectorAll('.pay-order').forEach(btn => { btn.addEventListener('click', () => { const id = btn.dataset.id; const balance = parseInt(btn.dataset.balance); if (balance <= 0) { toast('No outstanding balance', 'info'); return; } showOrderPaymentForm(s, id, balance); }); });
  document.querySelectorAll('.cancel-order').forEach(btn => { btn.addEventListener('click', async () => { const id = btn.dataset.id; const status = btn.dataset.status; if (status === 'Cancelled') { toast('Already cancelled', 'info'); return; } if (!confirm('Cancel this order?')) return; try { await api.updateOrderStatus(id, 'Cancelled'); toast('Order cancelled'); } catch(e) { toast('Error: '+e.message, 'error'); } renderOrders(s); }); });
  document.querySelectorAll('[data-page]').forEach(btn => { btn.addEventListener('click', () => { s.page = parseInt(btn.dataset.page); renderOrders(s); }); });
}

function showOrderDetail(s, order) {
  const items = order.items || [];
  const payments = order.payments || [];
  const history = order.history || [];
  const balance = (order.total || 0) - (order.amount_paid || 0);
  showModal(`<div class="modal" style="max-width:800px;"><div class="modal-head"><span class="eyebrow">ORDER</span><h2>${order.order_number||'Order'}</h2><button data-close aria-label="Close">×</button></div><div class="modal-body"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;"><div><b>${order.customer_name||'Customer'}</b><br><small>${order.customer_phone||''} ${order.customer_email||''}</small></div><span class="status ${order.status}">${order.status}</span></div><div class="stat-strip">${stat('Total', formatMoneyKES(order.total),'blue')}${stat('Paid', formatMoneyKES(order.amount_paid||0),'green')}${stat('Balance', formatMoneyKES(balance), balance > 0 ? 'red' : 'green')}${stat('Items', items.length,'blue')}${stat('Payments', payments.length,'blue')}</div><h3 style="margin-top:20px;">Items</h3><div class="table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr></thead><tbody>${items.length ? items.map(i => `<tr><td>${i.description||i.sku||''}</td><td>${i.quantity||1}</td><td>${formatMoneyKES(i.unit_price||0)}</td><td>${formatMoneyKES((i.unit_price||0)*(i.quantity||1))}</td></tr>`).join('') : '<tr><td colspan="4" class="empty"><b>No items</b></td></tr>'}</tbody></table></div><h3 style="margin-top:20px;">Payments</h3><div class="table-wrap"><table><thead><tr><th>Method</th><th>Amount</th><th>Reference</th><th>Status</th></tr></thead><tbody>${payments.length ? payments.map(p => `<tr><td>${p.method||''}</td><td>${formatMoneyKES(p.amount||0)}</td><td>${p.reference||''}</td><td>${p.status||''}</td></tr>`).join('') : '<tr><td colspan="4" class="empty"><b>No payments</b></td></tr>'}</tbody></table></div><h3 style="margin-top:20px;">Workflow History</h3><div style="display:flex;flex-direction:column;gap:4px;margin-top:8px;">${history.length ? history.map(h => `<div style="display:flex;justify-content:space-between;padding:6px 12px;border:2px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);"><span><b>${h.stage}</b>${h.note ? ' — '+h.note : ''}</span><small>${h.username||''} · ${new Date((h.created_at||0)*1000).toLocaleString()}</small></div>`).join('') : '<div class="empty"><b>No history</b></div>'}</div><h3 style="margin-top:20px;">Workflow</h3><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">${['Received','Sorting','Washing','Drying','Ironing','Folding','Quality Check','Ready','Collected'].map(st => `<button class="btn-sm ${order.status===st?'primary':'secondary'}" data-status="${st}">${st}</button>`).join('')}<button class="btn-sm danger" data-action="cancel">Cancel</button></div><div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;"><button class="btn primary" data-action="receipt">Print Receipt</button><button class="btn secondary" data-action="refund">Refund</button><button class="btn secondary" data-action="payment">Record Payment</button></div></div></div>`);
  document.querySelectorAll('[data-status]').forEach(btn => { btn.addEventListener('click', async () => { const newStatus = btn.dataset.status; try { await api.updateOrderStatus(order.id, newStatus); toast(`Status → ${newStatus}`); } catch(e) { toast('Error: '+e.message, 'error'); } closeModal(); renderOrders(s); }); });
  document.querySelector('[data-action="cancel"]')?.addEventListener('click', async () => { if (!confirm('Cancel this order?')) return; try { await api.updateOrderStatus(order.id, 'Cancelled'); toast('Order cancelled'); } catch(e) { toast('Error: '+e.message, 'error'); } closeModal(); renderOrders(s); });
  document.querySelector('[data-action="receipt"]')?.addEventListener('click', async () => { try { const receipt = await api.getReceipt(order.id); showReceiptModal(receipt.receipt); } catch(e) { toast('Error loading receipt', 'error'); } });
  document.querySelector('[data-action="refund"]')?.addEventListener('click', async () => { const amount = prompt('Refund amount (KSh):'); if (!amount || amount <= 0) return; const reason = prompt('Reason for refund:'); if (!reason) return; try { await api.refundPayment({ order_id: order.id, amount: moneyToMinorUnits(amount), method: 'Cash', reference: reason }); toast(`Refund of ${formatMoneyKES(moneyToMinorUnits(amount))} processed`); } catch(e) { toast('Error: '+e.message, 'error'); } closeModal(); renderOrders(s); });
  document.querySelector('[data-action="payment"]')?.addEventListener('click', () => { closeModal(); showOrderPaymentForm(s, order.id, balance); });
}

function showOrderPaymentForm(s, orderId, balance) {
  showModal(`<div class="modal" style="max-width:440px;"><div class="modal-head"><span class="eyebrow">PAYMENT</span><h2>Record Payment</h2><button data-close aria-label="Close">×</button></div><div class="modal-body"><p style="margin-bottom:12px;">Order balance: <b>${formatMoneyKES(balance)}</b></p><div class="form-section"><label for="pay-amount">Amount (KSh)</label><input id="pay-amount" type="number" min="1" max="${balance}" value="${balance}" aria-label="Payment amount"></div><div class="form-section"><label for="pay-method">Method</label><select id="pay-method" aria-label="Payment method"><option value="Cash">Cash</option><option value="M-Pesa">M-Pesa</option><option value="Card">Card</option><option value="Bank Transfer">Bank Transfer</option></select></div><div class="form-section"><label for="pay-reference">Reference</label><input id="pay-reference" placeholder="Optional reference" aria-label="Payment reference"></div><button class="primary" id="submit-payment" style="margin-top:12px;width:100%;">Record Payment</button></div></div>`);
  document.querySelector('#submit-payment')?.addEventListener('click', async () => { const amount = parseInt(document.querySelector('#pay-amount')?.value); const method = document.querySelector('#pay-method')?.value; const reference = document.querySelector('#pay-reference')?.value || ''; if (!amount || amount <= 0) { toast('Enter a valid amount', 'error'); return; } try { await api.addPayment(orderId, { amount, method, reference }); toast(`Payment of ${formatMoneyKES(moneyToMinorUnits(amount))} recorded`); } catch(e) { toast('Error: '+e.message, 'error'); } closeModal(); renderOrders(s); });
}

async function renderCustomers(s) {
  await loadCustomers(s);
  const customers = s.customers || [];
  const searchQuery = (s.customerSearch || '').toLowerCase();
  const filterStatus = s.customerFilter || 'all';
  const sortBy = s.customerSort || 'name';
  const sortDir = s.customerSortDir || 'asc';

  let filtered = customers;
  if (searchQuery) {
    filtered = filtered.filter(c =>
      (c.name || '').toLowerCase().includes(searchQuery) ||
      (c.phone || '').includes(searchQuery) ||
      (c.email || '').toLowerCase().includes(searchQuery) ||
      (c.id || '').includes(searchQuery)
    );
  }
  if (filterStatus === 'active') filtered = filtered.filter(c => c.status === 'active');
  else if (filterStatus === 'inactive') filtered = filtered.filter(c => c.status === 'inactive');
  else if (filterStatus === 'new') filtered = filtered.filter(c => { const created = c.createdAt || 0; const weekAgo = Date.now() - 7*86400000; return created > weekAgo; });
  else if (filterStatus === 'returning') filtered = filtered.filter(c => (c.orderCount || 0) > 1);
  else if (filterStatus === 'outstanding') filtered = filtered.filter(c => (c.outstandingBalance || 0) > 0);
  else if (filterStatus === 'no-outstanding') filtered = filtered.filter(c => (c.outstandingBalance || 0) === 0);

  filtered.sort((a, b) => {
    let va = a[sortBy], vb = b[sortBy];
    if (sortBy === 'name') { va = (va||'').toLowerCase(); vb = (vb||'').toLowerCase(); }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const totalCustomers = filtered.length;
  const activeCustomers = filtered.filter(c => c.status === 'active').length;
  const newCustomers = filtered.filter(c => { const created = c.createdAt || 0; return created > Date.now() - 7*86400000; }).length;
  const totalOutstanding = filtered.reduce((sum, c) => sum + (c.outstandingBalance || 0), 0);
  const avgSpend = totalCustomers > 0 ? filtered.reduce((sum, c) => sum + (c.totalSpent || 0), 0) / totalCustomers : 0;

  const view = document.querySelector('#view');
  if (!view) return;
  view.innerHTML = `<header class="topbar"><div><h1>Customers</h1><p>Manage customer profiles, orders, payments and outstanding balances.</p></div><div class="top-actions"><button class="primary" id="new-customer-btn" aria-label="New Customer">+ Add Customer</button></div></header><section class="page"><div class="stat-strip">${stat('Total Customers', totalCustomers,'blue')}${stat('Active', activeCustomers,'green')}${stat('New (7d)', newCustomers,'orange')}${stat('Outstanding', formatMoneyKES(totalOutstanding), totalOutstanding > 0 ? 'red' : 'blue')}${stat('Avg Spend', formatMoneyKES(avgSpend),'blue')}</div><div class="panel"><div class="search-row" style="margin-bottom:16px;flex-wrap:wrap;gap:8px;display:flex;"><input id="customer-search" placeholder="Search customers…" value="${s.customerSearch||''}" aria-label="Search customers" style="flex:1;min-width:200px;"><select id="customer-filter" aria-label="Filter customers" style="min-width:140px;"><option value="all" ${filterStatus==='all'?'selected':''}>All Customers</option><option value="active" ${filterStatus==='active'?'selected':''}>Active</option><option value="inactive" ${filterStatus==='inactive'?'selected':''}>Inactive</option><option value="new" ${filterStatus==='new'?'selected':''}>New</option><option value="returning" ${filterStatus==='returning'?'selected':''}>Returning</option><option value="outstanding" ${filterStatus==='outstanding'?'selected':''}>Outstanding Balance</option><option value="no-outstanding" ${filterStatus==='no-outstanding'?'selected':''}>No Outstanding</option></select><select id="customer-sort" aria-label="Sort customers" style="min-width:140px;"><option value="name" ${sortBy==='name'?'selected':''}>Name</option><option value="totalSpent" ${sortBy==='totalSpent'?'selected':''}>Total Spent</option><option value="outstandingBalance" ${sortBy==='outstandingBalance'?'selected':''}>Outstanding</option><option value="orderCount" ${sortBy==='orderCount'?'selected':''}>Orders</option><option value="lastOrder" ${sortBy==='lastOrder'?'selected':''}>Last Order</option><option value="createdAt" ${sortBy==='createdAt'?'selected':''}>Created</option></select><button class="btn-sm secondary" id="customer-sort-dir" aria-label="Sort direction">${sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}</button></div>${s.online === false ? '<div style="padding:8px 12px;background:#fff8e1;color:#b8860b;border-radius:var(--radius-base);border:2px solid #b8860b;font-size:12px;font-weight:600;">⚠ Offline — showing locally stored data</div>' : ''}${!s.online ? '<div style="padding:8px 12px;background:#e8f8f0;color:var(--green);border-radius:var(--radius-base);border:2px solid var(--green);font-size:12px;font-weight:600;margin-top:8px;">✓ Online — synced with server</div>' : ''}<div class="customer-cards"><div class="table-wrap" style="margin-top:16px;"><table class="customer-table"><thead><tr><th>Customer</th><th>Phone</th><th>Orders</th><th>Total Spent</th><th>Outstanding</th><th>Last Order</th><th>Status</th><th>Actions</th></tr></thead><tbody id="customers-tbody">${filtered.length ? filtered.map(c => `<tr><td><div style="display:flex;align-items:center;gap:10px;"><div style="width:36px;height:36px;border-radius:50%;border:2px solid var(--blue);display:grid;place-items:center;font-weight:700;color:var(--blue);background:var(--light);flex-shrink:0;">${(c.name||'?').split(' ').map(w=>w[0]).join('').toUpperCase()}</div><div><b>${c.name||'—'}</b><br><small style="color:var(--muted);">${c.email||'—'}</small></div></div></td><td>${c.phone||'—'}</td><td>${c.orderCount||0}</td><td>${formatMoneyKES(c.totalSpent||0)}</td><td style="color:${(c.outstandingBalance||0)>0?'var(--red)':'var(--green)'};font-weight:600;">${formatMoneyKES(c.outstandingBalance||0)}</td><td>${c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString('en-KE',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</td><td><span class="status ${c.status||'active'}">${c.status||'active'}</span></td><td><div style="display:flex;gap:4px;flex-wrap:wrap;"><button class="btn-sm secondary view-customer" data-id="${c.id}" aria-label="View customer">View</button><button class="btn-sm secondary edit-customer" data-id="${c.id}" aria-label="Edit customer">Edit</button><button class="btn-sm primary new-order-customer" data-id="${c.id}" data-name="${c.name||''}" data-phone="${c.phone||''}" aria-label="New order">+ Order</button><button class="btn-sm danger delete-customer" data-id="${c.id}" aria-label="Delete customer">Delete</button></div></td></tr>`).join('') : '<tr><td colspan="8" class="empty"><b>No customers found</b><p>Try another name or phone number.</p></td></tr>'}</tbody></table></div>${totalCustomers > 50 ? `<div style="display:flex;gap:8px;justify-content:center;margin-top:16px;">${Array.from({length: Math.ceil(totalCustomers/50)}, (_, i) => `<button class="btn-sm ${s.customerPage === i+1 ? 'primary' : 'secondary'}" data-page="${i+1}">${i+1}</button>`).join('')}</div>` : ''}</div></section>`;

  document.querySelector('#new-customer-btn')?.addEventListener('click', () => showCustomerForm(s, null));
  document.querySelector('#customer-search')?.addEventListener('input', (e) => { s.customerSearch = e.target.value; s.customerPage = 1; renderCustomers(s); });
  document.querySelector('#customer-filter')?.addEventListener('change', (e) => { s.customerFilter = e.target.value; s.customerPage = 1; renderCustomers(s); });
  document.querySelector('#customer-sort')?.addEventListener('change', (e) => { s.customerSort = e.target.value; renderCustomers(s); });
  document.querySelector('#customer-sort-dir')?.addEventListener('click', () => { s.customerSortDir = s.customerSortDir === 'asc' ? 'desc' : 'asc'; renderCustomers(s); });
  document.querySelectorAll('.edit-customer').forEach(btn => { btn.addEventListener('click', () => { const c = customers.find(x => String(x.id) === btn.dataset.id); if (c) showCustomerForm(s, c); }); });
  document.querySelectorAll('.delete-customer').forEach(btn => { btn.addEventListener('click', async () => { if (!confirm('Archive this customer? Historical orders remain.')) return; const id = btn.dataset.id; try { await api.updateCustomer(id, { status: 'inactive' }); toast('Customer archived'); } catch { toast('Offline: customer marked locally', 'error'); } renderCustomers(s); }); });
  document.querySelectorAll('.view-customer').forEach(btn => { btn.addEventListener('click', () => { const c = customers.find(x => String(x.id) === btn.dataset.id); if (c) showCustomerDetail(s, c); }); });
  document.querySelectorAll('.new-order-customer').forEach(btn => { btn.addEventListener('click', () => { const c = customers.find(x => String(x.id) === btn.dataset.id); if (c) { s.customer = { id: c.id, name: c.name, phone: c.phone }; s.view = 'pos'; s.cart = []; renderApp(s); renderView(s); toast(`Selected: ${c.name}`); } }); });
  document.querySelectorAll('[data-page]').forEach(btn => { btn.addEventListener('click', () => { s.customerPage = parseInt(btn.dataset.page); renderCustomers(s); }); });
}

async function showCustomerDetail(s, customer) {
  const customerId = customer.id;
  let customerOrders = [];
  let customerPayments = [];
  try {
    const ordersRes = await api.getOrders({ customer: customerId, limit: 50 });
    customerOrders = ordersRes.orders || ordersRes || [];
  } catch {
    try { customerOrders = await db.orders.filter(o => o.customerId === customerId).toArray(); } catch {}
  }
  try {
    const paymentsRes = await api.getPayments({ customer_id: customerId });
    customerPayments = Array.isArray(paymentsRes) ? paymentsRes : (paymentsRes.payments || []);
  } catch {
    try { customerPayments = await db.payments.filter(p => p.orderId === customerId).toArray(); } catch {}
  }

  const totalOrders = customerOrders.length;
  const completedOrders = customerOrders.filter(o => o.status === 'Collected' || o.status === 'Ready').length;
  const activeOrders = customerOrders.filter(o => !['Collected','Cancelled','Ready'].includes(o.status)).length;
  const totalSpent = customerOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const outstandingBalance = customerOrders.reduce((sum, o) => sum + (o.balance || 0), 0);
  const avgOrder = totalOrders > 0 ? totalSpent / totalOrders : 0;
  const lastOrder = customerOrders.length ? customerOrders[0].created_at || customerOrders[0].createdAt : null;

  showModal(`<div class="modal" style="max-width:700px;max-height:90vh;overflow-y:auto;"><div class="modal-head"><span class="eyebrow">CUSTOMER</span><div><h2>${customer.name}</h2><small>${customer.phone||''} · ${customer.email||'—'}</small></div><button data-close aria-label="Close">×</button></div><div class="modal-body"><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;"><span class="status ${customer.status||'active'}">${customer.status||'active'}</span><span class="sync-badge synced">Customer since ${customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('en-KE',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</span></div><div class="stat-strip">${stat('Total Orders', totalOrders,'blue')}${stat('Completed', completedOrders,'green')}${stat('Active', activeOrders,'orange')}${stat('Total Spent', formatMoneyKES(totalSpent),'blue')}${stat('Outstanding', formatMoneyKES(outstandingBalance), outstandingBalance > 0 ? 'red' : 'green')}${stat('Avg Order', formatMoneyKES(avgOrder),'blue')}</div>${outstandingBalance > 0 ? `<div style="padding:12px;border:2px solid var(--red);border-radius:var(--radius-base);background:#fde8e8;margin-bottom:16px;"><b style="color:var(--red);">Outstanding: ${formatMoneyKES(outstandingBalance)}</b><small> across ${customerOrders.filter(o=>(o.balance||0)>0).length} order(s)</small><div style="display:flex;gap:8px;margin-top:8px;"><button class="btn-sm primary" id="record-payment" data-customer-id="${customerId}">Record Payment</button><button class="btn-sm secondary" id="view-outstanding" data-customer-id="${customerId}">View Outstanding</button></div></div>` : ''}<div style="display:flex;gap:8px;margin-bottom:16px;"><button class="btn primary" id="new-order-from-customer" data-customer-id="${customerId}" data-customer-name="${customer.name}" data-customer-phone="${customer.phone||''}">+ New Order</button><button class="btn secondary" id="edit-customer-detail" data-customer-id="${customerId}">Edit Customer</button></div><h3>Orders</h3><div class="table-wrap"><table><thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Total</th><th>Paid</th><th>Balance</th></tr></thead><tbody>${customerOrders.length ? customerOrders.map(o => `<tr><td>${o.order_number||'—'}</td><td>${o.created_at ? new Date(o.created_at*1000).toLocaleDateString('en-KE') : (o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-KE') : '—')}</td><td><span class="status ${o.status}">${o.status}</span></td><td>${formatMoneyKES(o.total)}</td><td>${formatMoneyKES(o.amount_paid||0)}</td><td style="color:${(o.balance||0)>0?'var(--red)':'var(--green)'}">${formatMoneyKES(o.balance||0)}</td></tr>`).join('') : '<tr><td colspan="6" class="empty"><b>No orders</b></td></tr>'}</tbody></table></div><h3 style="margin-top:24px;">Payments</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Order</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead><tbody>${customerPayments.length ? customerPayments.map(p => `<tr><td>${p.created_at ? new Date(p.created_at*1000).toLocaleDateString('en-KE') : '—'}</td><td>${p.order_id||'—'}</td><td>${p.method}</td><td>${formatMoneyKES(p.amount)}</td><td>${p.status}</td></tr>`).join('') : '<tr><td colspan="5" class="empty"><b>No payments</b></td></tr>'}</tbody></table></div></div></div>`);

  document.querySelector('#record-payment')?.addEventListener('click', () => { closeModal(); showPaymentForm(s, customerId, outstandingBalance); });
  document.querySelector('#view-outstanding')?.addEventListener('click', () => {
    const outstandingOrders = customerOrders.filter(o => (o.balance||0) > 0);
    showModal(`<div class="modal" style="max-width:600px;"><div class="modal-head"><span class="eyebrow">OUTSTANDING</span><h2>Outstanding Orders</h2><button data-close aria-label="Close">×</button></div><div class="modal-body">${outstandingOrders.length ? outstandingOrders.map(o => `<div class="cart-item"><div><b>${o.order_number||'—'}</b><small>${o.status}</small></div><strong>${formatMoneyKES(o.balance||0)}</strong></div>`).join('') : '<div class="empty"><b>No outstanding orders</b></div>'}</div></div>`);
  });
  document.querySelector('#new-order-from-customer')?.addEventListener('click', () => { closeModal(); s.customer = { id: customerId, name: customer.name, phone: customer.phone }; s.view = 'pos'; s.cart = []; renderApp(s); renderView(s); toast(`Selected: ${customer.name}`); });
  document.querySelector('#edit-customer-detail')?.addEventListener('click', () => { closeModal(); showCustomerForm(s, customer); });
}

function showPaymentForm(s, customerId, outstandingBalance) {
  showModal(`<div class="modal"><div class="modal-head"><span class="eyebrow">PAYMENT</span><h2>Record Payment</h2><button data-close aria-label="Close">×</button></div><div class="modal-body"><form id="payment-form"><label><span>Amount (KSh)</span><input name="amount" type="number" min="0" max="${outstandingBalance}" required aria-label="Payment amount"></label><label><span>Method</span><select name="method" aria-label="Payment method"><option>Cash</option><option>M-Pesa</option><option>Card</option></select></label><label><span>Reference</span><input name="reference" aria-label="Reference"></label><button class="primary submit-payment" type="submit" aria-label="Record Payment">Record Payment</button></form></div></div>`);
  document.querySelector('#payment-form')?.addEventListener('submit', async (e) => { e.preventDefault(); const fd = new FormData(e.target); const amount = moneyToMinorUnits(fd.get('amount')); const method = fd.get('method'); const reference = fd.get('reference'); try { await api.addPayment(customerId, { amount: amount, method, reference }); toast(`Payment of ${formatMoneyKES(amount)} recorded`); } catch(err) { toast('Error: '+err.message, 'error'); } closeModal(); renderCustomers(s); });
}

function showCustomerForm(s, customer) {
  const isEdit = !!customer;
  showModal(`<div class="modal"><div class="modal-head"><span class="eyebrow">${isEdit?'EDIT':'NEW'} CUSTOMER</span><h2>${isEdit?'Edit Customer':'Add Customer'}</h2><button data-close aria-label="Close">×</button></div><div class="modal-body"><form id="customer-form"><label><span>Full Name *</span><input name="name" value="${customer?.name||''}" required aria-label="Full name" placeholder="Enter full name"></label><label><span>Phone Number *</span><input name="phone" value="${customer?.phone||''}" required aria-label="Phone number" placeholder="0712345678" inputmode="tel"></label><label><span>Email</span><input name="email" type="email" value="${customer?.email||''}" aria-label="Email" placeholder="email@example.com"></label><label><span>Address</span><input name="address" value="${customer?.address||''}" aria-label="Address" placeholder="Physical address"></label><label><span>Alternate Phone</span><input name="alternate_phone" value="${customer?.alternate_phone||''}" aria-label="Alternate phone" placeholder="Alternate number" inputmode="tel"></label><label><span>Notes</span><textarea name="notes" rows="2" aria-label="Notes" placeholder="Customer notes, preferences...">${customer?.notes||''}</textarea></label><div id="customer-form-error" style="color:var(--red);font-size:12px;display:none;"></div><button class="primary submit-customer" type="submit" aria-label="Save Customer" ${isEdit ? '' : ''}>${isEdit?'Update':'Create'} Customer</button></form></div></div>`);

  const validatePhone = (phone) => {
    const digits = phone.replace(/\D/g, '');
    return digits.length === 9 || digits.length === 12;
  };

  const checkDuplicate = async (phone, excludeId) => {
    const normalized = phone.replace(/\D/g, '');
    try {
      const res = await api.getCustomers({ search: normalized });
      const customers = res.customers || res || [];
      return customers.find(c => c.phone === normalized && c.id !== excludeId) || null;
    } catch {
      const allCustomers = await db.customers.toArray();
      return allCustomers.find(c => c.phone === normalized && c.id !== excludeId) || null;
    }
  };

  document.querySelector('#customer-form')?.addEventListener('submit', async (e) => { e.preventDefault(); const fd = new FormData(e.target); const name = fd.get('name')?.trim(); const phone = fd.get('phone')?.trim(); const email = fd.get('email')?.trim(); const address = fd.get('address')?.trim(); const alternatePhone = fd.get('alternate_phone')?.trim(); const notes = fd.get('notes')?.trim(); const errorEl = document.querySelector('#customer-form-error'); if (!name) { if (errorEl) { errorEl.textContent = 'Name is required.'; errorEl.style.display = 'block'; } return; } if (!phone || !validatePhone(phone)) { if (errorEl) { errorEl.textContent = 'Valid Kenyan phone number required (07XX XXX XXX or +254XXXXXXXXX).'; errorEl.style.display = 'block'; } return; } if (errorEl) { errorEl.style.display = 'none'; } const normalizedPhone = phone.replace(/\D/g, ''); const duplicate = await checkDuplicate(normalizedPhone, customer?.id); if (duplicate && String(duplicate.id) !== String(customer?.id)) { showModal(`<div class="modal" style="max-width:400px;"><div class="modal-head"><span class="eyebrow">DUPLICATE</span><h2>Possible Duplicate</h2><button data-close aria-label="Close">×</button></div><div class="modal-body"><p>A customer with this phone number already exists:</p><b>${duplicate.name}</b><small>${duplicate.phone}</small><div style="display:flex;gap:8px;margin-top:16px;"><button class="btn primary view-duplicate" data-customer-id="${duplicate.id}">View Customer</button><button class="btn secondary continue-anyway" data-customer-id="${customer?.id||''}" data-name="${name}" data-phone="${phone}" data-email="${email}" data-address="${address}" data-notes="${notes}">Continue Anyway</button></div></div></div>`); document.querySelector('.view-duplicate')?.addEventListener('click', () => { const c = s.customers?.find(x => String(x.id) === document.querySelector('.view-duplicate').dataset.customerId); if (c) showCustomerDetail(s, c); closeModal(); }); document.querySelector('.continue-anyway')?.addEventListener('click', async () => { closeModal(); await saveCustomer(s, { name, phone: normalizedPhone, email, address, alternate_phone: alternatePhone, notes, status: 'active' }, customer); }); return; } await saveCustomer(s, { name, phone: normalizedPhone, email, address, alternate_phone: alternatePhone, notes, status: customer?.status || 'active' }, customer); });
}

async function saveCustomer(s, data, existingCustomer) {
  try {
    if (existingCustomer) {
      await api.updateCustomer(existingCustomer.id, data);
      toast('Customer updated');
      try { await db.customers.update(existingCustomer.id, { ...data, updatedAt: Date.now() }); } catch {}
    } else {
      const result = await api.createCustomer(data);
      toast('Customer created');
      const newCustomer = { ...data, id: result.id || Date.now(), createdAt: Date.now(), updatedAt: Date.now(), status: 'active', orderCount: 0, totalSpent: 0, outstandingBalance: 0 };
      try { await db.customers.add(newCustomer); } catch {}
      await addToSyncQueue('customer', newCustomer.id, 'create', data, `customer:${newCustomer.id}:create`);
    }
  } catch(err) {
    toast('Offline: saving locally', 'error');
    try {
      if (existingCustomer) {
        await db.customers.update(existingCustomer.id, { ...data, updatedAt: Date.now() });
      } else {
        const localId = Date.now();
        await db.customers.add({ ...data, id: localId, createdAt: localId, updatedAt: localId, status: 'active' });
        await addToSyncQueue('customer', localId, 'create', data, `customer:${localId}:create`);
      }
    } catch(e) { toast('Error saving customer: '+e.message, 'error'); }
  }
  closeModal();
  renderCustomers(s);
}

async function renderServices(s) {
  await loadServices(s);
  const view = document.querySelector('#view');
  if (!view) return;
  const services = s.services || [];
  const searchQuery = (s.serviceSearch || '').toLowerCase();
  const categoryFilter = s.serviceCategory || '';
  const activeFilter = s.serviceActiveFilter || '';

  let filtered = services;
  if (searchQuery) {
    filtered = filtered.filter(sv =>
      (sv.name || '').toLowerCase().includes(searchQuery) ||
      (sv.category || '').toLowerCase().includes(searchQuery) ||
      (sv.description || '').toLowerCase().includes(searchQuery) ||
      (sv.sku || '').toLowerCase().includes(searchQuery)
    );
  }
  if (categoryFilter) filtered = filtered.filter(sv => sv.category === categoryFilter);
  if (activeFilter === 'true') filtered = filtered.filter(sv => sv.active !== 0);
  if (activeFilter === 'false') filtered = filtered.filter(sv => sv.active === 0);

  const categories = [...new Set(services.map(sv => sv.category).filter(Boolean))].sort();
  const totalServices = filtered.length;
  const activeServices = filtered.filter(sv => sv.active !== 0).length;
  const inactiveServices = filtered.filter(sv => sv.active === 0).length;

  view.innerHTML = `<header class="topbar"><div><h1>Services & Prices</h1><p>Manage laundry services, prices, turnaround times and availability.</p></div><div class="top-actions"><button class="primary" id="new-service-btn" aria-label="New Service">+ Add Service</button></div></header><section class="page"><div class="stat-strip">${stat('Total Services', totalServices,'blue')}${stat('Active', activeServices,'green')}${stat('Inactive', inactiveServices,'orange')}${stat('Categories', categories.length,'blue')}</div><div class="panel"><div class="search-row" style="margin-bottom:16px;flex-wrap:wrap;gap:8px;display:flex;"><input id="service-search" placeholder="Search services…" value="${s.serviceSearch||''}" aria-label="Search services" style="flex:1;min-width:200px;"><select id="service-category-filter" aria-label="Filter category" style="min-width:140px;"><option value="">All Categories</option>${categories.map(c => `<option value="${c}" ${categoryFilter===c?'selected':''}>${c}</option>`).join('')}</select><select id="service-active-filter" aria-label="Filter status" style="min-width:140px;"><option value="">All</option><option value="true" ${activeFilter==='true'?'selected':''}>Active</option><option value="false" ${activeFilter==='false'?'selected':''}>Inactive</option></select></div>${s.online === false ? '<div style="padding:8px 12px;background:#fff8e1;color:#b8860b;border-radius:var(--radius-base);border:2px solid #b8860b;font-size:12px;font-weight:600;">⚠ Offline — showing locally stored data</div>' : ''}${!s.online ? '<div style="padding:8px 12px;background:#e8f8f0;color:var(--green);border-radius:var(--radius-base);border:2px solid var(--green);font-size:12px;font-weight:600;margin-top:8px;">✓ Online — synced with server</div>' : ''}<div class="table-wrap" style="margin-top:16px;"><table class="service-table"><thead><tr><th>Service</th><th>Category</th><th>Price</th><th>Unit</th><th>Express</th><th>Status</th><th>Actions</th></tr></thead><tbody>${filtered.length ? filtered.map(sv => `<tr><td><b>${sv.name||'—'}</b>${sv.sku?'<br><small style="color:var(--muted);">'+sv.sku+'</small>':''}${sv.description?'<br><small style="color:var(--muted);">'+sv.description+'</small>':''}</td><td>${sv.category||'—'}</td><td>${formatMoneyKES(sv.price||0)}</td><td>${sv.unit||'item'}</td><td>${sv.express_available?'Yes':'No'}</td><td><span class="status ${sv.active!==0?'active':'inactive'}">${sv.active!==0?'Active':'Inactive'}</span></td><td><div style="display:flex;gap:4px;flex-wrap:wrap;"><button class="btn-sm secondary edit-service" data-id="${sv.id}" aria-label="Edit service">Edit</button><button class="btn-sm danger delete-service" data-id="${sv.id}" aria-label="Delete service">${sv.active!==0?'Archive':'Restore'}</button></div></td></tr>`).join('') : '<tr><td colspan="7" class="empty"><b>No services found</b><p>Try another search or category.</p></td></tr>'}</tbody></table></div>${totalServices > 50 ? `<div style="display:flex;gap:8px;justify-content:center;margin-top:16px;">${Array.from({length: Math.ceil(totalServices/50)}, (_, i) => `<button class="btn-sm ${s.servicePage === i+1 ? 'primary' : 'secondary'}" data-page="${i+1}">${i+1}</button>`).join('')}</div>` : ''}</div></section>`;

  document.querySelector('#new-service-btn')?.addEventListener('click', () => showServiceForm(s, null));
  document.querySelector('#service-search')?.addEventListener('input', (e) => { s.serviceSearch = e.target.value; s.servicePage = 1; renderServices(s); });
  document.querySelector('#service-category-filter')?.addEventListener('change', (e) => { s.serviceCategory = e.target.value; s.servicePage = 1; renderServices(s); });
  document.querySelector('#service-active-filter')?.addEventListener('change', (e) => { s.serviceActiveFilter = e.target.value; s.servicePage = 1; renderServices(s); });
  document.querySelectorAll('.edit-service').forEach(btn => { btn.addEventListener('click', () => { const sv = s.services?.find(x => String(x.id) === btn.dataset.id); if (sv) showServiceForm(s, sv); }); });
  document.querySelectorAll('.delete-service').forEach(btn => { btn.addEventListener('click', async () => { const id = btn.dataset.id; const sv = s.services?.find(x => String(id) === x.id); if (!sv) return; if (sv.active !== 0) { if (!confirm('Archive this service? Historical orders will retain the original service info.')) return; } try { await api.deleteService(id); toast(sv.active !== 0 ? 'Service archived' : 'Service restored'); } catch { toast('Offline: service marked locally', 'error'); } renderServices(s); }); });
  document.querySelectorAll('[data-page]').forEach(btn => { btn.addEventListener('click', () => { s.servicePage = parseInt(btn.dataset.page); renderServices(s); }); });
}

function showServiceForm(s, service) {
  const isEdit = !!service;
  showModal(`<div class="modal"><div class="modal-head"><span class="eyebrow">${isEdit?'EDIT':'NEW'} SERVICE</span><h2>${isEdit?'Edit Service':'Add Service'}</h2><button data-close aria-label="Close">×</button></div><div class="modal-body"><form id="service-form"><label><span>Name *</span><input name="name" value="${service?.name||''}" required aria-label="Service name" placeholder="e.g. Washing · full load"></label><label><span>Category *</span><input name="category" value="${service?.category||''}" required aria-label="Category" placeholder="e.g. Full load"></label><label><span>Price (KSh) *</span><input name="price" type="number" min="0" value="${service?.price||''}" required aria-label="Price" placeholder="600"></label><label><span>Unit</span><select name="unit" aria-label="Unit"><option ${service?.unit==='kg'?'selected':''}>kg</option><option ${service?.unit==='item'?'selected':''}>item</option><option ${service?.unit==='piece'?'selected':''}>piece</option></select></label><label><span>Express Available</span><select name="express_available" aria-label="Express"><option ${service?.express_available?'selected':''}>Yes</option><option ${!service?.express_available?'selected':''}>No</option></select></label><label><span>Description</span><input name="description" value="${service?.description||''}" aria-label="Description" placeholder="Optional description"></label><label><span>SKU/Code</span><input name="sku" value="${service?.sku||''}" aria-label="SKU" placeholder="Optional SKU"></label><div id="service-form-error" style="color:var(--red);font-size:12px;display:none;"></div><button class="primary submit-service" type="submit" aria-label="Save Service">${isEdit?'Update':'Create'} Service</button></form></div></div>`);

  document.querySelector('#service-form')?.addEventListener('submit', async (e) => { e.preventDefault(); const fd = new FormData(e.target); const name = fd.get('name')?.trim(); const category = fd.get('category')?.trim(); const price = fd.get('price'); const errorEl = document.querySelector('#service-form-error'); if (!name) { if (errorEl) { errorEl.textContent = 'Service name is required.'; errorEl.style.display = 'block'; } return; } if (!category) { if (errorEl) { errorEl.textContent = 'Category is required.'; errorEl.style.display = 'block'; } return; } if (!price || isNaN(price) || Number(price) < 0) { if (errorEl) { errorEl.textContent = 'Valid price (KSh) is required.'; errorEl.style.display = 'block'; } return; } if (errorEl) { errorEl.style.display = 'none'; } const data = { name, category, price: moneyToMinorUnits(price), unit: fd.get('unit'), express_available: fd.get('express_available') === 'Yes', description: fd.get('description')?.trim() || '', sku: fd.get('sku')?.trim() || '' }; try { if (isEdit) { await api.updateService(service.id, data); toast('Service updated'); } else { await api.createService(data); toast('Service created'); } } catch(err) { toast('Error: '+err.message, 'error'); } closeModal(); renderServices(s); });
}

const DATE_PRESETS = [
  { label: 'Today', days: 0 },
  { label: 'Yesterday', days: 1 },
  { label: 'Last 7 Days', days: 7 },
  { label: 'Last 14 Days', days: 14 },
  { label: 'Last 30 Days', days: 30 },
  { label: 'This Week', week: true },
  { label: 'Last Week', week: -1 },
  { label: 'This Month', month: true },
  { label: 'Last Month', month: -1 },
  { label: 'This Quarter', quarter: true },
  { label: 'This Year', year: true },
];

function getDateRange(preset) {
  const now = new Date();
  let from, to;
  if (preset.days !== undefined) {
    from = new Date(now); from.setDate(from.getDate() - preset.days);
    to = new Date(now);
  } else if (preset.week) {
    const day = now.getDay() || 7;
    from = new Date(now); from.setDate(from.getDate() - day + 1);
    to = new Date(now);
  } else if (preset.week === -1) {
    const day = now.getDay() || 7;
    from = new Date(now); from.setDate(from.getDate() - day - 6);
    to = new Date(now); to.setDate(to.getDate() - day);
  } else if (preset.month) {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now);
  } else if (preset.month === -1) {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (preset.quarter) {
    const q = Math.floor(now.getMonth() / 3);
    from = new Date(now.getFullYear(), q * 3, 1);
    to = new Date(now);
  } else if (preset.year) {
    from = new Date(now.getFullYear(), 0, 1);
    to = new Date(now);
  }
  return { dateFrom: from.toISOString().split('T')[0], dateTo: to.toISOString().split('T')[0] };
}

function pctChange(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / Math.abs(previous) * 100).toFixed(1);
}

function formatChange(val) {
  if (val === null || val === undefined) return '';
  const sign = val > 0 ? '↑' : val < 0 ? '↓' : '→';
  return `${sign} ${Math.abs(val)}%`;
}

function changeColor(val) {
  if (val === null || val === undefined) return 'var(--muted)';
  return val >= 0 ? 'var(--green)' : 'var(--red)';
}

async function renderReports(s) {
  s.dateFrom = s.dateFrom || getDateRange(DATE_PRESETS[2]).dateFrom;
  s.dateTo = s.dateTo || getDateRange(DATE_PRESETS[2]).dateTo;
  s.reportTab = s.reportTab || 'sales';
  s.reportAggregation = s.reportAggregation || 'day';
  s.reportLimit = s.reportLimit || '10';

  const params = { date_from: s.dateFrom, date_to: s.dateTo, branch_id: s.reportBranch || '', cashier_id: s.reportCashier || '', payment_method: s.reportPaymentMethod || '', status: s.reportStatus || '', category: s.reportCategory || '', aggregation: s.reportAggregation };

  let salesData, comparisonData, byDayData, servicesData, statusData, expressData, fulfilmentData, paymentData, outstandingData, refundData, discountData, profitabilityData, branchData, customerGrowthData;
  try { salesData = await api.getReports(params); } catch { salesData = null; }
  try { comparisonData = await api.getReportComparison(params); } catch { comparisonData = null; }
  try { byDayData = await api.getReportByDay(s.dateFrom && s.dateTo ? 365 : 30); } catch { byDayData = []; }
  try { servicesData = await api.getServicesPerformance({ ...params, limit: s.reportLimit }); } catch { servicesData = []; }
  try { statusData = await api.getOrderStatusReport(params); } catch { statusData = []; }
  try { expressData = await api.getExpressVsNormal(params); } catch { expressData = []; }
  try { fulfilmentData = await api.getFulfilmentReport(params); } catch { fulfilmentData = []; }
  try { paymentData = await api.getPaymentReport(params); } catch { paymentData = []; }
  try { outstandingData = await api.getOutstandingReport(params); } catch { outstandingData = null; }
  try { refundData = await api.getRefundReport(params); } catch { refundData = null; }
  try { discountData = await api.getDiscountReport(params); } catch { discountData = null; }
  try { profitabilityData = await api.getProfitabilityReport(params); } catch { profitabilityData = null; }
  try { branchData = await api.getBranchReport(); } catch { branchData = []; }
  try { customerGrowthData = await api.getCustomerGrowth(params); } catch { customerGrowthData = []; }

  s.reportData = salesData;
  s.reportComparison = comparisonData;
  s.reportByDay = byDayData;
  s.reportServices = servicesData;
  s.reportStatus = statusData;
  s.reportExpress = expressData;
  s.reportFulfilment = fulfilmentData;
  s.reportPayments = paymentData;
  s.reportOutstanding = outstandingData;
  s.reportRefunds = refundData;
  s.reportDiscounts = discountData;
  s.reportProfitability = profitabilityData;
  s.reportBranches = branchData;
  s.reportCustomerGrowth = customerGrowthData;

  const view = document.querySelector('#view');
  if (!view) return;
  const r = salesData || { total_orders: 0, gross_sales: 0, total_paid: 0, outstanding: 0, avg_order: 0, unique_customers: 0, cash_sales: 0, mpesa_sales: 0, card_sales: 0, cancelled_orders: 0 };
  const c = comparisonData || { current: {}, previous: {}, changes: {} };
  const ch = c.changes || {};

  view.innerHTML = `<header class="topbar"><div><h1>Reports & Analytics</h1><p>Understand your sales, customers, laundry operations and business performance.</p></div><div class="top-actions"><button class="secondary compact" id="report-export-csv" aria-label="Export CSV">↓ CSV</button><button class="secondary compact" id="report-export-pdf" aria-label="Export PDF">↓ PDF</button><button class="secondary compact" id="report-print" aria-label="Print">🖨 Print</button></div></header><section class="page"><div class="report-filters"><div class="filter-group"><label>Date Range</label><select id="report-date-preset" aria-label="Date preset">${DATE_PRESETS.map(p => `<option value="${p.label}" ${s.datePreset===p.label?'selected':''}>${p.label}</option>`).join('')}</select><input type="date" id="report-date-from" value="${s.dateFrom}" aria-label="From"><input type="date" id="report-date-to" value="${s.dateTo}" aria-label="To"></div><div class="filter-group"><label>Branch</label><select id="report-branch" aria-label="Branch"><option value="">All Branches</option>${(s.branches||[]).map(b => `<option value="${b.id}" ${s.reportBranch==b.id?'selected':''}>${b.name}</option>`).join('')}</select></div><div class="filter-group"><label>Payment</label><select id="report-payment" aria-label="Payment method"><option value="">All</option><option value="Cash" ${s.reportPaymentMethod==='Cash'?'selected':''}>Cash</option><option value="M-Pesa" ${s.reportPaymentMethod==='M-Pesa'?'selected':''}>M-Pesa</option><option value="Card" ${s.reportPaymentMethod==='Card'?'selected':''}>Card</option></select></div><div class="filter-group"><label>Status</label><select id="report-status" aria-label="Order status"><option value="">All</option><option value="Received" ${s.reportStatus==='Received'?'selected':''}>Received</option><option value="Sorting" ${s.reportStatus==='Sorting'?'selected':''}>Sorting</option><option value="Washing" ${s.reportStatus==='Washing'?'selected':''}>Washing</option><option value="Drying" ${s.reportStatus==='Drying'?'selected':''}>Drying</option><option value="Ironing" ${s.reportStatus==='Ironing'?'selected':''}>Ironing</option><option value="Folding" ${s.reportStatus==='Folding'?'selected':''}>Folding</option><option value="Quality Check" ${s.reportStatus==='Quality Check'?'selected':''}>Quality Check</option><option value="Ready" ${s.reportStatus==='Ready'?'selected':''}>Ready</option><option value="Collected" ${s.reportStatus==='Collected'?'selected':''}>Collected</option><option value="Cancelled" ${s.reportStatus==='Cancelled'?'selected':''}>Cancelled</option></select></div><div class="filter-group"><label>Aggregation</label><select id="report-aggregation" aria-label="Aggregation"><option value="day" ${s.reportAggregation==='day'?'selected':''}>Daily</option><option value="week" ${s.reportAggregation==='week'?'selected':''}>Weekly</option><option value="month" ${s.reportAggregation==='month'?'selected':''}>Monthly</option></select></div><div class="filter-group"><label>Top N</label><select id="report-limit" aria-label="Top N"><option value="5" ${s.reportLimit==='5'?'selected':''}>Top 5</option><option value="10" ${s.reportLimit==='10'?'selected':''}>Top 10</option><option value="20" ${s.reportLimit==='20'?'selected':''}>Top 20</option></select></div><button class="primary" id="report-refresh" aria-label="Refresh">Refresh</button></div><div class="report-tabs">${tabBtn('sales','Sales')}${tabBtn('orders','Orders')}${tabBtn('payments','Payments')}${tabBtn('customers','Customers')}${tabBtn('services','Services')}${tabBtn('laundry','Laundry')}${tabBtn('financial','Financial')}${tabBtn('operations','Operations')}</div><div id="report-content"></div></section>`;
  document.querySelector('#report-date-preset')?.addEventListener('change', (e) => { const preset = DATE_PRESETS.find(p => p.label === e.target.value); if (preset) { const range = getDateRange(preset); s.dateFrom = range.dateFrom; s.dateTo = range.dateTo; s.datePreset = preset.label; } renderReports(s); });
  document.querySelector('#report-date-from')?.addEventListener('change', (e) => { s.dateFrom = e.target.value; s.datePreset = ''; renderReports(s); });
  document.querySelector('#report-date-to')?.addEventListener('change', (e) => { s.dateTo = e.target.value; s.datePreset = ''; renderReports(s); });
  document.querySelector('#report-branch')?.addEventListener('change', (e) => { s.reportBranch = e.target.value; renderReports(s); });
  document.querySelector('#report-payment')?.addEventListener('change', (e) => { s.reportPaymentMethod = e.target.value; renderReports(s); });
  document.querySelector('#report-status')?.addEventListener('change', (e) => { s.reportStatus = e.target.value; renderReports(s); });
  document.querySelector('#report-aggregation')?.addEventListener('change', (e) => { s.reportAggregation = e.target.value; renderReports(s); });
  document.querySelector('#report-limit')?.addEventListener('change', (e) => { s.reportLimit = e.target.value; renderReports(s); });
  document.querySelector('#report-refresh')?.addEventListener('click', () => { renderReports(s); });
  document.querySelector('#report-export-csv')?.addEventListener('click', () => exportReportCSV(s));
  document.querySelector('#report-export-pdf')?.addEventListener('click', () => exportReportPDF(s));
  document.querySelector('#report-print')?.addEventListener('click', () => window.print());
  document.querySelectorAll('.report-tab').forEach(btn => { btn.addEventListener('click', () => { s.reportTab = btn.dataset.tab; renderReports(s); }); });
  renderReportContent(s);
}

function tabBtn(tab, label) {
  return `<button class="report-tab ${tab}" data-tab="${tab}">${label}</button>`;
}

function renderReportContent(s) {
  const content = document.querySelector('#report-content');
  if (!content) return;
  const r = s.reportData || {};
  const c = s.reportComparison || {};
  const ch = c.changes || {};
  const byDay = s.reportByDay || [];
  const tab = s.reportTab;

  let html = '';
  if (tab === 'sales') {
    html = `<div class="report-kpis">${kpi('Gross Sales', formatMoneyKES(r.gross_sales||0), formatChange(ch.revenue), changeColor(ch.revenue))}${kpi('Orders', r.total_orders||0, formatChange(ch.orders), changeColor(ch.orders))}${kpi('Avg Order', formatMoneyKES(r.avg_order||0), formatChange(ch.avg_order), changeColor(ch.avg_order))}${kpi('Paid', formatMoneyKES(r.total_paid||0), '', 'var(--muted)')}${kpi('Outstanding', formatMoneyKES(r.outstanding||0), '', 'var(--red)')}${kpi('Customers', r.unique_customers||0, '', 'var(--muted)')}${kpi('Cash Sales', formatMoneyKES(r.cash_sales||0), '', 'var(--green)')}${kpi('M-Pesa', formatMoneyKES(r.mpesa_sales||0), '', 'var(--blue)')}${kpi('Card', formatMoneyKES(r.card_sales||0), '', 'var(--orange)')}</div><div class="report-section"><h3>Sales Trend</h3><div class="chart-container" id="sales-trend-chart">${renderLineChart(byDay, 'Revenue', 'Orders')}</div></div><div class="report-section"><h3>Sales by Payment Method</h3><div class="chart-container">${renderDonutChart([{label:'Cash',value:r.cash_sales||0},{label:'M-Pesa',value:r.mpesa_sales||0},{label:'Card',value:r.card_sales||0},{label:'Pay Later',value:r.pay_later_sales||0}])}</div></div><div class="report-section"><h3>Sales Table</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Orders</th><th>Revenue</th></tr></thead><tbody>${byDay.map(d => `<tr><td>${d.date}</td><td>${d.orders||0}</td><td>${formatMoneyKES(d.revenue||0)}</td></tr>`).join('')}</tbody></table></div></div>`;
  } else if (tab === 'orders') {
    html = `<div class="report-kpis">${kpi('Total Orders', r.total_orders||0,'','var(--blue)')}${kpi('Cancelled', r.cancelled_orders||0,'','var(--red)')}${kpi('Avg Order', formatMoneyKES(r.avg_order||0),'','var(--green)')}${kpi('Unique Customers', r.unique_customers||0,'','var(--muted)')}</div><div class="report-section"><h3>Orders by Status</h3><div class="chart-container">${renderHorizontalBarChart(s.reportStatus||[])}</div></div><div class="report-section"><h3>Express vs Normal</h3><div class="chart-container">${renderHorizontalBarChart(s.reportExpress||[])}</div></div><div class="report-section"><h3>Fulfilment</h3><div class="chart-container">${renderHorizontalBarChart(s.reportFulfilment||[])}</div></div>`;
  } else if (tab === 'payments') {
    const payments = s.reportPayments || [];
    html = `<div class="report-kpis">${kpi('Total Paid', formatMoneyKES(r.total_paid||0),'','var(--green)')}${kpi('Outstanding', formatMoneyKES(r.outstanding||0),'','var(--red)')}${kpi('Cash Sales', formatMoneyKES(r.cash_sales||0),'','var(--blue)')}${kpi('M-Pesa Sales', formatMoneyKES(r.mpesa_sales||0),'','var(--orange)')}</div><div class="report-section"><h3>Payment Breakdown</h3><div class="chart-container">${renderDonutChart(payments.map(p => ({label: p.method, value: p.total})))}</div></div><div class="report-section"><h3>Payment Table</h3><div class="table-wrap"><table><thead><tr><th>Method</th><th>Count</th><th>Total</th><th>Completed</th><th>Pending</th><th>Failed</th></tr></thead><tbody>${payments.map(p => `<tr><td>${p.method}</td><td>${p.count||0}</td><td>${formatMoneyKES(p.total||0)}</td><td>${formatMoneyKES(p.completed||0)}</td><td>${formatMoneyKES(p.pending||0)}</td><td>${formatMoneyKES(p.failed||0)}</td></tr>`).join('')}</tbody></table></div></div>`;
  } else if (tab === 'customers') {
    const growth = s.reportCustomerGrowth || [];
    html = `<div class="report-kpis">${kpi('Unique Customers', r.unique_customers||0,'','var(--blue)')}${kpi('New This Period', growth.reduce((s,g) => s + (g.new_customers||0), 0),'','var(--green)')}${kpi('Returning', r.total_orders ? r.total_orders - r.unique_customers : 0,'','var(--orange)')}</div><div class="report-section"><h3>Customer Growth</h3><div class="chart-container">${renderLineChart(growth, 'New Customers')}</div></div><div class="report-section"><h3>Top Customers</h3><div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Orders</th><th>Lifetime Spend</th></tr></thead><tbody>${(s.topCustomers||[]).map(c => `<tr><td>${c.name}</td><td>${c.phone||''}</td><td>${c.order_count||0}</td><td>${formatMoneyKES(c.lifetime_spend||0)}</td></tr>`).join('')}</tbody></table></div></div>`;
  } else if (tab === 'services') {
    const services = s.reportServices || [];
    html = `<div class="report-kpis">${kpi('Top Service Revenue', formatMoneyKES(services.reduce((s,sv) => s + (sv.revenue||0), 0)),'','var(--green)')}${kpi('Top Service Orders', services.reduce((s,sv) => s + (sv.orders||0), 0),'','var(--blue)')}</div><div class="report-section"><h3>Service Revenue</h3><div class="chart-container">${renderHorizontalBarChart(services.map(sv => ({label: sv.name, value: sv.revenue})))}</div></div><div class="report-section"><h3>Service Table</h3><div class="table-wrap"><table><thead><tr><th>Service</th><th>Category</th><th>Orders</th><th>Qty</th><th>Revenue</th><th>Avg Price</th></tr></thead><tbody>${services.map(sv => `<tr><td>${sv.name}</td><td>${sv.category||''}</td><td>${sv.orders||0}</td><td>${sv.quantity||0}</td><td>${formatMoneyKES(sv.revenue||0)}</td><td>${formatMoneyKES(sv.avg_price||0)}</td></tr>`).join('')}</tbody></table></div></div>`;
  } else if (tab === 'laundry') {
    html = `<div class="report-kpis">${kpi('Active Laundry', (r.active_laundry||0),'','var(--blue)')}${kpi('Ready', (r.ready_orders||0),'','var(--green)')}${kpi('Overdue', (r.overdue_orders||0),'','var(--red)')}${kpi('Total Orders', r.total_orders||0,'','var(--muted)')}</div><div class="report-section"><h3>Laundry Board</h3><div class="laundry-board">${renderLaundryBoard(s)}</div></div>`;
  } else if (tab === 'financial') {
    const prof = s.reportProfitability || {};
    const disc = s.reportDiscounts || {};
    const refunds = s.reportRefunds || {};
    html = `<div class="report-kpis">${kpi('Revenue', formatMoneyKES(prof.revenue||0),'','var(--green)')}${kpi('Discounts', formatMoneyKES(prof.discounts||0),'','var(--orange)')}${kpi('Expenses', formatMoneyKES(prof.expenses||0),'','var(--red)')}${kpi('Profit', formatMoneyKES(prof.profit||0), prof.profit >= 0 ? '↑' : '↓', prof.profit >= 0 ? 'var(--green)' : 'var(--red)')}${kpi('Refunds', formatMoneyKES((refunds.refunds||[]).reduce((s,r) => s + Math.abs(r.amount||0), 0)),'','var(--red)')}${kpi('Total Discounts', formatMoneyKES(disc.total_discounts||0),'','var(--orange)')}</div><div class="report-section"><h3>Profitability</h3><div class="table-wrap"><table><thead><tr><th>Metric</th><th>Amount</th></tr></thead><tbody><tr><td>Revenue</td><td>${formatMoneyKES(prof.revenue||0)}</td></tr><tr><td>Discounts</td><td>-${formatMoneyKES(prof.discounts||0)}</td></tr><tr><td>Surcharges</td><td>${formatMoneyKES(prof.surcharges||0)}</td></tr><tr><td>Tax</td><td>${formatMoneyKES(prof.tax||0)}</td></tr><tr><td>Expenses</td><td>-${formatMoneyKES(prof.expenses||0)}</td></tr><tr><td><b>Profit</b></td><td><b>${formatMoneyKES(prof.profit||0)}</b></td></tr></tbody></table></div></div><div class="report-section"><h3>Discount Report</h3><div class="table-wrap"><table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody><tr><td>Discounted Orders</td><td>${disc.discounted_orders||0}</td></tr><tr><td>Total Discounts</td><td>${formatMoneyKES(disc.total_discounts||0)}</td></tr><tr><td>Avg Discount</td><td>${formatMoneyKES(disc.avg_discount||0)}</td></tr><tr><td>Discount %</td><td>${(disc.discount_pct||0).toFixed(1)}%</td></tr></tbody></table></div></div>`;
  } else if (tab === 'operations') {
    const branches = s.reportBranches || [];
    const cashReport = s.reportCash || [];
    html = `<div class="report-section"><h3>Branch Performance</h3><div class="table-wrap"><table><thead><tr><th>Branch</th><th>Orders</th><th>Revenue</th><th>Paid</th><th>Outstanding</th></tr></thead><tbody>${branches.map(b => `<tr><td>${b.name}</td><td>${b.orders||0}</td><td>${formatMoneyKES(b.revenue||0)}</td><td>${formatMoneyKES(b.paid||0)}</td><td>${formatMoneyKES(b.outstanding||0)}</td></tr>`).join('')}</tbody></table></div></div><div class="report-section"><h3>Cash Shifts</h3><div class="table-wrap"><table><thead><tr><th>Cashier</th><th>Branch</th><th>Opening</th><th>Actual</th><th>Variance</th><th>Status</th></tr></thead><tbody>${cashReport.map(cs => `<tr><td>${cs.cashier_name||''}</td><td>${cs.branch_name||''}</td><td>${formatMoneyKES(cs.opening_float||0)}</td><td>${formatMoneyKES(cs.actual_balance||0)}</td><td style="color:${(cs.variance||0) !== 0 ? 'var(--red)' : 'var(--green)'}">${formatMoneyKES(cs.variance||0)}</td><td>${cs.status}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  content.innerHTML = html;
}

function kpi(label, value, change, color = 'var(--blue)') {
  return `<div class="kpi-card"><span>${label}</span><b style="color:${color}">${value}</b>${change ? `<small style="color:${changeColor(change)}">${change}</small>` : ''}</div>`;
}

function renderLineChart(data, ...series) {
  if (!data || !data.length) return '<div class="empty"><b>No data</b></div>';
  const maxVal = Math.max(...data.map(d => series.reduce((s, name) => s + (d[name.toLowerCase().replace(/[^a-z]/g,'')] || 0), 0), 0), 1);
  return `<div class="line-chart">${data.slice(0, 30).map(d => { const val = series.reduce((s, name) => s + (d[name.toLowerCase().replace(/[^a-z]/g,'')] || 0), 0); const pct = (val / maxVal * 100).toFixed(1); return `<div class="bar-col" title="${d.date||d.period||''}: ${formatMoneyKES(val)}"><div style="height:${Math.max(4, pct)}%"></div><span>${(d.date||d.period||'').slice(-5)}</span></div>`; }).join('')}</div>`;
}

function renderDonutChart(data) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  if (!total) return '<div class="empty"><b>No data</b></div>';
  const colors = ['var(--blue)', 'var(--green)', 'var(--orange)', 'var(--red)', 'var(--navy)', 'var(--main)'];
  let offset = 0;
  const segments = data.map((d, i) => { const pct = (d.value / total * 100).toFixed(1); const seg = `<div class="donut-seg" style="--start:${offset}%;--end:${offset + parseFloat(pct)}%;background:${colors[i % colors.length]}" title="${d.label}: ${formatMoneyKES(d.value)} (${pct}%)"></div>`; offset += parseFloat(pct); return seg; }).join('');
  return `<div class="donut-chart">${segments}<div class="donut-legend">${data.map((d, i) => `<span class="legend-item"><span class="legend-dot" style="background:${colors[i % colors.length]}"></span>${d.label}: ${formatMoneyKES(d.value)}</span>`).join('')}</div></div>`;
}

function renderHorizontalBarChart(data) {
  if (!data || !data.length) return '<div class="empty"><b>No data</b></div>';
  const maxVal = Math.max(...data.map(d => d.value || 0), 1);
  return `<div class="h-bar-chart">${data.map(d => `<div class="h-bar-row"><span class="h-bar-label">${d.label||''}</span><div class="h-bar-track"><div class="h-bar-fill" style="width:${(d.value/maxVal*100).toFixed(1)}%"></div></div><span class="h-bar-value">${formatMoneyKES(d.value)}</span></div>`).join('')}</div>`;
}

function renderLaundryBoard(s) {
  const stages = ['Received','Sorting','Washing','Drying','Ironing','Folding','Quality Check','Ready'];
  const orders = s.laundryOrders || [];
  if (!orders.length) return '<div class="empty"><b>No active laundry</b></div>';
  return stages.map(stage => { const stageOrders = orders.filter(o => o.status === stage); return `<div class="laundry-stage"><h4>${stage} (${stageOrders.length})</h4>${stageOrders.map(o => `<div class="card" style="cursor:pointer;padding:8px;margin-bottom:8px;" data-id="${o.id}"><b>${o.order_number||'Order'}</b><br><small>${o.customer_name||'Customer'} · ${formatMoneyKES(o.total)}</small></div>`).join('')}</div>`; }).join('');
}

function exportReportCSV(s) {
  const r = s.reportData || {};
  const rows = [['Metric','Value']];
  rows.push(['Gross Sales', r.gross_sales||0]);
  rows.push(['Total Paid', r.total_paid||0]);
  rows.push(['Outstanding', r.outstanding||0]);
  rows.push(['Avg Order', r.avg_order||0]);
  rows.push(['Unique Customers', r.unique_customers||0]);
  rows.push(['Cash Sales', r.cash_sales||0]);
  rows.push(['M-Pesa Sales', r.mpesa_sales||0]);
  rows.push(['Card Sales', r.card_sales||0]);
  rows.push(['Cancelled Orders', r.cancelled_orders||0]);
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `reports_${s.dateFrom}_${s.dateTo}.csv`; a.click();
  toast('CSV exported');
}

function exportReportPDF(s) {
  const r = s.reportData || {};
  const content = `
    <html><head><title>Reports & Analytics</title><style>
      body { font-family: sans-serif; padding: 20px; color: #172033; }
      h1 { color: #0d2d78; border-bottom: 3px solid #0d2d78; padding-bottom: 8px; }
      h2 { color: #12388f; margin-top: 24px; }
      table { border-collapse: collapse; width: 100%; margin-top: 12px; }
      th, td { border: 2px solid #172033; padding: 8px; text-align: left; }
      th { background: #eaf2ff; }
      .kpi { display: inline-block; margin: 8px; padding: 12px; border: 2px solid #172033; border-radius: 5px; }
      .kpi b { font-size: 20px; color: #12388f; }
      .footer { margin-top: 24px; font-size: 11px; color: #778198; }
    </style></head><body>
    <h1>Open Doors Laundromat</h1><h2>Business Reports</h2>
    <p>Date Range: ${s.dateFrom} to ${s.dateTo}</p>
    <p>Generated: ${new Date().toLocaleString()}</p>
    <h3>Summary</h3>
    <div class="kpi"><span>Gross Sales</span><b>${formatMoneyKES(r.gross_sales||0)}</b></div>
    <div class="kpi"><span>Orders</span><b>${r.total_orders||0}</b></div>
    <div class="kpi"><span>Avg Order</span><b>${formatMoneyKES(r.avg_order||0)}</b></div>
    <div class="kpi"><span>Paid</span><b>${formatMoneyKES(r.total_paid||0)}</b></div>
    <div class="kpi"><span>Outstanding</span><b>${formatMoneyKES(r.outstanding||0)}</b></div>
    <h3>Sales by Day</h3>
    <table><thead><tr><th>Date</th><th>Orders</th><th>Revenue</th></tr></thead><tbody>
    ${(s.reportByDay||[]).slice(0,30).map(d => `<tr><td>${d.date}</td><td>${d.orders||0}</td><td>${formatMoneyKES(d.revenue||0)}</td></tr>`).join('')}
    </tbody></table>
    <div class="footer">Generated by Open Doors POS · ${new Date().toISOString()}</div>
    </body></html>`;
  const blob = new Blob([content], {type:'text/html'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `reports_${s.dateFrom}_${s.dateTo}.html`; a.click();
  toast('PDF exported (HTML format)');
}

async function renderLaundry(s) {
  s.laundrySearch = s.laundrySearch || '';
  s.laundryStatusFilter = s.laundryStatusFilter || '';
  s.laundryPriorityFilter = s.laundryPriorityFilter || '';
  s.laundryFulfilmentFilter = s.laundryFulfilmentFilter || '';
  s.laundryPaymentFilter = s.laundryPaymentFilter || '';
  s.laundryDateFilter = s.laundryDateFilter || 'all';
  s.laundryShowOverdue = s.laundryShowOverdue || false;

  let orders = [];
  try { orders = await api.getLaundry(); } catch { orders = await db.orders.toArray(); }
  if (!orders) orders = [];

  let filtered = orders;
  if (s.laundrySearch) {
    const q = s.laundrySearch.toLowerCase();
    filtered = filtered.filter(o =>
      (o.order_number||'').toLowerCase().includes(q) ||
      (o.customer_name||'').toLowerCase().includes(q) ||
      (o.customer_phone||'').includes(q) ||
      (o.notes||'').toLowerCase().includes(q)
    );
  }
  if (s.laundryStatusFilter) filtered = filtered.filter(o => o.status === s.laundryStatusFilter);
  if (s.laundryPriorityFilter) filtered = filtered.filter(o => o.turnaround === s.laundryPriorityFilter);
  if (s.laundryFulfilmentFilter) filtered = filtered.filter(o => o.fulfilment === s.laundryFulfilmentFilter);
  if (s.laundryPaymentFilter) filtered = filtered.filter(o => o.payment_status === s.laundryPaymentFilter);
  if (s.laundryShowOverdue) {
    const now = Math.floor(Date.now() / 1000);
    filtered = filtered.filter(o => o.due_date && o.due_date < now && !['Collected','Cancelled'].includes(o.status));
  }
  if (s.laundryDateFilter && s.laundryDateFilter !== 'all') {
    const now = Math.floor(Date.now() / 1000);
    let cutoff;
    if (s.laundryDateFilter === 'today') cutoff = Math.floor(new Date().setHours(0,0,0,0) / 1000);
    else if (s.laundryDateFilter === 'yesterday') { const d = new Date(); d.setDate(d.getDate()-1); cutoff = Math.floor(d.setHours(0,0,0,0) / 1000); }
    else if (s.laundryDateFilter === '7d') cutoff = now - 7*86400;
    else if (s.laundryDateFilter === '30d') cutoff = now - 30*86400;
    else cutoff = 0;
    filtered = filtered.filter(o => (o.created_at||0) >= cutoff);
  }

  const stages = ['Received','Sorting','Washing','Drying','Ironing','Folding','Quality Check','Ready'];
  const awaitingWash = filtered.filter(o => ['Received','Sorting'].includes(o.status));
  const beingWashed = filtered.filter(o => ['Washing','Drying','Ironing','Folding'].includes(o.status));
  const washingComplete = filtered.filter(o => o.status === 'Quality Check');
  const ready = filtered.filter(o => o.status === 'Ready');
  const collected = filtered.filter(o => o.status === 'Collected');
  const cancelled = filtered.filter(o => o.status === 'Cancelled');
  const overdue = filtered.filter(o => o.due_date && o.due_date < Math.floor(Date.now()/1000) && !['Collected','Cancelled'].includes(o.status));
  const express = filtered.filter(o => o.turnaround === 'Express' && !['Collected','Cancelled'].includes(o.status));

  s.laundryData = { awaitingWash, beingWashed, washingComplete, ready, collected, cancelled, overdue, express, all: filtered };

  const view = document.querySelector('#view');
  if (!view) return;
  view.innerHTML = `<header class="topbar"><div><h1>Laundry Operations</h1><p>Track laundry from received to ready for collection.</p></div><div class="top-actions"><button class="secondary compact" id="laundry-export" aria-label="Export">Export CSV</button><button class="primary compact" id="laundry-refresh" aria-label="Refresh">↻ Refresh</button></div></header><section class="page"><div class="laundry-filters"><div class="search-row"><input id="laundry-search" placeholder="Search orders, customers, services…" value="${s.laundrySearch}" aria-label="Search laundry"></div><select id="laundry-status-filter" aria-label="Filter by status"><option value="">All Status</option><option value="Received">Received</option><option value="Sorting">Sorting</option><option value="Washing">Washing</option><option value="Drying">Drying</option><option value="Ironing">Ironing</option><option value="Folding">Folding</option><option value="Quality Check">Quality Check</option><option value="Ready">Ready</option><option value="Collected">Collected</option><option value="Cancelled">Cancelled</option></select><select id="laundry-priority-filter" aria-label="Filter by priority"><option value="">All Priority</option><option value="Express">Express</option><option value="Normal">Normal</option></select><select id="laundry-fulfilment-filter" aria-label="Filter by fulfilment"><option value="">All Fulfilment</option><option value="collection">Collection</option><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select><select id="laundry-payment-filter" aria-label="Filter by payment"><option value="">All Payments</option><option value="paid">Paid</option><option value="partial">Partial</option><option value="pending">Unpaid</option></select><select id="laundry-date-filter" aria-label="Filter by date"><option value="all">All Time</option><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="7d">Last 7 Days</option><option value="30d">Last 30 Days</option></select><label style="font-size:12px;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="laundry-overdue" ${s.laundryShowOverdue?'checked':''}> Overdue Only</label><button class="btn-sm secondary" id="laundry-reset-filters" aria-label="Reset filters">Reset</button></div><div class="laundry-kpis">${kpi('Awaiting Wash', awaitingWash.length,'','var(--orange)')}${kpi('Being Washed', beingWashed.length,'','var(--blue)')}${kpi('Washing Done', washingComplete.length,'','var(--navy)')}${kpi('Ready', ready.length,'','var(--green)')}${kpi('Overdue', overdue.length,'','var(--red)')}${kpi('Express', express.length,'','var(--main)')}${kpi('Collected', collected.length,'','var(--muted)')}${kpi('Cancelled', cancelled.length,'','var(--red)')}</div><div class="laundry-tabs">${tabBtn('board','Board')}${tabBtn('awaiting','Awaiting')}${tabBtn('washing','Being Washed')}${tabBtn('ready','Ready')}${tabBtn('collected','Collected')}</div><div id="laundry-content"></div></section>`;
  document.querySelector('#laundry-search')?.addEventListener('input', (e) => { s.laundrySearch = e.target.value; renderLaundry(s); });
  document.querySelector('#laundry-status-filter')?.addEventListener('change', (e) => { s.laundryStatusFilter = e.target.value; renderLaundry(s); });
  document.querySelector('#laundry-priority-filter')?.addEventListener('change', (e) => { s.laundryPriorityFilter = e.target.value; renderLaundry(s); });
  document.querySelector('#laundry-fulfilment-filter')?.addEventListener('change', (e) => { s.laundryFulfilmentFilter = e.target.value; renderLaundry(s); });
  document.querySelector('#laundry-payment-filter')?.addEventListener('change', (e) => { s.laundryPaymentFilter = e.target.value; renderLaundry(s); });
  document.querySelector('#laundry-date-filter')?.addEventListener('change', (e) => { s.laundryDateFilter = e.target.value; renderLaundry(s); });
  document.querySelector('#laundry-overdue')?.addEventListener('change', (e) => { s.laundryShowOverdue = e.target.checked; renderLaundry(s); });
  document.querySelector('#laundry-reset-filters')?.addEventListener('click', () => { s.laundrySearch=''; s.laundryStatusFilter=''; s.laundryPriorityFilter=''; s.laundryFulfilmentFilter=''; s.laundryPaymentFilter=''; s.laundryDateFilter='all'; s.laundryShowOverdue=false; renderLaundry(s); });
  document.querySelector('#laundry-refresh')?.addEventListener('click', () => renderLaundry(s));
  document.querySelector('#laundry-export')?.addEventListener('click', () => { const csv='Order,Customer,Service,Total,Status,Turnaround,Fulfilment\n'+(filtered||[]).map(o=>`${o.order_number||''},${o.customer_name||''},${o.notes||''},${o.total||0},${o.status||''},${o.turnaround||''},${o.fulfilment||''}`).join('\n'); const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='laundry.csv'; a.click(); toast('CSV exported'); });
  document.querySelectorAll('.laundry-tab').forEach(btn => { btn.addEventListener('click', () => { s.laundryTab = btn.dataset.tab; renderLaundry(s); }); });
  renderLaundryContent(s);
}

function renderLaundryContent(s) {
  const content = document.querySelector('#laundry-content');
  if (!content) return;
  const data = s.laundryData || { awaitingWash:[], beingWashed:[], washingComplete:[], ready:[], collected:[], cancelled:[], overdue:[], express:[], all:[] };
  const tab = s.laundryTab || 'board';

  if (tab === 'board') {
    html = `<div class="laundry-board">${renderLaundryStage('Awaiting Wash', data.awaitingWash, 'Received', s)}${renderLaundryStage('Being Washed', data.beingWashed, 'Washing', s)}${renderLaundryStage('Washing Done', data.washingComplete, 'Quality Check', s)}${renderLaundryStage('Ready', data.ready, 'Ready', s)}${renderLaundryStage('Collected', data.collected, 'Collected', s)}</div>`;
  } else if (tab === 'awaiting') {
    html = `<div class="laundry-list">${data.awaitingWash.length ? data.awaitingWash.map(o => laundryCard(o, s)).join('') : '<div class="laundry-empty"><b>No laundry awaiting wash</b></div>'}</div>`;
  } else if (tab === 'washing') {
    html = `<div class="laundry-list">${data.beingWashed.length ? data.beingWashed.map(o => laundryCard(o, s)).join('') : '<div class="laundry-empty"><b>Nothing being washed</b></div>'}</div>`;
  } else if (tab === 'ready') {
    html = `<div class="laundry-list">${data.ready.length ? data.ready.map(o => laundryCard(o, s)).join('') : '<div class="laundry-empty"><b>No laundry ready</b></div>'}</div>`;
  } else {
    html = `<div class="laundry-list">${data.collected.length ? data.collected.map(o => laundryCard(o, s)).join('') : '<div class="laundry-empty"><b>No collected laundry</b></div>'}</div>`;
  }
  content.innerHTML = html;

  content.querySelectorAll('.start-wash').forEach(btn => { btn.addEventListener('click', async () => { const id = btn.dataset.id; try { await api.updateOrderStatus(id, 'Washing'); toast('→ Washing'); } catch(e) { toast('Error: '+e.message, 'error'); } renderLaundry(s); }); });
  content.querySelectorAll('.complete-wash').forEach(btn => { btn.addEventListener('click', async () => { const id = btn.dataset.id; try { await api.updateOrderStatus(id, 'Quality Check'); toast('→ Washing Complete'); } catch(e) { toast('Error: '+e.message, 'error'); } renderLaundry(s); }); });
  content.querySelectorAll('.mark-ready').forEach(btn => { btn.addEventListener('click', async () => { const id = btn.dataset.id; try { await api.updateOrderStatus(id, 'Ready'); toast('→ Ready for collection'); } catch(e) { toast('Error: '+e.message, 'error'); } renderLaundry(s); }); });
  content.querySelectorAll('.mark-collected').forEach(btn => { btn.addEventListener('click', async () => { const id = btn.dataset.id; try { await api.updateOrderStatus(id, 'Collected'); toast('→ Collected'); } catch(e) { toast('Error: '+e.message, 'error'); } renderLaundry(s); }); });
  content.querySelectorAll('.notify-customer').forEach(btn => { btn.addEventListener('click', () => { const id = btn.dataset.id; const order = data.ready.find(o => String(o.id) === id) || data.all.find(o => String(o.id) === id); if (order) showNotifyModal(s, order); }); });
  content.querySelectorAll('.laundry-card').forEach(card => { card.addEventListener('click', async (e) => { if (e.target.closest('button')) return; const id = card.dataset.id; const order = data.all.find(o => String(o.id) === id); if (order) showOrderDetail(s, order); }); });
}

function renderLaundryStage(title, orders, statusKey, s) {
  return `<div class="laundry-stage"><h3>${title} <small>(${orders.length})</small></h3>${orders.slice(0, 10).map(o => `<div class="laundry-card" data-id="${o.id}" tabindex="0" role="button" aria-label="Order ${o.order_number}"><div style="display:flex;justify-content:space-between;align-items:center;"><b>${o.order_number||'—'}</b><span class="status ${o.status}">${o.status}</span></div><div style="font-size:13px;color:var(--muted);margin-top:4px;">${o.customer_name||'Customer'} · ${o.customer_phone||''}</div><div style="font-size:13px;margin-top:4px;">${o.notes||'—'} · ${o.turnaround||'Normal'}</div><div style="font-size:12px;color:var(--muted);margin-top:4px;">Due: ${o.due_date ? new Date(o.due_date*1000).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'}) : '—'}</div><div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap;">${statusKey === 'Received' ? `<button class="btn-sm secondary start-wash" data-id="${o.id}">Start Wash</button>` : ''}${statusKey === 'Washing' ? `<button class="btn-sm secondary complete-wash" data-id="${o.id}">Complete</button>` : ''}${statusKey === 'Quality Check' ? `<button class="btn-sm primary mark-ready" data-id="${o.id}">Mark Ready</button>` : ''}${statusKey === 'Ready' ? `<button class="btn-sm secondary notify-customer" data-id="${o.id}">Notify</button><button class="btn-sm secondary mark-collected" data-id="${o.id}">Collected</button>` : ''}</div></div>`).join('')}${orders.length > 10 ? `<small style="text-align:center;color:var(--muted);">+${orders.length - 10} more</small>` : ''}</div>`;
}

function laundryCard(o, s) {
  const isOverdue = o.due_date && o.due_date < Math.floor(Date.now()/1000) && !['Collected','Cancelled'].includes(o.status);
  return `<div class="laundry-card" data-id="${o.id}" tabindex="0" role="button" aria-label="Order ${o.order_number}"><div style="display:flex;justify-content:space-between;align-items:center;"><b>${o.order_number||'—'}</b><span class="status ${o.status}">${o.status}</span></div><div style="font-size:13px;color:var(--muted);margin-top:4px;">${o.customer_name||'Customer'} · ${o.customer_phone||''}</div><div style="font-size:13px;margin-top:4px;">${o.notes||'—'} · ${o.turnaround||'Normal'}</div><div style="font-size:12px;color:var(--muted);margin-top:4px;">Due: ${o.due_date ? new Date(o.due_date*1000).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'}) : '—'}</div>${isOverdue ? '<div style="color:var(--red);font-weight:600;font-size:12px;">OVERDUE</div>' : ''}<div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap;">${['Received','Sorting'].includes(o.status) ? `<button class="btn-sm secondary start-wash" data-id="${o.id}">Start Wash</button>` : ''}${['Washing','Drying','Ironing','Folding'].includes(o.status) ? `<button class="btn-sm secondary complete-wash" data-id="${o.id}">Complete</button>` : ''}${o.status === 'Quality Check' ? `<button class="btn-sm primary mark-ready" data-id="${o.id}">Mark Ready</button>` : ''}${o.status === 'Ready' ? `<button class="btn-sm secondary notify-customer" data-id="${o.id}">Notify</button><button class="btn-sm secondary mark-collected" data-id="${o.id}">Collected</button>` : ''}</div></div>`;
}

function showNotifyModal(s, order) {
  const customer = order.customer_name || 'Customer';
  const phone = order.customer_phone || '';
  const email = order.customer_email || '';
  const hasPhone = phone && phone.length >= 9;
  const hasEmail = email && email.includes('@');
  showModal(`<div class="modal" style="max-width:440px;"><div class="modal-head"><span class="eyebrow">NOTIFY</span><h2>Notify Customer</h2><button data-close aria-label="Close">×</button></div><div class="modal-body"><p style="margin-bottom:12px;"><b>${customer}</b><br><small>${order.order_number||''}</small></p><div style="margin-bottom:12px;"><label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="notify-sms" ${hasPhone?'checked':''} ${!hasPhone?'disabled':''}> SMS ${hasPhone?phone:'(no phone)'}</label><label style="display:flex;align-items:center;gap:8px;margin-top:8px;"><input type="checkbox" id="notify-email" ${hasEmail?'checked':''} ${!hasEmail?'disabled':''}> Email ${hasEmail?email:'(no email)'}</label></div><div id="notify-status" style="font-size:13px;margin-bottom:8px;"></div><button class="primary" id="send-notification" ${!hasPhone&&!hasEmail?'disabled':''} style="width:100%;">Send Notification</button></div></div>`);
  document.querySelector('#send-notification')?.addEventListener('click', async () => { const sendSMS = document.querySelector('#notify-sms')?.checked; const sendEmail = document.querySelector('#notify-email')?.checked; const statusEl = document.querySelector('#notify-status'); if (!sendSMS && !sendEmail) { toast('Select at least one channel', 'error'); return; } if (statusEl) statusEl.innerHTML = '<span class="spinner"></span> Sending…'; try { if (sendSMS) { await api.notifyCustomer({ order_id: order.id, channel: 'sms', message: `Hello ${customer}, your laundry order #${order.order_number} is ready for collection at Open Doors Laundromat. Amount due: ${formatMoneyKES(order.balance||0)}. Thank you for choosing Open Doors.` }); if (statusEl) statusEl.innerHTML += '<div style="color:var(--green);">✓ SMS sent</div>'; } if (sendEmail) { await api.notifyCustomer({ order_id: order.id, channel: 'email', message: `Your laundry order #${order.order_number} is ready for collection at Open Doors Laundromat. Amount due: ${formatMoneyKES(order.balance||0)}. Thank you for choosing Open Doors.` }); if (statusEl) statusEl.innerHTML += '<div style="color:var(--green);">✓ Email sent</div>'; } toast('Notification sent'); } catch(e) { if (statusEl) statusEl.innerHTML += `<div style="color:var(--red);">✗ Failed: ${e.message}</div>`; toast('Notification failed: '+e.message, 'error'); } });
}

async function renderSettings(s) {
  let settings;
  let syncStatus = { pending: 0, failed: 0, lastSync: null };
  let hardwareStatus = { printer: { connected: false, type: 'browser' }, cashDrawer: { connected: false }, barcodeScanner: { connected: false }, scale: { connected: false } };
  let mpesaStatus = { enabled: false, environment: 'sandbox', configured: false };
  try { settings = await api.getSettings(); } catch { settings = s.settings || {}; }
  try { syncStatus = await api.getSyncStatus(); } catch {}
  try { hardwareStatus = await api.getHardwareStatus(); } catch {}
  try { mpesaStatus = await api.getMPesaStatus(); } catch {}

  const sections = ['general','appearance','business','pos','laundry','payments','receipts','notifications','offline','system'];
  const sectionLabels = { general:'General', appearance:'Appearance', business:'Business', pos:'POS', laundry:'Laundry', payments:'Payments', receipts:'Receipts', notifications:'Notifications', offline:'Offline & Sync', system:'System' };
  const activeSection = s.settingsSection || 'general';

  const view = document.querySelector('#view');
  if (!view) return;

  view.innerHTML = `<header class="topbar"><div><h1>Settings</h1><p>System configuration</p></div><div class="top-actions"><span class="connection-status ${s.online?'online':'offline'}" id="settings-connection">${s.online?'🟢 Online':'🔴 Offline'}</span></div></header><section class="page"><div class="settings-layout"><nav class="settings-nav" id="settings-nav">${sections.map(k => `<button class="settings-nav-btn ${activeSection===k?'active':''}" data-section="${k}" aria-label="${sectionLabels[k]}">${sectionLabels[k]}</button>`).join('')}</nav><div class="settings-content" id="settings-content">${renderSettingsSection(activeSection, settings, syncStatus, hardwareStatus, mpesaStatus, s)}</div></div></section>`;

  document.querySelectorAll('.settings-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => { s.settingsSection = btn.dataset.section; renderSettings(s); });
  });

  attachSettingsHandlers(activeSection, s);
}

function renderSettingsSection(section, settings, syncStatus, hardwareStatus, mpesaStatus, s) {
  switch(section) {
    case 'general': return renderGeneralSettings(settings, s);
    case 'appearance': return renderAppearanceSettings(settings, s);
    case 'business': return renderBusinessSettings(settings, s);
    case 'pos': return renderPOSSettings(settings, s);
    case 'laundry': return renderLaundrySettings(settings, s);
    case 'payments': return renderPaymentSettings(settings, mpesaStatus, s);
    case 'receipts': return renderReceiptSettings(settings, s);
    case 'notifications': return renderNotificationSettings(settings, s);
    case 'offline': return renderOfflineSettings(syncStatus, s);
    case 'system': return renderSystemSettings(syncStatus, hardwareStatus, mpesaStatus, s);
    default: return renderGeneralSettings(settings, s);
  }
}

function renderGeneralSettings(settings, s) {
  return `<div class="settings-panel"><h3>General</h3><form class="settings-form" data-section="general"><label><span>Business Name</span><input name="business_name" value="${esc(settings.business_name||s.settings?.business_name||'')}" aria-label="Business Name"></label><label><span>Branch Code</span><select name="branch_code" aria-label="Branch Code"><option ${settings.branch_code==='OD-KIT'||s.settings?.branch_code==='OD-KIT'?'selected':''}>OD-KIT</option><option ${settings.branch_code==='OD-ATHI'||s.settings?.branch_code==='OD-ATHI'?'selected':''}>OD-ATHI</option><option ${settings.branch_code==='OD-KIS'||s.settings?.branch_code==='OD-KIS'?'selected':''}>OD-KIS</option><option ${settings.branch_code==='OD-ISA'||s.settings?.branch_code==='OD-ISA'?'selected':''}>OD-ISA</option></select></label><label><span>Currency</span><input name="currency" value="${esc(settings.currency||'KES')}" aria-label="Currency" readonly></label><label><span>Tax Rate (%)</span><input name="tax_rate" type="number" value="${settings.tax_rate||s.settings?.tax_rate||0}" aria-label="Tax Rate"></label><button class="primary" type="submit">Save Changes</button></form><div class="settings-status" id="settings-status-general"></div></div>`;
}

function renderAppearanceSettings(settings, s) {
  const darkMode = settings.dark_mode || s.settings?.dark_mode || 'system';
  return `<div class="settings-panel"><h3>Appearance</h3><form class="settings-form" data-section="appearance"><label><span>Theme</span><select name="dark_mode" aria-label="Theme"><option value="light" ${darkMode==='light'?'selected':''}>Light</option><option value="dark" ${darkMode==='dark'?'selected':''}>Dark</option><option value="system" ${darkMode==='system'?'selected':''}>System</option></select></label><button class="primary" type="submit">Save Changes</button></form><div class="settings-status" id="settings-status-appearance"></div></div>`;
}

function renderBusinessSettings(settings, s) {
  return `<div class="settings-panel"><h3>Business Information</h3><form class="settings-form" data-section="business"><label><span>Business Name</span><input name="business_name" value="${esc(settings.business_name||s.settings?.business_name||'')}" aria-label="Business Name"></label><label><span>Business Phone</span><input name="business_phone" value="${esc(settings.business_phone||'')}" aria-label="Business Phone"></label><label><span>Business Email</span><input name="business_email" value="${esc(settings.business_email||'')}" aria-label="Business Email"></label><label><span>Business Address</span><textarea name="business_address" rows="2" aria-label="Business Address">${esc(settings.business_address||'')}</textarea></label><label><span>Website</span><input name="website" value="${esc(settings.website||'')}" aria-label="Website"></label><button class="primary" type="submit">Save Changes</button></form><div class="settings-status" id="settings-status-business"></div></div>`;
}

function renderPOSSettings(settings, s) {
  return `<div class="settings-panel"><h3>POS Configuration</h3><form class="settings-form" data-section="pos"><label><span>Express Surcharge (%)</span><input name="express_surcharge_percent" type="number" value="${settings.express_surcharge_percent||s.settings?.express_surcharge_percent||30}" aria-label="Express Surcharge"></label><label><span>Normal Turnaround (hrs)</span><input name="normal_turnaround_hours" type="number" value="${settings.normal_turnaround_hours||s.settings?.normal_turnaround_hours||24}" aria-label="Normal Turnaround"></label><label><span>Express Turnaround (hrs)</span><input name="express_turnaround_hours" type="number" value="${settings.express_turnaround_hours||s.settings?.express_turnaround_hours||4}" aria-label="Express Turnaround"></label><label><span>Tax Mode</span><select name="tax_mode" aria-label="Tax Mode"><option value="inclusive" ${settings.tax_mode==='inclusive'?'selected':''}>Inclusive</option><option value="exclusive" ${settings.tax_mode==='exclusive'?'selected':''}>Exclusive</option></select></label><button class="primary" type="submit">Save Changes</button></form><div class="settings-status" id="settings-status-pos"></div></div>`;
}

function renderLaundrySettings(settings, s) {
  return `<div class="settings-panel"><h3>Laundry Configuration</h3><form class="settings-form" data-section="laundry"><label><span>Workflow Stages</span><textarea name="workflow_stages" rows="2" aria-label="Workflow Stages">${esc(settings.workflow_stages||'')}</textarea></label><label><span>Normal Turnaround (hrs)</span><input name="normal_turnaround_hours" type="number" value="${settings.normal_turnaround_hours||s.settings?.normal_turnaround_hours||24}" aria-label="Normal Turnaround"></label><label><span>Express Turnaround (hrs)</span><input name="express_turnaround_hours" type="number" value="${settings.express_turnaround_hours||s.settings?.express_turnaround_hours||4}" aria-label="Express Turnaround"></label><button class="primary" type="submit">Save Changes</button></form><div class="settings-status" id="settings-status-laundry"></div></div>`;
}

function renderPaymentSettings(settings, mpesaStatus, s) {
  return `<div class="settings-panel"><h3>Payment Methods</h3><div class="settings-grid"><div class="setting-item"><span>M-Pesa Integration</span><span class="status ${mpesaStatus.configured?'connected':'not-configured'}">${mpesaStatus.configured?'Connected':'Not configured'}</span></div><div class="setting-item"><span>M-Pesa Environment</span><span class="status">${mpesaStatus.environment||'sandbox'}</span></div><div class="setting-item"><span>Cash Payments</span><span class="status connected">Enabled</span></div></div><form class="settings-form" data-section="payments" style="margin-top:16px;"><label><span>M-Pesa Environment</span><select name="mpesa_environment" aria-label="M-Pesa Environment"><option value="sandbox" ${settings.mpesa_environment==='sandbox'?'selected':''}>Sandbox</option><option value="production" ${settings.mpesa_environment==='production'?'selected':''}>Production</option></select></label><button class="primary" type="submit">Save Changes</button></form><div class="settings-status" id="settings-status-payments"></div></div>`;
}

function renderReceiptSettings(settings, s) {
  return `<div class="settings-panel"><h3>Receipt Configuration</h3><form class="settings-form" data-section="receipts"><label><span>Receipt Format</span><select name="receipt_format" aria-label="Receipt Format"><option value="thermal_80mm" ${settings.receipt_format==='thermal_80mm'?'selected':''}>80mm Thermal</option><option value="thermal_58mm" ${settings.receipt_format==='thermal_58mm'?'selected':''}>58mm Thermal</option><option value="a4" ${settings.receipt_format==='a4'?'selected':''}>A4</option></select></label><label><span>Auto Print</span><select name="auto_print" aria-label="Auto Print"><option value="true" ${settings.auto_print==='true'?'selected':''}>Enabled</option><option value="false" ${settings.auto_print==='false'?'selected':''}>Disabled</option></select></label><button class="primary" type="submit">Save Changes</button></form><div class="settings-status" id="settings-status-receipts"></div></div>`;
}

function renderNotificationSettings(settings, s) {
  return `<div class="settings-panel"><h3>Notification Configuration</h3><form class="settings-form" data-section="notifications"><div class="setting-item"><span>SMS Provider</span><span class="status ${settings.sms_provider?'connected':'not-configured'}">${settings.sms_provider?'Configured':'Not configured'}</span></div><div class="setting-item"><span>Email Provider</span><span class="status ${settings.email_provider?'connected':'not-configured'}">${settings.email_provider?'Configured':'Not configured'}</span></div><div class="setting-item"><span>Notifications Enabled</span><span class="status ${settings.notification_enabled==='true'?'connected':'not-configured'}">${settings.notification_enabled==='true'?'Enabled':'Disabled'}</span></div><label><span>Notification Enabled</span><select name="notification_enabled" aria-label="Notification Enabled"><option value="true" ${settings.notification_enabled==='true'?'selected':''}>Enabled</option><option value="false" ${settings.notification_enabled==='false'?'selected':''}>Disabled</option></select></label><button class="primary" type="submit">Save Changes</button></form><div class="settings-status" id="settings-status-notifications"></div></div>`;
}

function renderOfflineSettings(syncStatus, s) {
  return `<div class="settings-panel"><h3>Offline & Sync</h3><div class="settings-grid"><div class="setting-item"><span>Sync Status</span><span class="status ${syncStatus.failed>0?'not-configured':'connected'}">${syncStatus.failed>0?'Errors':'Healthy'}</span></div><div class="setting-item"><span>Pending Changes</span><span class="status">${syncStatus.pending}</span></div><div class="setting-item"><span>Failed Operations</span><span class="status ${syncStatus.failed>0?'not-configured':''}">${syncStatus.failed}</span></div><div class="setting-item"><span>Last Sync</span><span class="status">${syncStatus.lastSync?new Date(parseInt(syncStatus.lastSync)).toLocaleString():'Never'}</span></div></div><div style="display:flex;gap:8px;margin-top:16px;"><button class="primary" id="sync-now-btn">Sync Now</button><button class="btn-secondary" id="retry-failed-btn">Retry Failed</button></div><div class="settings-status" id="settings-status-offline"></div></div>`;
}

function renderSystemSettings(syncStatus, hardwareStatus, mpesaStatus, s) {
  return `<div class="settings-panel"><h3>System Status</h3><div class="settings-grid"><div class="setting-item"><span>API Status</span><span class="status connected">Online</span></div><div class="setting-item"><span>Database</span><span class="status connected">PostgreSQL</span></div><div class="setting-item"><span>Offline Database</span><span class="status connected">IndexedDB</span></div><div class="setting-item"><span>Sync Queue</span><span class="status">${syncStatus.pending} pending</span></div><div class="setting-item"><span>M-Pesa</span><span class="status ${mpesaStatus.configured?'connected':'not-configured'}">${mpesaStatus.configured?'Connected':'Not configured'}</span></div><div class="setting-item"><span>Printer</span><span class="status ${hardwareStatus.printer?.connected?'connected':'not-configured'}">${hardwareStatus.printer?.connected?'Connected':'Not configured'}</span></div><div class="setting-item"><span>Cash Drawer</span><span class="status ${hardwareStatus.cashDrawer?.connected?'connected':'not-configured'}">${hardwareStatus.cashDrawer?.connected?'Connected':'Not configured'}</span></div><div class="setting-item"><span>Barcode Scanner</span><span class="status ${hardwareStatus.barcodeScanner?.connected?'connected':'not-configured'}">${hardwareStatus.barcodeScanner?.connected?'Connected':'Not configured'}</span></div></div><div class="settings-status" id="settings-status-system"></div></div>`;
}

function attachSettingsHandlers(section, s) {
  const form = document.querySelector(`.settings-form[data-section="${section}"]`);
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {};
      fd.forEach((v,k) => { data[k] = v; });
      const statusEl = document.querySelector(`#settings-status-${section}`);
      if (statusEl) statusEl.innerHTML = '<span class="status saving">Saving...</span>';
      try {
        await api.updateSettings(data);
        if (statusEl) statusEl.innerHTML = '<span class="status connected">Saved</span>';
        s.settings = { ...s.settings, ...data };
        if (section === 'appearance' && data.dark_mode) {
          applyTheme(data.dark_mode);
          localStorage.setItem('od-theme', data.dark_mode);
        }
        setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 3000);
      } catch(err) {
        if (statusEl) statusEl.innerHTML = `<span class="status not-configured">Error: ${err.message}</span>`;
      }
    });
  }
  const syncBtn = document.getElementById('sync-now-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      const statusEl = document.querySelector('#settings-status-offline');
      if (statusEl) statusEl.innerHTML = '<span class="status saving">Syncing...</span>';
      try {
        const result = await api.syncOperations([]);
        if (statusEl) statusEl.innerHTML = `<span class="status connected">Sync complete</span>`;
      } catch(err) {
        if (statusEl) statusEl.innerHTML = `<span class="status not-configured">Sync failed: ${err.message}</span>`;
      }
    });
  }
  const retryBtn = document.getElementById('retry-failed-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', async () => {
      const statusEl = document.querySelector('#settings-status-offline');
      if (statusEl) statusEl.innerHTML = '<span class="status saving">Retrying...</span>';
      try {
        const result = await api.syncOperations([]);
        if (statusEl) statusEl.innerHTML = `<span class="status connected">Retry complete</span>`;
      } catch(err) {
        if (statusEl) statusEl.innerHTML = `<span class="status not-configured">Retry failed: ${err.message}</span>`;
      }
    });
  }
}

function applyTheme(theme) {
  if (theme === 'dark') document.body.classList.add('dark');
  else if (theme === 'light') document.body.classList.remove('dark');
  else if (theme === 'system') {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.body.classList.add('dark');
    else document.body.classList.remove('dark');
  }
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showReceiptModal(receipt) {
  showModal(`<div class="modal" style="max-width:420px;"><div class="modal-head"><span class="eyebrow">RECEIPT</span><h2>${receipt.order_number}</h2><button data-close aria-label="Close">×</button></div><div class="modal-body"><div class="receipt"><div class="receipt-brand"><h1>${receipt.business}</h1><small>${receipt.address}</small><br><small>${receipt.phone}</small></div><div class="receipt-line"><span>Order</span><span>${receipt.order_number}</span></div><div class="receipt-line"><span>Date</span><span>${new Date(receipt.date).toLocaleString()}</span></div><div class="receipt-line"><span>Customer</span><span>${receipt.customer}</span></div><div class="receipt-line"><span>Status</span><span>${receipt.status}</span></div><div class="receipt-line"><span>Turnaround</span><span>${receipt.turnaround}</span></div><hr style="border-color:var(--border);margin:8px 0;"><h3>Items</h3>${receipt.items.map(i => `<div class="receipt-line"><span>${i.description} × ${i.quantity}</span><span>${formatMoneyKES(i.unit_price * i.quantity)}</span></div>`).join('')}<div class="receipt-line"><span>Subtotal</span><span>${formatMoneyKES(receipt.subtotal)}</span></div>${receipt.discount ? `<div class="receipt-line"><span>Discount</span><span>-${formatMoneyKES(receipt.discount)}</span></div>` : ''}${receipt.surcharge ? `<div class="receipt-line"><span>Surcharge</span><span>+${formatMoneyKES(receipt.surcharge)}</span></div>` : ''}<div class="receipt-totals"><div class="receipt-line total"><span>Total</span><span>${formatMoneyKES(receipt.total)}</span></div><div class="receipt-line"><span>Paid</span><span>${formatMoneyKES(receipt.amount_paid)}</span></div><div class="receipt-line"><span>Balance</span><span>${formatMoneyKES(receipt.balance)}</span></div></div>${receipt.payments.length ? '<hr style="border-color:var(--border);margin:8px 0;"><h3>Payments</h3>'+receipt.payments.map(p => `<div class="receipt-line"><span>${p.method}</span><span>${formatMoneyKES(p.amount)} ${p.reference?'('+p.reference+')':''}</span></div>`).join('') : ''}</div><div class="receipt-actions" style="display:flex;gap:8px;margin-top:16px;"><button class="btn primary" id="print-receipt">Print</button><button class="btn secondary" id="refund-receipt">Refund</button></div></div></div>`);
  document.querySelector('#print-receipt')?.addEventListener('click', () => window.print());
  document.querySelector('#refund-receipt')?.addEventListener('click', async () => { const amount = prompt('Refund amount (KSh):'); if (!amount || amount <= 0) return; const reason = prompt('Reason for refund:'); if (!reason) return; try { await api.refundPayment({ order_id: receipt.order_id || receipt.order_number, amount: moneyToMinorUnits(amount), method: 'Cash', reference: reason }); toast(`Refund of ${formatMoneyKES(moneyToMinorUnits(amount))} processed`); } catch(e) { toast('Error: '+e.message, 'error'); } closeModal(); });
}

export async function renderLogin(message = '') {
  const app = document.querySelector('#app');
  if (!app) return;
  app.innerHTML = `<main class="login-page"><section class="login-visual"><div class="login-brand"><div class="brand-mark"><span></span></div><div><b>OPEN DOORS</b><small>LAUNDROMAT</small></div></div><div class="login-copy"><span>LAUNDRY MANAGEMENT, SIMPLIFIED</span><h1>Welcome back</h1><p>Sign in to open the Open Doors point of sale.</p><div class="login-quote">"So Fresh, So Clean, So You."</div></div></section><section class="login-form-wrap"><form id="login-form" class="login-form"><span class="eyebrow">SECURE ACCESS</span><h2>Welcome back</h2><p>Sign in to open the Open Doors point of sale.</p>${message?`<div class="login-error"><span>!</span>${message}</div>`:''}<label><span>Username</span><div class="login-input"><input name="username" autocomplete="username" required autofocus placeholder="Enter username"></div></label><label><span>Password</span><div class="login-input"><input id="login-password" name="password" type="password" autocomplete="current-password" required placeholder="Enter password"><button type="button" id="show-password" aria-label="Show password">◉</button></div></label><button class="primary login-submit" type="submit" id="login-submit" aria-label="Sign in">Sign in to POS <span>→</span></button></form><footer>© ${new Date().getFullYear()} Open Doors Laundromat · Kitengela</footer></section></main>`;
  document.querySelector('#show-password')?.addEventListener('click', () => { const input = document.querySelector('#login-password'); input.type = input.type === 'password' ? 'text' : 'password'; });
  document.querySelector('#login-form')?.addEventListener('submit', async (e) => { e.preventDefault(); const btn = document.querySelector('#login-submit'); if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; } const fd = new FormData(e.target); const username = fd.get('username').trim(); const password = fd.get('password'); try { const result = await api.login({ username, password }); toast('Signed in successfully'); const user = result.user || result; localStorage.setItem('od_auth_token', result.token); s.user = user; s.view = 'pos'; s.cart = []; s.heldOrders = []; s.settings = {}; s.online = navigator.onLine; s.syncStatus = { pending: 0, failed: 0 }; s.paymentState = 'idle'; s.paymentMethod = 'Cash'; s.turnaround = 'Normal'; s.fulfilment = 'collection'; s.discountType = 'none'; s.discountValue = 0; s.amountPaid = 0; s.mpesaPhone = ''; await restoreCart(s); try { s.settings = await api.getSettings(); } catch {} shell(s); } catch (err) { renderLogin(err.message || 'Invalid credentials'); } finally { if (btn) { btn.disabled = false; btn.innerHTML = 'Sign in to POS <span>→</span>'; } } });
}

function shell(s) {
  renderApp(s);
  renderView(s);
}

let state = {
  view: 'pos',
  user: null,
  cart: [],
  heldOrders: [],
  query: '',
  orders: [],
  services: [],
  customers: [],
  selectedOrder: null,
  online: navigator.onLine,
  syncStatus: { pending: 0, failed: 0 },
  settings: {},
  auth: null,
  loading: false,
  processing: false,
  customer: null,
  discountType: 'none',
  discountValue: 0,
  turnaround: 'Normal',
  fulfilment: 'collection',
  amountPaid: 0,
  paymentMethod: 'Cash',
  paymentState: 'idle',
  mpesaPhone: '',
  holdMode: false,
  page: 1,
  filterStatus: '',
  searchQuery: '',
  customerPage: 1,
  customerSearch: '',
  category: '',
  activeFilter: '',
  dateFrom: '',
  dateTo: '',
  reportData: null,
};

const app = document.querySelector('#app');
const auth = createAuth();

let syncEngine = null;
let syncInterval = null;

async function bootstrap() {
  try {
    const savedTheme = localStorage.getItem('od-theme');
    if (savedTheme === 'dark') document.body.classList.add('dark');
    else if (savedTheme === 'light') document.body.classList.remove('dark');
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.body.classList.add('dark');

    state.settings = await loadSettings();
    state.auth = auth;

    const token = localStorage.getItem('od_auth_token');
    if (token) {
      try {
        const user = await auth.validateToken(token);
        if (user) { state.user = user; shell(state); }
        else { await renderLogin(); }
      } catch { await renderLogin(); }
    } else {
      await renderLogin();
    }

    setupNetworkListeners();
    registerServiceWorker();
    startSyncInterval();
  } catch (err) {
    console.error('Bootstrap error:', err);
    if (app) app.innerHTML = `<div class="login-page"><main class="login-form-wrap"><div class="login-error"><b>Startup Error</b>${err.message}</div><p style="color:var(--muted);margin-top:16px;">Please refresh the page or contact support.</p></main></div>`;
  }
}

function setupNetworkListeners() {
  window.addEventListener('online', () => { state.online = true; renderConnectionStatus(); startSyncEngine(); retrySync(); });
  window.addEventListener('offline', () => { state.online = false; renderConnectionStatus(); });
}

async function startSyncEngine(retryCount = 0) {
  if (!state.online) return;
  try {
    const result = await syncEngine.sync();
    if (result.status === 'synced' || result.status === 'none') {
      state.syncStatus = await syncEngine.getStatus();
    } else if (result.status === 'failed' && retryCount < 3) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      setTimeout(() => startSyncEngine(retryCount + 1), delay);
    }
  } catch {
    if (retryCount < 3) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      setTimeout(() => startSyncEngine(retryCount + 1), delay);
    }
  }
}

function startSyncInterval() {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(() => { if (state.online) startSyncEngine(); }, 30000);
}

async function retrySync() {
  if (!syncEngine) return;
  const result = await syncEngine.retryFailed();
  if (result.retried > 0) {
    state.syncStatus = await syncEngine.getStatus();
    toast(`Synced ${result.retried} operations`);
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/src/workers/sw.js').catch(() => {});
  }
}

async function loadSettings() {
  const settings = {};
  try {
    const data = await api.getSettings();
    Object.assign(settings, data);
  } catch {
    const keys = ['business_name','branch_code','tax_rate','express_surcharge_percent','normal_turnaround_hours','express_turnaround_hours','mpesa_environment','dark_mode'];
    for (const k of keys) { settings[k] = localStorage.getItem(`od-setting-${k}`) || ''; }
  }
  return settings;
}

function renderConnectionStatus() {
  const indicator = document.querySelector('#connection-status');
  if (indicator) {
    indicator.className = state.online ? 'connection-status online' : 'connection-status offline';
    indicator.innerHTML = state.online ? '🟢 Online' : '🔴 Offline';
  }
}

export { state, app, auth, api, toast };
export { renderApp, shell };

if (!document.querySelector('#app')) {
  document.body.innerHTML = '<div id="app"></div>';
}