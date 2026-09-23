import { db } from '../db/database.js';
import { api } from '../api/client.js';
import { moneyToMinorUnits } from '../utils/money.js';
import { generateOrderNumber } from '../utils/helpers.js';

export function createOrderService() {
  async function createOrder(data) {
    const orderNumber = generateOrderNumber();
    const total = data.items.reduce((sum, item) => sum + moneyToMinorUnits(item.unit_price || 0) * (item.quantity || 1), 0);
    const subtotal = total;
    const discount = data.discount ? Math.round(total * data.discount / 100) : 0;
    const surcharge = data.turnaround === 'Express' ? Math.round(total * 0.3) : 0;
    const netTotal = total + surcharge - discount;
    const amountPaid = moneyToMinorUnits(data.amount_paid || 0);
    const balance = Math.max(0, netTotal - amountPaid);
    const now = Date.now();

    const order = {
      orderNumber,
      customerId: data.customer_id,
      cashierId: data.cashier_id || 1,
      branchId: data.branch_id || 1,
      status: 'Received',
      dueDate: now + (data.turnaround === 'Express' ? 4 : 24) * 3600000,
      subtotal, discount, surcharge, tax: 0,
      total: netTotal, amountPaid, balance,
      paymentMethod: data.payment_method || 'cash',
      fulfilment: data.fulfilment || 'collection',
      turnaround: data.turnaround || 'Normal',
      notes: data.notes || '', careNotes: data.care_notes || '',
      items: data.items.map(item => ({
        serviceId: item.service_id, sku: item.sku,
        description: item.description || item.name,
        quantity: item.quantity || 1,
        unitPrice: moneyToMinorUnits(item.unit_price || 0),
        discount: 0, surcharge: 0,
        lineTotal: moneyToMinorUnits(item.unit_price || 0) * (item.quantity || 1),
      })),
      createdAt: now, updatedAt: now,
    };

    await db.orders.add(order);
    await api.createOrder({ ...data, total: netTotal / 100, subtotal: subtotal / 100, discount: discount / 100, surcharge: surcharge / 100, amount_paid: amountPaid / 100 });
    return order;
  }

  async function getOrders(params = {}) {
    try { return await api.getOrders(params); } catch { return { orders: await db.orders.toArray(), total: await db.orders.count(), pages: 1, page: 1 }; }
  }

  async function getOrder(id) {
    try { return await api.getOrder(id); } catch { return await db.orders.get(id); }
  }

  async function updateStatus(orderId, status, note) {
    await db.orders.update(orderId, { status, updatedAt: Date.now() });
    await api.updateOrderStatus(orderId, status, note);
  }

  async function addPayment(orderId, data) {
    const result = await api.addPayment(orderId, data);
    return result;
  }

  async function deleteOrder(id) { await api.deleteOrder(id); await db.orders.delete(id); }

  return { createOrder, getOrders, getOrder, updateStatus, addPayment, deleteOrder };
}
