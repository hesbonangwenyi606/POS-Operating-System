export function toast(message, type = 'success') {
  const el = document.getElementById('toast');
  if (!el) return;
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  el.innerHTML = `<div class="toast toast-${type}"><span>${icons[type] || '•'}</span> ${message}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 3000);
}

export function showModal(html) {
  const modal = document.getElementById('modal');
  if (!modal) return;
  modal.innerHTML = `<div class="backdrop">${html}</div>`;
  modal.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeModal());
  modal.querySelector('.backdrop').onclick = (e) => { if (e.target.classList.contains('backdrop')) closeModal(); };
}

export function closeModal() {
  const modal = document.getElementById('modal');
  if (modal) modal.innerHTML = '';
}

export function formatDate(dateStr) { return new Date(dateStr).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }); }
export function formatTime(dateStr) { return new Date(dateStr).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }); }
export function formatDateTime(dateStr) { return `${formatDate(dateStr)} ${formatTime(dateStr)}`; }


export function generateOrderNumber() {
  const year = new Date().getFullYear();
  const counter = localStorage.getItem('od-order-counter') || '0';
  const seq = (parseInt(counter) + 1).toString().padStart(6, '0');
  localStorage.setItem('od-order-counter', seq);
  return `OD-${year}-${seq}`;
}

export function normalizePhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return digits.substring(1);
  if (digits.length === 9) return digits;
  return digits;
}

export function isValidPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return true;
  if (digits.startsWith('0') && digits.length === 10) return true;
  if (digits.length === 9) return true;
  return false;
}
