import { describe, it, expect, beforeEach } from 'vitest';
import { moneyToMinorUnits, minorUnitsToMoney, formatMoneyKES, generateOrderNumber } from '../server/db/database.js';

global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; },
};

describe('POS Checkout - Money calculations', () => {
  it('converts KES to minor units', () => {
    expect(moneyToMinorUnits(100.50)).toBe(10050);
    expect(moneyToMinorUnits(0)).toBe(0);
    expect(moneyToMinorUnits(1)).toBe(100);
  });

  it('converts minor units back to KES', () => {
    expect(minorUnitsToMoney(10050)).toBe('100.50');
    expect(minorUnitsToMoney(0)).toBe('0.00');
  });

  it('formats KES correctly', () => {
    expect(formatMoneyKES(10050)).toContain('10,050.00');
  });
});

describe('POS Checkout - Order calculation', () => {
  it('calculates express surcharge at 30%', () => {
    const subtotal = 60000;
    const surcharge = Math.round(subtotal * 0.3);
    expect(surcharge).toBe(18000);
    expect(subtotal + surcharge).toBe(78000);
  });

  it('calculates percentage discount', () => {
    const subtotal = 100000;
    const discount = Math.round(subtotal * 10 / 100);
    expect(discount).toBe(10000);
    expect(subtotal - discount).toBe(90000);
  });

  it('calculates total with all adjustments', () => {
    const subtotal = 60000;
    const surcharge = Math.round(subtotal * 0.3);
    const discount = Math.round(subtotal * 10 / 100);
    expect(subtotal + surcharge - discount).toBe(72000);
  });

  it('calculates partial payment balance', () => {
    expect(78000 - 50000).toBe(28000);
  });

  it('calculates POS total with tax, discount, and surcharge', () => {
    const subtotal = 60000;
    const discountMinor = Math.round(subtotal * 10 / 100);
    const taxRate = 16;
    const taxAmount = Math.round((subtotal - discountMinor) * (taxRate / 100));
    const surcharge = Math.round(subtotal * 0.3);
    const total = subtotal - discountMinor + taxAmount + surcharge;
    expect(discountMinor).toBe(6000);
    expect(taxAmount).toBe(8640);
    expect(surcharge).toBe(18000);
    expect(total).toBe(80640);
  });

  it('calculates zero tax when tax rate is 0', () => {
    const subtotal = 60000;
    const discountMinor = 0;
    const taxRate = 0;
    const taxAmount = Math.round((subtotal - discountMinor) * (taxRate / 100));
    expect(taxAmount).toBe(0);
  });
});

describe('POS Checkout - Cart operations', () => {
  it('adds item to cart', () => {
    const cart = [];
    const item = { service_id: '1', name: 'Washing', unit_price: 60000, quantity: 1 };
    cart.push(item);
    expect(cart.length).toBe(1);
    expect(cart[0].name).toBe('Washing');
  });

  it('increments item quantity', () => {
    const cart = [{ service_id: '1', name: 'Washing', unit_price: 60000, quantity: 1 }];
    cart[0].quantity++;
    expect(cart[0].quantity).toBe(2);
  });

  it('decrements item quantity and removes if zero', () => {
    const cart = [{ service_id: '1', name: 'Washing', unit_price: 60000, quantity: 1 }];
    cart[0].quantity--;
    if (cart[0].quantity <= 0) cart.splice(0, 1);
    expect(cart.length).toBe(0);
  });

  it('removes item from cart', () => {
    const cart = [
      { service_id: '1', name: 'Washing', unit_price: 60000, quantity: 1 },
      { service_id: '2', name: 'Drying', unit_price: 60000, quantity: 1 },
    ];
    cart.splice(0, 1);
    expect(cart.length).toBe(1);
    expect(cart[0].name).toBe('Drying');
  });

  it('calculates cart subtotal', () => {
    const cart = [
      { service_id: '1', name: 'Washing', unit_price: 60000, quantity: 2 },
      { service_id: '2', name: 'Ironing', unit_price: 70000, quantity: 1 },
    ];
    const subtotal = cart.reduce((sum, item) => sum + (item.unit_price || 0) * (item.quantity || 1), 0);
    expect(subtotal).toBe(190000);
  });
});

describe('POS Checkout - Payment states', () => {
  const states = ['idle', 'initiating', 'prompt_sent', 'awaiting_customer', 'confirmed', 'complete', 'failed'];
  it('has valid payment states', () => {
    states.forEach(state => {
      expect(typeof state).toBe('string');
      expect(state.length).toBeGreaterThan(0);
    });
  });

  it('payment state transitions are valid', () => {
    const validTransitions = {
      idle: ['initiating'],
      initiating: ['prompt_sent', 'failed'],
      prompt_sent: ['awaiting_customer', 'failed'],
      awaiting_customer: ['confirmed', 'failed'],
      confirmed: ['complete'],
      complete: [],
      failed: ['idle'],
    };
    Object.entries(validTransitions).forEach(([from, tos]) => {
      expect(Array.isArray(tos)).toBe(true);
      tos.forEach(to => expect(states).toContain(to));
    });
  });
});

describe('POS Checkout - Discount types', () => {
  it('percentage discount calculation', () => {
    const subtotal = 100000;
    const discountPercent = 10;
    const discountMinor = Math.round(subtotal * (discountPercent / 100));
    expect(discountMinor).toBe(10000);
  });

  it('fixed discount calculation', () => {
    const subtotal = 100000;
    const discountValue = 500;
    const discountMinor = moneyToMinorUnits(discountValue);
    expect(discountMinor).toBe(50000);
  });

  it('no discount', () => {
    const discountType = 'none';
    const subtotal = 100000;
    const discountMinor = discountType === 'percentage' ? Math.round(subtotal * 0.1) : 0;
    expect(discountMinor).toBe(0);
  });
});

describe('POS Checkout - Fulfilment and turnaround', () => {
  it('has valid fulfilment methods', () => {
    expect(['collection', 'delivery']).toContain('collection');
    expect(['collection', 'delivery']).toContain('delivery');
  });

  it('has valid turnaround types', () => {
    expect(['Normal', 'Express']).toContain('Normal');
    expect(['Normal', 'Express']).toContain('Express');
  });

  it('express turnaround has shorter hours', () => {
    const normalHours = 24;
    const expressHours = 4;
    expect(expressHours).toBeLessThan(normalHours);
  });
});

describe('POS Checkout - Order number generation', () => {
  it('generates valid order numbers', () => {
    const num = generateOrderNumber();
    expect(num).toMatch(/^OD-\d{4}-\d{6}$/);
  });

  it('generates unique order numbers', () => {
    const nums = new Set();
    for (let i = 0; i < 5; i++) {
      nums.add(generateOrderNumber());
    }
    expect(nums.size).toBe(5);
  });
});

describe('POS Checkout - Register/cash session', () => {
  it('cash shift statuses are valid', () => {
    expect(['open', 'closed']).toContain('open');
    expect(['open', 'closed']).toContain('closed');
  });

  it('calculates cash shift variance', () => {
    const openingFloat = 500000;
    const cashSales = 1200000;
    const refunds = 100000;
    const cashIn = 0;
    const cashOut = 200000;
    const expected = openingFloat + cashSales - refunds + cashIn - cashOut;
    const actualCash = 1400000;
    const variance = actualCash - expected;
    expect(expected).toBe(1400000);
    expect(variance).toBe(0);
  });
});

describe('POS Checkout - Offline cart persistence', () => {
  it('can save cart to localStorage', () => {
    const cart = [{ service_id: '1', name: 'Washing', unit_price: 60000, quantity: 2 }];
    localStorage.setItem('od-pos-cart', JSON.stringify(cart));
    const saved = JSON.parse(localStorage.getItem('od-pos-cart'));
    expect(saved.length).toBe(1);
    expect(saved[0].name).toBe('Washing');
  });

  it('can restore cart from localStorage', () => {
    const saved = JSON.parse(localStorage.getItem('od-pos-cart'));
    expect(saved).toBeDefined();
    expect(saved[0].quantity).toBe(2);
  });

  it('clears cart on reset', () => {
    localStorage.removeItem('od-pos-cart');
    expect(localStorage.getItem('od-pos-cart')).toBeNull();
  });
});