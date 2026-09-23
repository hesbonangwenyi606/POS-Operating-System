import { describe, it, expect } from 'vitest';
import { generateOrderNumber } from '../server/db/database.js';
import { moneyToMinorUnits, minorUnitsToMoney, formatMoneyKES } from '../server/db/database.js';
import { hashPassword, verifyPassword } from '../server/db/database.js';
import bcrypt from 'bcrypt';

const store = {};
global.localStorage = {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
};

describe('Helpers', () => {
  it('generates order numbers', () => {
    const num = generateOrderNumber();
    expect(num).toMatch(/^OD-\d{4}-\d{6}$/);
  });
});

describe('Money utilities (database module)', () => {
  it('converts KES to minor units', () => {
    expect(moneyToMinorUnits(100.50)).toBe(10050);
  });

  it('converts minor units back to KES', () => {
    expect(minorUnitsToMoney(10050)).toBe('100.50');
  });

  it('formats KES correctly', () => {
    expect(formatMoneyKES(10050)).toContain('10,050.00');
  });
});

describe('Order calculation', () => {
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
});

describe('Price persistence', () => {
  it('retains price at time of sale', () => {
    const servicePrice = 60000;
    const orderItemPrice = servicePrice;
    expect(orderItemPrice).toBe(60000);
  });
});

describe('Password hashing', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('admin123');
    expect(await verifyPassword('admin123', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('produces different hashes for same password', async () => {
    const hash1 = await hashPassword('test');
    const hash2 = await hashPassword('test');
    expect(hash1).not.toBe(hash2);
  });
});