// Service worker — offline copy of the app (phase 6c AC 10). Classic script, relative URLs only, so it works
// under a GitHub Pages sub-path (/sg-housing-finance/). Rules live in sw-routes.js (pure, tested):
//   code, HTML, JSON, CSS, icons  network-first (revalidated with cache: 'no-cache'), cached copy only offline —
//                                 so a deploy is never stuck behind the cache (the :8766 stale-cache lesson)
//   data/*.js                     cache-first in sghf-data-<DATA_VERSION>; a new data version is downloaded
//                                 while the old worker still serves ("Update available — Reload" toast);
//                                 network-first on local dev hosts
//   cdnjs (Leaflet)               network-first, cached
//   OneMap tiles, other hosts     not handled, never cached (the map shows "Map tiles need a connection")
// Only static GET files are stored — nothing personal (the household lives in localStorage, untouched here).
// VERSION / DATA_VERSION are stamped by tools/build_sw_manifest.py — run it after any app change, before deploy.
importScripts('sw-routes.js');

const VERSION = '67369fd58e68';
const DATA_VERSION = 'b81fd3b55619';

const R = self.SWRoutes;
const SCOPE = self.registration.scope;
const NAMES = R.cacheNames(VERSION, DATA_VERSION);
const MANIFEST = new URL('sw-manifest.json', SCOPE).href;
const SAME = self.location.origin;

const abs = (u) => new URL(u, SCOPE).href;

/** Revalidating network fetch (cheap 304 when unchanged); cross-origin tries CORS, then an opaque copy. */
async function fetchFresh(url) {
  if (new URL(url).origin === SAME) return fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
  try { return await fetch(url, { mode: 'cors', credentials: 'omit' }); } catch (e) { return fetch(url, { mode: 'no-cors', credentials: 'omit' }); }
}

/** Store each url in a cache; failures are counted, never fatal (a missing file is fetched on demand later). */
async function fill(name, urls, skipCached) {
  const cache = await caches.open(name);
  let missed = 0;
  await Promise.all(urls.map(async (u) => {
    const url = abs(u), key = R.keyFor(url, SCOPE);
    if (skipCached && await cache.match(key)) return;
    try {
      const res = await fetchFresh(url);
      if (!R.storable(res, new URL(url).origin === SAME ? 'network-first' : 'cdn')) throw new Error(String(res.status));
      await cache.put(key, res);
    } catch (e) { missed += 1; }
  }));
  return missed;
}

async function readManifest(fromCache) {
  const res = fromCache ? await caches.match(MANIFEST, { cacheName: NAMES.shell }) : await fetch(MANIFEST, { cache: 'no-store' });
  if (!res || !res.ok) throw new Error('sw-manifest.json not available');
  return res.json();
}

async function dataComplete() {
  try {
    const m = await readManifest(true), cache = await caches.open(NAMES.data);
    const hits = await Promise.all((m.data || []).map((u) => cache.match(R.keyFor(abs(u), SCOPE))));
    return hits.every(Boolean);
  } catch (e) { return false; }
}

async function prune() {
  const names = await caches.keys();
  const stale = R.staleCaches(names, [NAMES.shell, NAMES.data], await dataComplete());
  await Promise.all(stale.map((n) => caches.delete(n)));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const m = await readManifest(false);
    const missed = await fill(NAMES.shell, ['sw-manifest.json', ...(m.shell || []), ...(m.cdn || [])], false)
      + await fill(NAMES.data, m.data || [], true);
    if (missed) console.warn(`Offline copy: ${missed} file(s) not saved yet; they are fetched when first used.`);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(prune().then(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

const offline = () => self.navigator && self.navigator.onLine === false;

/** A redirected response may not answer a navigation (Safari) — copy it without the redirect flag. */
async function unredirect(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function networkFirst(event, route) {
  const req = event.request, nav = req.mode === 'navigate';
  const key = R.keyFor(req.url, SCOPE);
  const cache = await caches.open(NAMES.shell);
  if (!offline()) {
    try {
      let res = route === 'cdn' ? await fetch(req) : await fetchFresh(req.url);
      if (nav) res = await unredirect(res);
      if (R.storable(res, route)) event.waitUntil(cache.put(key, res.clone()).catch(() => {}));
      return res;
    } catch (e) { /* offline or blocked: fall back to the saved copy */ }
  }
  const hit = await cache.match(key) || await caches.match(key)
    || (nav ? await caches.match(abs('index.html')) : undefined);
  return hit || Response.error();
}

async function dataFirst(event) {
  const key = R.keyFor(event.request.url, SCOPE);
  const cache = await caches.open(NAMES.data);
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const res = await fetchFresh(event.request.url);
    if (R.storable(res, 'data')) event.waitUntil(cache.put(key, res.clone()).then(prune).catch(() => {}));
    return res;
  } catch (e) {
    return (await caches.match(key)) || Response.error(); // offline: the last data version still saved
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const route = R.routeFor({ url: req.url, method: req.method }, SCOPE);
  if (route === 'bypass' || req.headers.has('range')) return;
  event.respondWith(route === 'data' ? dataFirst(event) : networkFirst(event, route));
});
