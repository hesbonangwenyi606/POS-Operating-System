export function moneyToMinorUnits(amount) { return Math.round(Number(amount) * 100); }
export function minorUnitsToMoney(minor) { return minor / 100; }
export function formatMoneyKES(amount) { return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 2 }).format(amount); }
export function safeAdd(a, b) { return moneyToMinorUnits(a) + moneyToMinorUnits(b); }
export function safeSubtract(a, b) { return moneyToMinorUnits(a) - moneyToMinorUnits(b); }
export function safeMultiply(minor, multiplier) { return Math.round(minor * multiplier); }
export function safeDivide(minor, divisor) { return Math.round(minor / divisor); }
export function formatKESDisplay(minorOrNumber) { const amount = typeof minorOrNumber === 'number' && Math.abs(minorOrNumber) > 100 ? minorOrNumber / 100 : minorOrNumber; return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 2 }).format(amount); }

export function formatPhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return `+${digits}`;
  if (digits.length === 9) return `0${digits}`;
  return phone;
}

export function normalizePhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return digits.substring(1);
  if (digits.length === 9) return digits;
  return digits;
}

export function escapeHtml(str) { return String(str ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

export function generateId() { return `id_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`; }

export function isValidPhone(phone) { const digits = phone.replace(/\D/g, ''); return digits.length === 9 || digits.length === 12; }

export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
