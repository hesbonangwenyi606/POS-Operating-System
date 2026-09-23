import { db } from '../db/database.js';
import { api } from '../api/client.js';
import { normalizePhone } from '../utils/money.js';

export function createCustomerService() {
  async function getCustomers(params = {}) {
    try { return await api.getCustomers(params); } catch { return { customers: await db.customers.toArray(), total: await db.customers.count(), pages: 1 }; }
  }

  async function getCustomer(id) {
    try { return await api.getCustomer(id); } catch { return await db.customers.get(id); }
  }

  async function createCustomer(data) {
    const existing = await db.customers.filter(c => c.phone === normalizePhone(data.phone)).first();
    if (existing) return existing;
    const customer = { ...data, phone: normalizePhone(data.phone), status: 'active', createdAt: Date.now() };
    await db.customers.add(customer);
    await api.createCustomer(data);
    return customer;
  }

  async function updateCustomer(id, data) {
    await db.customers.update(id, { ...data, updatedAt: Date.now() });
    await api.updateCustomer(id, data);
  }

  async function search(query) {
    const results = await db.customers.filter(c => c.name.toLowerCase().includes(query.toLowerCase()) || c.phone.includes(query)).toArray();
    return results;
  }

  return { getCustomers, getCustomer, createCustomer, updateCustomer, search };
}
