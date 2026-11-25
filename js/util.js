// Small shared helpers.

export const DEG = Math.PI / 180;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Formats a number the Hungarian way (decimal comma). */
export function fmt(v, digits = 2) {
  if (!Number.isFinite(v)) return '–';
  return v.toFixed(digits).replace('.', ',');
}

/** Parses user input that may use either a decimal comma or a decimal point. */
export function parseNum(s) {
  if (typeof s === 'number') return s;
  const v = parseFloat(String(s ?? '').replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(v) ? v : NaN;
}

export const deepClone = (o) => JSON.parse(JSON.stringify(o));

export function debounce(fn, ms) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
