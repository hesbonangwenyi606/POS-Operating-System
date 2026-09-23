export function moneyToMinorUnits(amount) { return Math.round(Number(amount) * 100); }
export function minorUnitsToMoney(minor) { return minor / 100; }
export function formatMoneyKES(amount) { return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 2 }).format(amount); }
