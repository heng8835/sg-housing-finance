// Offline copy (phase 6c AC 10) — pure helpers for modules/offline/index.js: may this page register the
// service worker, how big the saved copy is, and which Learn-sheet line to show. No DOM, no network.

export const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];
export const CACHE_PREFIX = 'sghf-'; // = sw-routes.js PREFIX; caches are per origin, shared with other github.io projects

/** 'ok' | 'file' | 'unsupported' | 'nosw' | 'insecure' for a location-like { protocol, hostname, search }. */
export function swSupport(loc, hasServiceWorker) {
  if (!loc || loc.protocol === 'file:') return 'file';
  if (!hasServiceWorker) return 'unsupported';
  if (new URLSearchParams(loc.search || '').get('nosw') === '1') return 'nosw';
  const host = String(loc.hostname || '');
  const local = LOCAL_HOSTS.includes(host) || host.endsWith('.localhost');
  if (loc.protocol !== 'https:' && !local) return 'insecure';
  return 'ok';
}

/** Bytes the offline copy takes (shell + data) from sw-manifest.json, or null. */
export function offlineBytes(manifest) {
  const b = manifest && manifest.bytes;
  if (!b) return null;
  const n = (Number(b.shell) || 0) + (Number(b.data) || 0);
  return n > 0 ? n : null;
}

/** "14 MB" (whole MB from 10 MB, one decimal below, at least 0.1 MB). */
export function sizeText(bytes) {
  if (!(bytes > 0)) return '';
  const mb = bytes / 1e6;
  return mb >= 10 ? `${Math.round(mb)} MB` : `${Math.max(0.1, Math.round(mb * 10) / 10)} MB`;
}

export const LINES = {
  saved: 'Offline copy: about {0} saved on this device. The app opens without a connection; map tiles still need one.',
  savedNoSize: 'Offline copy: saved on this device. The app opens without a connection; map tiles still need one.',
  saving: 'Offline copy: saving about {0} on this device for use without a connection…',
  savingNoSize: 'Offline copy: saving the app on this device for use without a connection…',
  nosw: 'Offline copy: switched off for this visit (?nosw=1).',
  insecure: 'Offline copy: needs a secure (https) address.',
  unsupported: 'Offline copy: not supported in this browser.',
};

/** Learn-sheet line: { text (English key), args, reset } — reset = show the "Reset offline copy" button. */
export function lineFor({ support, controlled, registered, bytes }) {
  const size = sizeText(bytes);
  if (support === 'nosw') return { text: LINES.nosw, args: [], reset: registered };
  if (support === 'insecure' || support === 'file') return { text: LINES.insecure, args: [], reset: false };
  if (support !== 'ok') return { text: LINES.unsupported, args: [], reset: false };
  if (controlled) return size ? { text: LINES.saved, args: [size], reset: true } : { text: LINES.savedNoSize, args: [], reset: true };
  return size ? { text: LINES.saving, args: [size], reset: registered } : { text: LINES.savingNoSize, args: [], reset: registered };
}

/** Our registration(s) only: scope inside this app's folder (other github.io projects share the origin). */
export function ownScopes(scopes, base) {
  return scopes.filter((s) => typeof s === 'string' && s.startsWith(base));
}

/** Our cache names only. */
export const ownCaches = (names) => names.filter((n) => String(n).startsWith(CACHE_PREFIX));
