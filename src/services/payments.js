import { db } from '../db/database.js';
import { api } from '../api/client.js';

export function createPaymentService() {
  async function processPayment(orderId, data) {
    const result = await api.addPayment(orderId, data);
    await db.payments.add({ orderId, amount: data.amount, method: data.method, reference: data.reference, status: 'completed', cashierId: 1, type: 'sale', createdAt: Date.now() });
    return result;
  }

  async function processRefund(data) {
    const result = await api.refundPayment(data);
    return result;
  }

  async function getPayments(orderId) {
    try { return await api.getPayments(orderId); } catch { return (await db.payments.where('orderId').equals(orderId).toArray()); }
  }

  return { processPayment, processRefund, getPayments };
}
