// Offline copy (phase 6c AC 10): the pure routing rules (app/sw-routes.js) and the worker itself (app/sw.js)
// run in node:vm with an in-memory Cache Storage and a fake network — network-first code, cache-first data,
// OneMap never handled, old caches cleaned, nothing but static files stored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = (f) => readFileSync(new URL(`../../app/${f}`, import.meta.url), 'utf8');
const SCOPE = 'https://heng8835.github.io/sg-housing-finance/';
const DEV = 'http://localhost:8766/';

function loadRoutes() {
  const ctx = { self: {}, URL };
  vm.runInNewContext(SRC('sw-routes.js'), ctx);
  return ctx.self.SWRoutes;
}
const R = loadRoutes();
const route = (url, method = 'GET', scope = SCOPE) => R.routeFor({ url, method }, scope);

test('routes: code / HTML / JSON network-first, data cache-first, Leaflet cdn, OneMap + others bypassed', () => {
  for (const p of ['', 'index.html', 'index.html?nosw=1', 'main.js', 'core/store.js', 'modules/offline/index.js',
    'policy/sg-policy.json', 'i18n/zh.json', 'content/guides.json', 'styles/base.css', 'manifest.webmanifest',
    'icons/icon-192.png', 'sw-manifest.json']) assert.equal(route(SCOPE + p), 'network-first', p);
  assert.equal(route(`${SCOPE}data/data.js`), 'data');
  assert.equal(route(`${SCOPE}data/rents.js?v=abc`), 'data');
  assert.equal(route(`${SCOPE}sw.js`), 'bypass');
  assert.equal(route(`${SCOPE}sw-routes.js`), 'bypass');
  assert.equal(route(`${SCOPE}main.js`, 'POST'), 'bypass');
  assert.equal(route('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'), 'cdn');
  assert.equal(route('http://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'), 'bypass');
  assert.equal(route('https://www.onemap.gov.sg/maps/tiles/Grey/15/25843/16253.png'), 'bypass');
  assert.equal(route('https://www.onemap.gov.sg/api/common/elastic/search?searchVal=ZZPRIVACY&returnGeom=Y'), 'bypass');
  assert.equal(route('https://example.com/x.js'), 'bypass');
  assert.equal(route('https://heng8835.github.io/another-project/app.js'), 'bypass', 'same origin, other Pages project');
  assert.equal(route('not a url'), 'bypass');
});

test('routes: on local dev hosts data is network-first too (a rebuilt data file shows on a normal reload)', () => {
  assert.equal(route(`${DEV}data/data.js`, 'GET', DEV), 'network-first');
  assert.equal(route('http://127.0.0.1:8767/data/poi.js', 'GET', 'http://127.0.0.1:8767/'), 'network-first');
  assert.equal(R.isDevHost(DEV), true);
  assert.equal(R.isDevHost(SCOPE), false);
});

test('keys, cache names, stale caches, storable responses', () => {
  assert.equal(R.keyFor(SCOPE, SCOPE), `${SCOPE}index.html`);
  assert.equal(R.keyFor(`${SCOPE}?nosw=1#shortlist=abc`, SCOPE), `${SCOPE}index.html`);
  assert.equal(R.keyFor(`${SCOPE}core/i18n.js?v=1`, SCOPE), `${SCOPE}core/i18n.js`);
  assert.equal(R.keyFor('data/data.js', SCOPE), `${SCOPE}data/data.js`);
  assert.deepEqual({ ...R.cacheNames('aaa', 'bbb') }, { shell: 'sghf-shell-aaa', data: 'sghf-data-bbb' });
  const names = ['sghf-shell-old', 'sghf-shell-new', 'sghf-data-old', 'sghf-data-new', 'someone-elses-cache'];
  const keep = ['sghf-shell-new', 'sghf-data-new'];
  assert.deepEqual([...R.staleCaches(names, keep, true)], ['sghf-shell-old', 'sghf-data-old']);
  assert.deepEqual([...R.staleCaches(names, keep, false)], ['sghf-shell-old'], 'old data kept until the new data is complete');
  assert.equal(R.storable({ ok: true, status: 200, type: 'basic' }, 'network-first'), true);
  assert.equal(R.storable({ ok: true, status: 206, type: 'basic' }, 'data'), false);
  assert.equal(R.storable({ ok: false, status: 404, type: 'basic' }, 'network-first'), false);
  assert.equal(R.storable({ ok: false, status: 0, type: 'opaque' }, 'cdn'), true);
  assert.equal(R.storable({ ok: false, status: 0, type: 'opaque' }, 'network-first'), false);
  assert.equal(R.storable(null, 'data'), false);
});

// ---------------------------------------------------------------- the worker in a fake browser
const MANIFEST = { version: 'v1', data_version: 'd1', bytes: { shell: 10, data: 20 },
  shell: ['index.html', 'main.js', 'core/i18n.js'], data: ['data/data.js', 'data/rents.js'],
  cdn: ['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'] };

function fakeBrowser({ version = 'v1', dataVersion = 'd1', manifest = MANIFEST, scope = SCOPE, storage } = {}) {
  const files = new Map(); // url → body (the "server")
  const put = (path, body) => files.set(new URL(path, scope).href, body);
  put('sw-manifest.json', JSON.stringify(manifest));
  for (const p of [...manifest.shell, ...manifest.data]) put(p, `${p} @1`);
  for (const u of manifest.cdn) files.set(u, `leaflet @1`);
  const net = { online: true, log: [] };
  const fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    net.log.push({ url, cache: init.cache });
    if (!net.online) throw new TypeError('Failed to fetch');
    const body = files.get(url.split('?')[0]);
    return body == null ? new Response('missing', { status: 404 }) : new Response(body, { status: 200 });
  };
  const stores = storage || new Map(); // name → Map(key → Response)
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name);
      return { match: async (k) => m.get(typeof k === 'string' ? k : k.url)?.clone(),
        put: async (k, res) => { m.set(typeof k === 'string' ? k : k.url, res.clone()); } };
    },
    async match(k, opts = {}) {
      for (const [name, m] of stores) {
        if (opts.cacheName && opts.cacheName !== name) continue;
        const hit = m.get(k); if (hit) return hit.clone();
      }
      return undefined;
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const handlers = {};
  const self = { registration: { scope }, location: new URL('sw.js', scope), navigator: { onLine: true },
    clients: { claim: async () => {} }, skipWaiting() { self.skipped = true; },
    addEventListener: (type, fn) => { handlers[type] = fn; } };
  const ctx = { self, caches, fetch, Response, Request, Headers, URL, console: { warn() {} },
    importScripts: (f) => vm.runInContext(SRC(f), ctx) };
  vm.createContext(ctx);
  const code = SRC('sw.js').replace(/^const VERSION = '[^']*';$/m, `const VERSION = '${version}';`)
    .replace(/^const DATA_VERSION = '[^']*';$/m, `const DATA_VERSION = '${dataVersion}';`);
  vm.runInContext(code, ctx);

  const lifecycle = async (type) => { const waits = []; handlers[type]({ waitUntil: (p) => waits.push(p) }); await Promise.all(waits); };
  async function request(path, { mode = 'cors', method = 'GET' } = {}) {
    const url = /^https?:/.test(path) ? path : new URL(path, scope).href;
    let responded = null; const waits = [];
    handlers.fetch({ request: { url, method, mode, headers: new Headers() }, respondWith: (p) => { responded = p; }, waitUntil: (p) => waits.push(p) });
    if (!responded) return { handled: false };
    let res; try { res = await responded; } catch (e) { res = null; }
    await Promise.all(waits);
    return { handled: true, res, text: res && res.type !== 'error' ? await res.text() : null };
  }
  return { files, put, net, stores, self, handlers, lifecycle, request };
}

test('worker: install precaches shell + cdn + data; activate cleans only our old caches', async () => {
  const storage = new Map([['sghf-shell-v0', new Map()], ['sghf-data-d0', new Map()], ['another-app', new Map()]]);
  const b = fakeBrowser({ storage });
  await b.lifecycle('install');
  const shell = b.stores.get('sghf-shell-v1'), data = b.stores.get('sghf-data-d1');
  for (const p of ['index.html', 'main.js', 'core/i18n.js', 'sw-manifest.json']) assert.ok(shell.has(SCOPE + p), p);
  assert.ok(shell.has(MANIFEST.cdn[0]), 'Leaflet cached');
  assert.deepEqual([...data.keys()].sort(), [`${SCOPE}data/data.js`, `${SCOPE}data/rents.js`]);
  assert.ok(b.net.log.filter((r) => r.url.startsWith(SCOPE) && !r.url.endsWith('sw-manifest.json')).every((r) => r.cache === 'no-cache'),
    'revalidates against the server (no stale HTTP cache)');
  await b.lifecycle('activate');
  assert.deepEqual([...b.stores.keys()].sort(), ['another-app', 'sghf-data-d1', 'sghf-shell-v1']);
});

test('worker: code is network-first (a new deploy shows at once), the saved copy answers offline', async () => {
  const b = fakeBrowser();
  await b.lifecycle('install'); await b.lifecycle('activate');
  b.put('main.js', 'main.js @2');
  assert.equal((await b.request('main.js')).text, 'main.js @2', 'online: always the server copy');
  b.net.online = false; b.self.navigator.onLine = false;
  assert.equal((await b.request('main.js')).text, 'main.js @2', 'offline: the last copy seen');
  assert.equal((await b.request('', { mode: 'navigate' })).text, 'index.html @1', 'offline navigation → index.html');
  assert.equal((await b.request('index.html?nosw=1', { mode: 'navigate' })).text, 'index.html @1');
  assert.equal((await b.request('core/never-cached.js')).res.type, 'error', 'unknown file offline → network error');
});

test('worker: data is cache-first for its version; a new data version is fetched, old data kept until complete', async () => {
  const storage = new Map();
  const v1 = fakeBrowser({ storage });
  await v1.lifecycle('install'); await v1.lifecycle('activate');
  v1.put('data/data.js', 'data.js @2'); // a new build is on the server
  assert.equal((await v1.request('data/data.js')).text, 'data/data.js @1', 'old worker: its own data version');

  const manifest2 = { ...MANIFEST, data_version: 'd2' };
  const v2 = fakeBrowser({ storage, dataVersion: 'd2', manifest: manifest2 });
  v2.put('data/data.js', 'data.js @2');
  v2.net.online = false;
  await v2.lifecycle('install').catch(() => {}); // offline install fails: nothing changes
  v2.net.online = true;
  await v2.lifecycle('install');                 // downloads the new data in the background (old worker still serving)
  await v2.lifecycle('activate');
  assert.ok(!storage.has('sghf-data-d1'), 'old data cache removed once the new one is complete');
  assert.equal((await v2.request('data/data.js')).text, 'data.js @2');
  v2.net.online = false; v2.self.navigator.onLine = false;
  assert.equal((await v2.request('data/rents.js')).text, 'data/rents.js @1', 'offline: from the data cache');
});

test('worker: OneMap tiles / search and other hosts are never handled or stored; non-GET bypassed', async () => {
  const b = fakeBrowser();
  await b.lifecycle('install'); await b.lifecycle('activate');
  assert.equal((await b.request('https://www.onemap.gov.sg/maps/tiles/Grey/15/1/2.png')).handled, false);
  assert.equal((await b.request('https://www.onemap.gov.sg/api/common/elastic/search?searchVal=ZZPRIVACY')).handled, false);
  assert.equal((await b.request('main.js', { method: 'POST' })).handled, false);
  const keys = [...b.stores.values()].flatMap((m) => [...m.keys()]);
  assert.ok(keys.every((k) => k.startsWith(SCOPE) || k.startsWith('https://cdnjs.cloudflare.com/')), 'only our files + Leaflet');
  assert.ok(!keys.some((k) => k.includes('?')), 'no query strings in cache keys');
});

test('worker: only the "Reload" message (SKIP_WAITING) activates a waiting worker', () => {
  const b = fakeBrowser();
  b.handlers.message({ data: { type: 'something-else' } });
  assert.equal(b.self.skipped, undefined);
  b.handlers.message({ data: { type: 'SKIP_WAITING' } });
  assert.equal(b.self.skipped, true);
});
