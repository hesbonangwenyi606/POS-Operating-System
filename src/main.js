import { initDB, formatMoneyKES, addToSyncQueue, getSyncQueue, markSynced, getSyncStatus, generateOrderNumber, moneyToMinorUnits, minorUnitsToMoney, safeAdd, safeSubtract, safeMultiply, safeDivide, getSetting, setSetting } from './db/database.js';
import { api } from './api/client.js';
import { createAuth } from './auth/auth.js';
import { createOrderService } from './services/orders.js';
import { createPaymentService } from './services/payments.js';
import { createCustomerService } from './services/customers.js';
import { createServiceCatalog } from './services/services.js';
import { createReportService } from './services/reports.js';
import { createSyncEngine } from './services/sync.js';
import { renderApp } from './components/app.js';
import { renderLogin } from './components/login.js';
import { toast } from './utils/helpers.js';

import './style.css';

let state = {
  view: 'pos',
  user: null,
  cart: [],
  category: 'All',
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

    await initDB();
    state.settings = await loadSettings();
    state.auth = auth;

    const token = localStorage.getItem('od_auth_token');
    if (token) {
      try {
        const user = await auth.validateToken(token);
        if (user) { state.user = user; shell(); }
        else { renderLogin(); }
      } catch { renderLogin(); }
    } else {
      renderLogin();
    }

    setupNetworkListeners();
    registerServiceWorker();
    syncEngine = createSyncEngine();
    startSyncEngine();
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

function shell() {
  renderApp(state);
}

function renderConnectionStatus() {
  const indicator = document.querySelector('#connection-status');
  if (indicator) {
    indicator.className = state.online ? 'online' : 'offline';
    indicator.innerHTML = state.online ? '🟢 Online' : '🔴 Offline';
  }
}

export { state, app, auth, api, toast };
export { generateOrderNumber, formatMoneyKES, moneyToMinorUnits, minorUnitsToMoney, safeAdd, safeSubtract, safeMultiply, safeDivide, getSetting, setSetting };

if (!document.querySelector('#app')) {
  document.body.innerHTML = '<div id="app"></div>';
}

bootstrap();