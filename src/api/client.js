export const API_BASE = '/api';

const TOKEN_KEY = 'od_auth_token';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(token) { localStorage.setItem(TOKEN_KEY, token); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }

async function request(method, path, body = null) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const options = { method, headers };
  if (body !== null) {
    if (typeof body === 'string') throw new Error('Request body must be an object, not a string. Avoid double JSON.stringify.');
    options.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(`${API_BASE}${path}`, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (e) {
    if (e.message.startsWith('HTTP')) throw e;
    if (e.message === 'Failed to fetch' || e.message.includes('NetworkError')) {
      throw new Error('Network error. You are offline. Data saved locally.');
    }
    throw e;
  }
}

export const api = {
  login: (data) => request('POST', '/auth/login', data),
  register: (data) => request('POST', '/auth/register', data),
  getSettings: () => request('GET', '/settings'),
  updateSettings: (data) => request('PUT', '/settings', data),
  getServices: () => request('GET', '/services'),
  createService: (data) => request('POST', '/services', data),
  updateService: (id, data) => request('PUT', `/services/${id}`, data),
  deleteService: (id) => request('DELETE', `/services/${id}`),
  getOrders: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/orders${q ? '?' + q : ''}`);
  },
  getOrder: (id) => request('GET', `/orders/${id}`),
  createOrder: (data) => request('POST', '/orders', data),
  updateOrder: (id, data) => request('PUT', `/orders/${id}`, data),
  updateOrderStatus: (id, status, note) => request('PUT', `/orders/${id}`, { status, note }),
  addPayment: (orderId, data) => request('POST', `/orders/${orderId}/payment`, data),
  getReceipt: (id) => request('GET', `/orders/${id}/receipt`),
  refundPayment: (data) => request('POST', '/payments/refund', data),
  getPayments: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', `/payments${q ? '?' + q : ''}`); },
  getCustomers: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', `/customers${q ? '?' + q : ''}`); },
  createCustomer: (data) => request('POST', '/customers', data),
  updateCustomer: (id, data) => request('PUT', `/customers/${id}`, data),
  getReports: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', `/reports/sales${q ? '?' + q : ''}`); },
  getReportByDay: (days) => request('GET', `/reports/by-day?days=${days}`),
  getReportByPeriod: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', `/reports/by-period${q ? '?' + q : ''}`); },
  getReportComparison: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', `/reports/comparison${q ? '?' + q : ''}`); },
  getLaundry: (status) => request('GET', `/reports/laundry${status ? `?status=${status}` : ''}`),
  getTopCustomers: () => request('GET', '/reports/customers'),
  getTopServices: () => request('GET', '/reports/services'),
  getCashierReports: () => request('GET', '/reports/cashiers'),
  getPaymentReport: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', `/reports/payments${q ? '?' + q : ''}`); },
  getOutstandingReport: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', `/reports/outstanding${q ? '?' + q : ''}`); },
  getRefundReport: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', `/reports/refunds${q ? '?' + q : ''}`); },
  getExpenseReport: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', `/reports/expenses${q ? '?' + q : ''}`); },
  getServicesPerformance: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', `/reports/services-performance${q ? '?' + q : ''}`); },
  getOrderStatusReport: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', `/reports/order-status${q ? '?' + q : ''}`); },
  getExpressVsNormal: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', `/reports/express-vs-normal${q ? '?' + q : ''}`); },
  getFulfilmentReport: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', `/reports/fulfilment${q ? '?' + q : ''}`); },
  getCashReport: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', `/reports/cash-report${q ? '?' + q : ''}`); },
  getCustomerGrowth: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', `/reports/customer-growth${q ? '?' + q : ''}`); },
  getDiscountReport: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', `/reports/discount-report${q ? '?' + q : ''}`); },
  getProfitabilityReport: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', `/reports/profitability${q ? '?' + q : ''}`); },
  getBranchReport: () => request('GET', '/reports/branch-report'),
  getSyncStatus: () => request('GET', '/sync/status'),
  getSyncQueue: () => request('GET', '/sync/queue'),
  syncOperations: (ops) => request('POST', '/sync/sync', { operations: ops }),
  getMPesaStatus: () => request('GET', '/mpesa/status'),
  mpesaSTKPush: (data) => request('POST', '/mpesa/stk-push', data),
  mpesaCallback: (data) => request('POST', '/mpesa/callback', data),
  getHardwareStatus: () => request('GET', '/hardware/status'),
  getDeliveryZones: () => request('GET', '/delivery/zones'),
  addDeliveryZone: (data) => request('POST', '/delivery/zones', data),
  notifyCustomer: (data) => request('POST', '/notifications/send', data),
  getInventory: () => request('GET', '/inventory'),
  addInventory: (data) => request('POST', '/inventory', data),
  getExpenses: (params = {}) => { const q = new URLSearchParams(params).toString(); return request('GET', `/expenses${q ? '?' + q : ''}`); },
  addExpense: (data) => request('POST', '/expenses', data),
  openCashShift: (data) => request('POST', '/cash-shift/open', data),
  getCurrentShift: () => request('GET', '/cash-shift/current'),
  closeCashShift: (id, data) => request(`POST`, `/cash-shift/${id}/close`, data),
  getBackup: () => request('GET', '/backup'),
  exportBackup: () => request('POST', '/backup/export'),
  restoreBackup: (data) => request('POST', '/backup/restore', data),
  getSampleServices: () => request('GET', '/sample-services'),
  getHealth: () => request('GET', '/health'),
  getDbStats: () => request('GET', '/db-stats'),
  getDashboardOverview: () => request('GET', '/dashboard/overview'),
  openRegister: (data) => request('POST', '/register/open', data),
  closeRegister: (id, data) => request(`POST`, `/register/${id}/close`, data),
  logout: () => request('POST', '/auth/logout'),
};