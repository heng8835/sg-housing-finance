// Static half of the privacy guarantee (go-live blocker 3): every call site in app/ that can send data off the page
// (fetch, XHR, beacon, images / scripts from other hosts, workers, navigation, clipboard) or print it (console) must
// be on the allow-list below, with the reason it cannot carry household data. A new call site fails this test until
// it is reviewed and listed; a listed site that disappeared fails too (keep the list honest). Same for hosts: only
// this site, cdnjs (Leaflet) and OneMap (map tiles + logo: images only, no user text) are ever contacted. Dynamic
// proof with marker values: privacy.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appFiles, findSinks, findHosts, stripComments, APP_DIR } from './scan.js';

// [file, sink, text the line must contain, why it is safe]
export const ALLOWED = [
  // ---- same-origin static files (fixed relative paths; no query built from state)
  ['core/data-loader.js', 'createEl', "createElement('script')", 'data/*.js classic scripts, fixed list DATA_FILES'],
  ['core/data-loader.js', 'srcAssign', 'el.src = src', 'same: relative data/*.js path'],
  ['core/i18n.js', 'fetch', 'fetch(`i18n/${lang}${name}.json`)', 'dictionary; lang is en|zh, name from a fixed list'],
  ['core/policy.js', 'fetch', 'fetch(url,', "policy/sg-policy.json (main.js passes the constant)"],
  ['modules/learn/index.js', 'fetch', 'fetch(file)', 'content/content(.zh).json'],
  ['modules/learn/index.js', 'fetch', "fetch('content/content.json')", 'fallback glossary'],
  ['modules/start/index.js', 'fetch', 'await fetch(f)', 'content/guides(.zh).json'],
  ['modules/guides/index.js', 'fetchRef', 'fetchFn = fetch', 'loadGuides: content/guides(.zh).json'],
  ['core/townalias.js', 'fetchRef', 'fetchFn = globalThis.fetch', 'i18n/towns.zh.json (7b B15 town names), fixed path'],
  ['modules/offline/index.js', 'fetch', "fetch('sw-manifest.json')", 'offline size line'],
  ['modules/offline/index.js', 'swRegister', "register('sw.js'", 'service worker, same origin (worker-src self)'],
  ['index.html', 'remoteTag', 'leaflet.min.css" integrity="sha384-', 'Leaflet CSS from cdnjs, SRI-pinned'],
  ['index.html', 'remoteTag', 'leaflet.min.js" integrity="sha384-', 'Leaflet JS from cdnjs, SRI-pinned'],
  // ---- OneMap: tiles + logo only (no user data). The Daily places search is local (core/placesearch.js).
  ['modules/explore/legacy.js', 'remoteTag', "L.tileLayer('https://www.onemap.gov.sg/maps/tiles/Grey/", 'map tiles + attribution logo'],
  // ---- service worker: static GET files of this site + cdnjs, never OneMap (sw-routes.js "bypass")
  ['sw.js', 'importScripts', "importScripts('sw-routes.js')", 'own rules file'],
  ['sw.js', 'fetch', "fetch(url, { cache: 'no-cache', credentials: 'same-origin' })", 'same-origin revalidation'],
  ['sw.js', 'fetch', "fetch(url, { mode: 'cors', credentials: 'omit' })", 'cdnjs, no credentials'],
  ['sw.js', 'fetch', "fetch(url, { mode: 'no-cors', credentials: 'omit' })", 'cdnjs opaque fallback'],
  ['sw.js', 'fetch', "fetch(MANIFEST, { cache: 'no-store' })", 'sw-manifest.json'],
  ['sw.js', 'fetch', "route === 'cdn' ? await fetch(req)", 'cdnjs request as the page made it'],
  ['sw.js', 'fetchRef', "addEventListener('fetch'", 'the fetch event name'],
  // ---- in-browser only (no network)
  ['core/mc.js', 'worker', "new Worker(new URL('../engine/mc.worker.js', import.meta.url)", 'Monte-Carlo worker, same origin'],
  ['core/mc.js', 'postMessage', 'w.postMessage({ id, kind, args', 'inputs to the in-browser worker (stays on the device)'],
  ['engine/mc.worker.js', 'postMessage', 'self.postMessage({ id, ok: true', 'results back to the page'],
  ['engine/mc.worker.js', 'postMessage', 'self.postMessage({ id, ok: false', 'error text back to the page'],
  ['modules/offline/index.js', 'postMessage', "postMessage({ type: 'SKIP_WAITING' })", 'service-worker update'],
  ['modules/explore/legacy.js', 'clipboard', 'navigator.clipboard.writeText(link)', 'user-clicked "share link": shareUrl() = flats only'],
  ['modules/explore/legacy.js', 'clipboard', 'navigator.clipboard.writeText(brief.tsv())', 'user-clicked "Copy table"'],
  ['modules/explore/legacy.js', 'history', "history.replaceState(null, '', location.pathname)", 'drops the #shortlist= fragment after import'],
  ['modules/household/index.js', 'locationNav', 'store.reset(); location.reload()', 'Forget my data'],
  ['modules/offline/index.js', 'locationNav', 'wantReload = false; location.reload()', 'new version'],
  ['modules/offline/index.js', 'locationNav', 'location.reload()', 'reset offline copy'],
  ['modules/samples/index.js', 'locationNav', 'reload = () => location.reload()', 'sample load / exit'],
  ['modules/shell/lang.js', 'locationNav', 'location.reload()', 'language switch'],
  ['modules/start/index.js', 'locationNav', 'location.reload()', 'language switch inside Start here (answers kept in the local store draft, 7b B5)'],
  // ---- console: fixed text + error messages only (engine / policy errors name rule ids, never inputs — checked below)
  ['main.js', 'console', "console.warn('Sample sandbox:', err.message)", 'error text'],
  ['main.js', 'console', "console.warn('Offline copy not available:', err.message)", 'error text'],
  ['main.js', 'console', "console.warn('Guide not available:', err.message)", 'error text'],
  ['main.js', 'console', "console.warn('Guides not available:', err.message)", 'error text'],
  ['main.js', 'console', "console.warn('Block ids:', JSON.stringify({ derived: r.derived, dropped: r.comparer.dropped }))", 'data file names + a count of dropped flats'],
  ['main.js', 'console', "console.warn('Block ids:', err.message)", 'error text'],
  ['main.js', 'console', "console.warn('Late data:', JSON.stringify(dropped))", 'S1b: names of derived data files dropped (block_sig mismatch)'],
  ['main.js', 'console', "console.warn('Late data:', err.message)", 'error text'],
  ['modules/offline/index.js', 'console', "console.warn('Offline copy not available:', err.message)", 'error text'],
  ['modules/offline/index.js', 'console', "console.warn('Reset offline copy:', err.message)", 'error text'],
  ['modules/plan/cpfrange.js', 'console', "console.warn('Monte-Carlo range', err)", 'worker / engine error'],
  ['modules/rent/index.js', 'console', "console.warn('Monte-Carlo range', err)", 'worker / engine error'],
  ['modules/plan/index.js', 'console', 'console.error(err)', 'engine error in one Plan card'],
  ['modules/scenarios/index.js', 'console', "console.warn('Scenario not calculated:', err.message)", 'engine error'],
  ['sw.js', 'console', 'console.warn(`Offline copy: ${missed} file(s) not saved yet', 'a count'],
];

// hosts allowed in code / markup, and why
export const HOSTS = {
  'cdnjs.cloudflare.com': 'Leaflet 1.9.4 (SRI) — index.html + CSP',
  'www.onemap.gov.sg': 'map tiles + logo (images only) — legacy.js + CSP img-src',
  'www.sla.gov.sg': 'attribution link (navigation on click only)',
  'www.w3.org': 'SVG xmlns in the flat brief (not a request)',
  'github.com': 'Learn → About: repo, DATA_LICENCES.md and Issues links (navigation on tap only, 7b)',
  'data.gov.sg': 'Learn → About: Singapore Open Data Licence link (navigation on tap only, 7b)',
  'www.openstreetmap.org': 'Learn → About: OpenStreetMap copyright link (navigation on tap only, 7b)',
  'ko-fi.com': 'Learn → About: donation link if DONATE_URL is set (navigation on tap only, DEC-019)',
  'www.buymeacoffee.com': 'Learn → About: donation link if DONATE_URL is set (navigation on tap only, DEC-019)',
};

test('every network / navigation / console / worker call site in app/ is reviewed and allow-listed', () => {
  const found = findSinks();
  const used = new Set();
  const unlisted = [];
  for (const f of found) {
    const i = ALLOWED.findIndex(([file, sink, has], k) => !used.has(k) && file === f.file && sink === f.sink && f.text.includes(has));
    if (i < 0) unlisted.push(`${f.file}:${f.line} [${f.sink}] ${f.text.slice(0, 160)}`);
    else used.add(i);
  }
  assert.deepEqual(unlisted, [], 'new call sites: review for personal data, then add to ALLOWED in tests/privacy/egress.test.js');
  const stale = ALLOWED.filter((_, k) => !used.has(k)).map(([file, sink, has]) => `${file} [${sink}] ${has}`);
  assert.deepEqual(stale, [], 'allow-list entries with no matching call site (moved or removed?) — update ALLOWED');
});

test('no console.log / info / debug anywhere in the shipped app', () => {
  assert.deepEqual(findSinks().filter((f) => f.sink === 'console' && !/console\.(warn|error)\(/.test(f.text)).map((f) => `${f.file}:${f.line}`), []);
});

test('only allow-listed hosts appear in code and markup (this site, cdnjs, OneMap)', () => {
  const bad = findHosts().filter((h) => !HOSTS[h.host]).map((h) => `${h.file}:${h.line} ${h.host}`);
  assert.deepEqual(bad, []);
  const css = appFiles().filter((f) => f.endsWith('.css')).filter((f) => /url\(\s*['"]?(https?:)?\/\//i.test(stripComments(readFileSync(join(APP_DIR, f), 'utf8'), f)));
  assert.deepEqual(css, [], 'stylesheets load nothing from other hosts');
});

test('every link that opens a new tab has rel="noopener" (go-live §2.6)', () => {
  const bad = [];
  let n = 0;
  for (const file of appFiles().filter((f) => /\.(js|html)$/.test(f))) {
    const src = readFileSync(join(APP_DIR, file), 'utf8');
    for (const m of src.matchAll(/<a\b[^>]*target=\\?["']?_blank[^>]*>/g)) { n += 1; if (!/rel=\\?["'][^"']*noopener/.test(m[0])) bad.push(`${file}: ${m[0].slice(0, 120)}`); }
  }
  assert.ok(n > 0);
  assert.deepEqual(bad, []);
});

test('OneMap is image-only: tiles + logo; the Daily places search runs on our own data, typed text never leaves', () => {
  const where = [];
  for (const file of appFiles().filter((f) => /\.(js|html)$/.test(f))) {
    const src = stripComments(readFileSync(join(APP_DIR, file), 'utf8'), file);
    for (const m of src.matchAll(/[\w.-]*onemap\.gov\.sg[^'"`\s;]*/gi)) where.push(`${file} ${m[0]}`);
  }
  for (const w of where) assert.match(w, /^(modules\/explore\/legacy\.js www\.onemap\.gov\.sg\/(maps\/tiles\/|web-assets\/images\/logo\/|$)|index\.html www\.onemap\.gov\.sg$)/, w);
  assert.ok(!where.some((w) => /\/api\//.test(w)), 'no OneMap API call (search needs a per-owner token)');
  const src = stripComments(readFileSync(join(APP_DIR, 'modules/explore/legacy.js'), 'utf8'), 'x.js');
  assert.ok(/const q = wIn\.value\.trim\(\); wItems = findPlaces\(q\);/.test(src), 'Daily places box → core/placesearch.js');
  assert.match(src, /searchPlaces\(placeIdx \|\| \(placeIdx = buildPlaceIndex\(/);
  const ps = stripComments(readFileSync(join(APP_DIR, 'core/placesearch.js'), 'utf8'), 'x.js');
  assert.doesNotMatch(ps, /fetch|XMLHttpRequest|sendBeacon|https?:/, 'the place search is pure');
});

test('error messages that reach the console interpolate rule ids / file names only, never inputs', () => {
  const ok = new Set(['id', 'day', 'kind', 'url', 'src', 'res.status']); // src = a data/*.js file name
  const bad = [];
  for (const file of appFiles().filter((f) => f.endsWith('.js'))) {
    const src = stripComments(readFileSync(join(APP_DIR, file), 'utf8'), file);
    for (const m of src.matchAll(/new Error\(`([^`]*)`\)/g)) for (const v of m[1].matchAll(/\$\{([^}]*)\}/g)) if (!ok.has(v[1].trim())) bad.push(`${file}: \${${v[1]}}`);
  }
  assert.deepEqual(bad, []);
});
