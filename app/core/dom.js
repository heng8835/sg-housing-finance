// Small DOM / formatting helpers shared by the new modules.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (v) => (v == null || !Number.isFinite(v) ? '—' : 'S$' + Math.round(v).toLocaleString('en-SG'));
export const kilo = (v) => (v == null || !Number.isFinite(v) ? '—' : 'S$' + (Math.round(v / 100) / 10).toLocaleString('en-SG') + 'k');
export const pct = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(d)}%`);

/** Save `obj` as a JSON file on the user's machine (no network). */
export function downloadJson(obj, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
