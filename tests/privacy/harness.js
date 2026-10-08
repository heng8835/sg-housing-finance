// Privacy test harness (go-live blocker 3, intelligence spec §7.4): marker values for the household, spies on every
// way a browser page can send or show data (fetch, XMLHttpRequest, sendBeacon, Image, WebSocket, EventSource,
// console, location, history), and a leak check that also looks inside URL-encoded and base64url payloads.
// Not a test file itself (no .test.js suffix) — imported by tests/privacy/*.test.js.
import { readFileSync, existsSync } from 'node:fs';

export const APP = new URL('../../app/', import.meta.url);
export const ORIGIN = 'https://heng8835.github.io';
export const PATH = '/sg-housing-finance/';

/** Marker values: unusual numbers / text that can only come from the household typed in by the user. */
export const M = { income: 987654, income2: 912345, cpf: 876543, cpfSa: 854321, cash: 765432, debts: 7654, name: 'ZZPRIVATE', grants: 23456 };
const NUMS = [M.income, M.income2, M.cpf, M.cpfSa, M.cash, M.grants];
export const MARKERS = [M.name, ...NUMS.map(String), ...NUMS.map((n) => n.toLocaleString('en-SG'))];

/** A household that uses every marker (shape = store.js defaults().household). */
export const markerHousehold = () => ({
  scheme: 'family', firstTimer: true, propertiesOwned: 0, parents: 'none', loan: 'hdb', tenure: 25, needsReview: false,
  cash: M.cash, otherDebts: M.debts, grantsOverride: M.grants,
  buyers: [
    { age: 34, income: M.income, citizenship: 'SC', prYears3Plus: null, nationality: null, pass: null, wpSector: null, cpfOa: M.cpf, cpfSa: M.cpfSa, cpfMa: null, cpfRa: null },
    { age: 33, income: M.income2, citizenship: 'SC', prYears3Plus: null, nationality: null, pass: null, wpSector: null, cpfOa: M.cpf, cpfSa: null, cpfMa: null, cpfRa: null },
  ],
});

/** In-memory localStorage. */
export const memoryStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, map: m };
};

const tryDecode = (s) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } };
const tryB64 = (s) => { try { return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch { return ''; } };
/** The text plus its URL-decoded form plus every base64 / base64url-looking run decoded (share links are base64url). */
export function expand(text) {
  const s = typeof text === 'string' ? text : (() => { try { return JSON.stringify(text); } catch { return String(text); } })() ?? '';
  const out = [s, tryDecode(s)];
  for (const run of s.match(/[A-Za-z0-9_\-+/]{12,}={0,2}/g) || []) out.push(tryB64(run));
  return out.join('\n');
}
/** Markers found in `text` (after expand). */
export const leaksIn = (text) => { const all = expand(text); return MARKERS.filter((m) => all.includes(m)); };

/** Fake same-origin server: relative paths are read from app/ on disk; anything else is a 404 (and logged). */
function respond(url) {
  const rel = String(url).split(/[?#]/)[0];
  if (!/^[a-z][\w+.-]*:/i.test(rel)) {
    const file = new URL(rel.replace(/^\.?\//, ''), APP);
    if (existsSync(file)) return new Response(readFileSync(file), { status: 200 });
  }
  return new Response('', { status: 404 });
}

const flatten = (v) => (v == null ? '' : typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })());

/**
 * Install spies on globalThis. Returns { log, restore }: log.requests = [{ kind, url, body, headers }],
 * log.console = [{ level, text }], log.nav = [{ kind, url }]. Nothing here ever reaches a real network.
 */
export function installSpies({ href = `${ORIGIN}${PATH}` } = {}) {
  const log = { requests: [], console: [], nav: [] };
  const g = globalThis;
  const keep = {};
  const set = (name, value) => {
    keep[name] = Object.getOwnPropertyDescriptor(g, name) || null;
    Object.defineProperty(g, name, { value, configurable: true, writable: true, enumerable: false });
  };
  set('fetch', async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input && input.url ? input.url : String(input);
    log.requests.push({ kind: 'fetch', url, body: flatten(init.body), headers: flatten(init.headers) });
    return respond(url);
  });
  set('XMLHttpRequest', class {
    open(method, url) { this.u = url; log.requests.push({ kind: 'xhr', url: String(url), body: '', headers: '' }); }
    setRequestHeader(k, v) { log.requests.push({ kind: 'xhr-header', url: this.u, body: '', headers: `${k}: ${v}` }); }
    send(body) { log.requests.push({ kind: 'xhr-send', url: this.u, body: flatten(body), headers: '' }); }
  });
  set('Image', class { set src(v) { log.requests.push({ kind: 'image', url: String(v), body: '', headers: '' }); } });
  set('WebSocket', class { constructor(url) { log.requests.push({ kind: 'websocket', url: String(url), body: '', headers: '' }); } send(b) { log.requests.push({ kind: 'websocket-send', url: '', body: flatten(b), headers: '' }); } });
  set('EventSource', class { constructor(url) { log.requests.push({ kind: 'eventsource', url: String(url), body: '', headers: '' }); } });
  set('navigator', { language: 'en-SG', onLine: true, sendBeacon: (url, body) => { log.requests.push({ kind: 'beacon', url: String(url), body: flatten(body), headers: '' }); return true; } });
  const url = new URL(href);
  const loc = {
    origin: url.origin, protocol: url.protocol, host: url.host, hostname: url.hostname, pathname: url.pathname, search: url.search, hash: url.hash,
    get href() { return `${this.origin}${this.pathname}${this.search}${this.hash}`; },
    set href(v) { log.nav.push({ kind: 'location.href', url: String(v) }); },
    assign(v) { log.nav.push({ kind: 'location.assign', url: String(v) }); },
    replace(v) { log.nav.push({ kind: 'location.replace', url: String(v) }); },
    reload() { log.nav.push({ kind: 'location.reload', url: '' }); },
  };
  set('location', loc);
  set('history', {
    pushState(s, t, u) { log.nav.push({ kind: 'history.pushState', url: String(u ?? ''), body: flatten(s) }); },
    replaceState(s, t, u) { log.nav.push({ kind: 'history.replaceState', url: String(u ?? ''), body: flatten(s) }); },
  });
  const created = [];
  set('document', {
    documentElement: { lang: 'en' },
    body: { appendChild: (el) => created.push(el) },
    createElement: (tag) => ({ tag, click() { this.clicked = true; }, remove() {}, setAttribute(k, v) { this[k] = v; } }),
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
  });
  const levels = ['log', 'info', 'debug', 'warn', 'error', 'trace', 'table', 'dir'];
  const realConsole = {};
  for (const level of levels) {
    realConsole[level] = console[level];
    console[level] = (...args) => log.console.push({ level, text: args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : flatten(a))).join(' ') });
  }
  return {
    log,
    created,
    restore() {
      for (const level of levels) console[level] = realConsole[level];
      for (const [name, desc] of Object.entries(keep)) { if (desc) Object.defineProperty(g, name, desc); else delete g[name]; }
    },
  };
}

/** Every leak in the log, as readable lines (empty = clean). */
export function leaks(log) {
  const out = [];
  for (const r of log.requests) for (const m of leaksIn(`${r.url}\n${r.body}\n${r.headers}`)) out.push(`${r.kind} ${r.url} carries ${m}`);
  for (const c of log.console) for (const m of leaksIn(c.text)) out.push(`console.${c.level} prints ${m}`);
  for (const n of log.nav) for (const m of leaksIn(`${n.url}\n${n.body || ''}`)) out.push(`${n.kind} ${n.url} carries ${m}`);
  return out;
}

/** Requests that are not same-origin static files (relative URL or ORIGIN + PATH). */
export const offOrigin = (log) => log.requests.filter((r) => /^[a-z][\w+.-]*:/i.test(r.url) && !r.url.startsWith(`${ORIGIN}${PATH}`));
