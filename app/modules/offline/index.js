// Offline copy (phase 6c AC 10): registers the service worker (sw.js) once the app has started, offers
// "A new version of the app is ready — Reload" when an updated worker is waiting (bottom-left, dismissable),
// and adds an "Offline copy" line with "Reset offline copy" to the Learn sheet index (bus 'learn:painted').
// Registers only on https: or a local host, never on file:, and not when the address has ?nosw=1 (that also
// unregisters an existing worker). The worker stores static app files only — nothing personal.
import { t } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';
import { toastHost } from '../../core/undo.js';
import { swSupport, offlineBytes, lineFor, ownScopes, ownCaches } from './status.js';

const UPDATE_CHECK_MS = 60 * 60 * 1000; // look for a new deploy at most hourly while the tab stays open

export function mountOffline({ bus, ready = Promise.resolve() }) {
  const sw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : null;
  const support = swSupport(location, !!sw);
  const base = new URL('./', location.href).href;
  let reg = null, wantReload = false, lastCheck = Date.now(), toast = null;

  const ours = async () => (sw ? (await sw.getRegistrations()).filter((r) => ownScopes([r.scope], base).length) : []);

  // ---- "Update available" toast
  function hideToast() { toast?.remove(); toast = null; }
  function offer(worker) {
    if (!worker || !sw.controller || toast) return; // first install: nothing to update
    toast = document.createElement('div');
    toast.className = 'sw-toast'; toast.setAttribute('role', 'status');
    toast.innerHTML = `<span>${esc(t('A new version of the app is ready.'))}</span>
      <button type="button" class="btn sm primary" data-sw="reload">${esc(t('Reload'))}</button>
      <button type="button" class="sw-toast-x" data-sw="dismiss" aria-label="${esc(t('Dismiss'))}" title="${esc(t('Dismiss'))}">✕</button>`;
    toast.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sw]');
      if (b?.dataset.sw === 'dismiss') hideToast();
      if (b?.dataset.sw === 'reload') { wantReload = true; b.disabled = true; worker.postMessage({ type: 'SKIP_WAITING' }); }
    });
    toastHost().append(toast); // the shared spot (core/undo.js, P8 8d): inside #app, stacked with the Undo line
  }
  function watch(r) {
    if (r.waiting) offer(r.waiting);
    r.addEventListener('updatefound', () => {
      const w = r.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
    });
  }

  async function register() {
    if (support === 'nosw') { // dev escape hatch: run this visit without the worker and drop the registration
      try { await Promise.all((await ours()).map((r) => r.unregister())); } catch { /* ignore */ }
      return;
    }
    if (support !== 'ok') return;
    try {
      reg = await sw.register('sw.js', { scope: './', updateViaCache: 'none' });
      watch(reg);
    } catch (err) { console.warn('Offline copy not available:', err.message); }
  }

  if (sw) {
    sw.addEventListener('controllerchange', () => { if (wantReload) { wantReload = false; location.reload(); } });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !reg || Date.now() - lastCheck < UPDATE_CHECK_MS) return;
      lastCheck = Date.now(); reg.update().catch(() => {});
    });
  }
  // after the data has loaded, so the worker's first download reuses what the page just fetched
  ready.then(register, register);

  // ---- Learn sheet: "Offline copy" line
  async function resetCopy(btn) {
    btn.disabled = true; btn.textContent = t('Resetting…');
    try {
      await Promise.all((await ours()).map((r) => r.unregister()));
      if (typeof caches !== 'undefined') await Promise.all(ownCaches(await caches.keys()).map((n) => caches.delete(n)));
    } catch (err) { console.warn('Reset offline copy:', err.message); }
    location.reload();
  }
  async function fillLine(el) {
    let bytes = null, registered = false;
    try { bytes = offlineBytes(await (await fetch('sw-manifest.json')).json()); } catch { /* size unknown */ }
    try { registered = (await ours()).length > 0; } catch { /* ignore */ }
    const line = lineFor({ support, controlled: !!sw?.controller, registered, bytes });
    el.innerHTML = `<span>${esc(t(line.text, line.args))}</span>${line.reset
      ? ` <button type="button" class="link" data-offline-reset title="${esc(t('Removes the saved app files and downloads them again. Your household and shortlist stay.'))}">${esc(t('Reset offline copy'))}</button>` : ''}`;
    el.querySelector('[data-offline-reset]')?.addEventListener('click', (e) => resetCopy(e.currentTarget));
  }
  bus.on('learn:painted', ({ root, id }) => {
    if (id || !root) return;
    const body = root.querySelector('.drawer-body');
    if (!body || body.querySelector('.offline-line')) return;
    const el = document.createElement('p');
    el.className = 'hint offline-line';
    const last = body.querySelector(':scope > p.hint:last-child');
    if (last) last.before(el); else body.append(el);
    fillLine(el);
  });

  return { support };
}
