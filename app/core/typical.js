// Typical flat / rent defaults (H1): when no block or price is picked, the Afford, Rent & Buy and Plan tabs
// use a typical flat for what the map shows — the drawn area, else the town filter, else island-wide —
// labelled as such. The default is never written to the store (focus stays the user's own), it is
// recomputed. Reads core/data.js; listens to 'explore:selection' / 'explore:area' (emitted by explore).
import { data } from './data.js';
import { bus } from './bus.js';
import { esc, money } from './dom.js';
import { t, currentLang } from './i18n.js';
import { rentComps, areaRentComps } from '../engine/rent.js';
import { flatTypeLabel } from './flattype.js';

export const TYPICAL_MIN_N = 5;   // UI heuristic: fewer sales than this → widen the scope one step
const DEBOUNCE_MS = 150;

// ---------------------------------------------------------------- selection memory
let lastSel = null;
/** The last 'explore:selection' payload (with the latest 'explore:area' folded in), or null. */
export const lastSelection = () => lastSel;
/** For tests: replace the remembered selection. */
export const setSelection = (sel) => { lastSel = sel || null; };
bus.on('explore:selection', (sel) => { lastSel = sel || null; });
bus.on('explore:area', (area) => { lastSel = { ...(lastSel || {}), area: area || null }; });

/** What in a selection can change a default (area, towns, flat types, window) — equal keys = same defaults. */
export function selectionKey(sel) {
  if (!sel) return '';
  const a = sel.area;
  return JSON.stringify([a ? [a.label, a.n, (a.blockIds || []).length, (a.blockIds || [])[0]] : null, sel.towns || null, sel.flatTypes || null, sel.window || null]);
}

/**
 * Call fn (debounced 150 ms) after the map's selection or drawn area changes in a way that can change a
 * default (selectionKey); returns an unsubscribe function.
 */
export function onTypicalChange(fn) {
  let timer = null, key = selectionKey(lastSel);
  const later = () => { clearTimeout(timer); timer = setTimeout(() => { const k = selectionKey(lastSel); if (k === key) return; key = k; fn(); }, DEBOUNCE_MS); };
  const off = [bus.on('explore:selection', later), bus.on('explore:area', later)];
  return () => { clearTimeout(timer); off.forEach((o) => o()); };
}

// ---------------------------------------------------------------- labels
const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (m, a, c) => a + c.toUpperCase());
/** Town name for display ('ANG MO KIO' → 'Ang Mo Kio'). */
export const townName = (town) => titleCase(town);
/** Flat type in a sentence: '4-room', 'Executive' (中文: the dictionary name). */
export const ftWord = (ft) => flatTypeLabel(ft); // one shared display helper (core/flattype.js)
/** 'Oct 2025' / '2025年10月'. */
export function monthLabel(ym) {
  const [y, m] = String(ym || '').split('-').map(Number);
  if (!y || !m) return String(ym || '');
  return new Intl.DateTimeFormat(currentLang() === 'zh' ? 'zh-SG' : 'en-SG', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

// ---------------------------------------------------------------- scope + flat type
// flat types by typical size, smallest first (UI ordering for "the largest selected type", not a rule)
const FT_SIZE_ORDER = ['1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'MULTI-GENERATION', 'EXECUTIVE'];
/** The largest of the given flat types (by FT_SIZE_ORDER; unknown names rank last), or null. */
export function largestType(fts) {
  const list = (Array.isArray(fts) ? fts : []).filter(Boolean);
  const rank = (x) => FT_SIZE_ORDER.indexOf(x);
  return list.reduce((best, x) => (best == null || rank(x) > rank(best) ? x : best), null);
}

/**
 * The focus flat's type, else 4-room if selected, else the first selected. prefer 'largest' (Plan, for someone who
 * owns a home and will sell — an upgrader, A8): the largest selected type instead.
 */
export function defaultFlatType(focus, sel, prefer = null) {
  if (focus && focus.flatType) return focus.flatType;
  const fts = (sel && Array.isArray(sel.flatTypes) ? sel.flatTypes : []).filter(Boolean);
  if (prefer === 'largest' && fts.length) return largestType(fts);
  return fts.includes('4 ROOM') ? '4 ROOM' : fts[0] || '4 ROOM';
}

/** What the map shows: drawn area → town filter → island-wide. */
export function scopeOf(sel) {
  const a = sel && sel.area;
  if (a && Array.isArray(a.blockIds) && a.blockIds.length) {
    return { kind: 'area', blockIds: a.blockIds, town: a.town || null, name: a.label || t('drawn area'), label: a.label ? t('your {0}', [a.label]) : t('this area') };
  }
  const towns = sel && Array.isArray(sel.towns) ? sel.towns.filter(Boolean) : null;
  if (towns && towns.length) return { kind: 'towns', towns, label: towns.length === 1 ? townName(towns[0]) : t('{0} towns', [towns.length]) };
  return { kind: 'island', label: t('Singapore (all towns)') };
}

/** One step wider: area → its main town → island; towns → island; island → null. */
export function widen(scope) {
  if (scope.kind === 'area') return scope.town ? { kind: 'towns', towns: [scope.town], label: townName(scope.town) } : scopeOf(null);
  if (scope.kind === 'towns') return scopeOf(null);
  return null;
}

const scopeKey = (s) => (s.kind === 'area' ? `a:${s.blockIds.length}:${s.blockIds.slice(0, 50).join(',')}` : s.kind === 'towns' ? `t:${s.towns.join('|')}` : 'i');

// ---------------------------------------------------------------- prices (pure over data.hdb)
const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const cache = new Map();
let cacheFor = null;
const cached = (key, fn) => {
  const d = data.hdb;
  if (cacheFor !== d) { cache.clear(); cacheFor = d; }
  if (!cache.has(key)) cache.set(key, fn(d));
  return cache.get(key);
};

/** Month index range [from, to] of a window ({from:'YYYY-MM', to:'YYYY-MM'}); default = the last 12 months. */
function monthRange(d, win) {
  const NM = d.months.length;
  let to = win && win.to ? d.months.indexOf(win.to) : -1, from = win && win.from ? d.months.indexOf(win.from) : -1;
  if (to < 0) to = NM - 1;
  if (from < 0 || from > to) from = Math.max(0, to - 11);
  return [from, to];
}

/** Block filter for a scope (null = every block). */
function blockTest(d, scope) {
  if (scope.kind === 'area') { const s = new Set(scope.blockIds); return (b) => s.has(b); }
  if (scope.kind === 'towns') { const s = new Set(scope.towns.map((x) => d.towns.indexOf(x)).filter((i) => i >= 0)); return (b) => s.has(d.blocks[b]?.t); }
  return null;
}

/**
 * Median resale price of one flat type in a scope and window (price only: all storeys and sizes, no filters).
 * @returns {{ price:number, n:number, from:string, to:string, scope:object, flatType:string } | null}
 */
export function typicalPrice({ flatType, scope, window: win = null }) {
  if (!data.hdb || !scope) return null;
  return cached(`p|${flatType}|${scopeKey(scope)}|${win ? `${win.from}-${win.to}` : ''}`, (d) => {
    const ft = d.flat_types.indexOf(flatType);
    if (ft < 0) return null;
    const [from, to] = monthRange(d, win), inScope = blockTest(d, scope), tx = d.tx, prices = [];
    for (let i = 0; i < tx.p.length; i++) {
      if (tx.ft[i] !== ft || tx.m[i] < from || tx.m[i] > to) continue;
      if (inScope && !inScope(tx.b[i])) continue;
      prices.push(tx.p[i]);
    }
    return prices.length ? { price: median(prices), n: prices.length, from: d.months[from], to: d.months[to], scope, flatType } : null;
  });
}

/** typicalPrice, widening the scope while it has fewer than TYPICAL_MIN_N sales. */
export function typicalPriceWidened({ flatType, scope, window: win = null }) {
  let s = scope, best = null;
  while (s) {
    const r = typicalPrice({ flatType, scope: s, window: win });
    if (r && r.n >= TYPICAL_MIN_N) return r;
    best = best || r;
    s = widen(s);
  }
  return best;
}

/** Median price by flat type for a set of blocks (the drawn area), its main town and sale count. */
export function areaSummary(blockIds, win = null) {
  if (!data.hdb || !blockIds || !blockIds.length) return null;
  return cached(`s|${scopeKey({ kind: 'area', blockIds })}|${win ? `${win.from}-${win.to}` : ''}`, (d) => {
    const [from, to] = monthRange(d, win), set = new Set(blockIds), tx = d.tx, by = {};
    for (let i = 0; i < tx.p.length; i++) {
      if (tx.m[i] < from || tx.m[i] > to || !set.has(tx.b[i])) continue;
      (by[d.flat_types[tx.ft[i]]] ||= []).push(tx.p[i]);
    }
    const counts = {};
    for (const b of blockIds) { const ti = d.blocks[b]?.t; if (ti != null) counts[ti] = (counts[ti] || 0) + 1; }
    const top = Object.entries(counts).sort((x, y) => y[1] - x[1])[0];
    const byType = Object.fromEntries(Object.entries(by).map(([ft, p]) => [ft, { price: median(p), n: p.length }]));
    return { byType, town: top ? d.towns[+top[0]] : null, n: Object.values(by).reduce((s, p) => s + p.length, 0), from: d.months[from], to: d.months[to] };
  });
}

// ---------------------------------------------------------------- rents
/**
 * Typical rent for a scope: area → block figures (engine areaRentComps, widening to the main town);
 * one town → town comps; several towns (or island-wide: every town) → n-weighted mean of their 12-month medians.
 * @returns {{ med:number, p25:number|null, p75:number|null, n:number|null, tier:string, months:number|null,
 *   source:string, label:string, scope:object } | null}
 */
export function typicalRent({ flatType, scope }, policy) {
  const R = data.rents;
  if (!R || !scope) return null;
  if (scope.kind === 'area') {
    const c = areaRentComps(scope.blockIds.map((b) => R.blocks[String(b)]).filter(Boolean), flatType, policy);
    if (c) return { ...c, label: t('{0} rentals in this area, last {1} months (average of block figures)', [c.n, c.months]), scope };
    return scope.town ? typicalRent({ flatType, scope: widen(scope) }, policy) : null;
  }
  if (scope.kind !== 'towns' && scope.kind !== 'island') return null;
  if (scope.kind === 'towns' && scope.towns.length === 1) {
    const c = rentComps(null, flatType, policy, R.towns[scope.towns[0]] || null);
    return c ? { ...c, label: t('whole town'), scope } : null;
  }
  // several towns, or island-wide (owner H1: always show a default) → n-weighted mean of town medians
  const towns = scope.kind === 'island' ? Object.keys(R.towns || {}) : scope.towns;
  let n = 0, sum = 0, k = 0;
  for (const town of towns) {
    const c = rentComps(null, flatType, policy, R.towns[town] || null);
    if (!c || !(c.n > 0)) continue;
    n += c.n; sum += c.med * c.n; k += 1;
  }
  return n > 0 ? { tier: 'towns', n, med: sum / n, p25: null, p75: null, months: 12, last: null, source: 'transactions', label: t('average of {0} towns', [k]), scope } : null;
}

// ---------------------------------------------------------------- the flat the tabs use
/**
 * The focus flat when it has a price; otherwise the typical flat for the map's selection (never stored).
 * @param {{get:(path:string)=>any}} store
 * @param {object} [sel] map selection; opts.prefer = 'largest' → the largest selected type (defaultFlatType)
 * @returns {object|null} focus, or { source:'typical', isDefault:true, price, flatType, label, n, from, to, scope,
 *   remainingLease } — null while the data has not loaded.
 */
export function effectiveFlat(store, sel = lastSelection(), { prefer = null } = {}) {
  const f = store.get('focus');
  if (f && f.price > 0) return f;
  const flatType = defaultFlatType(f, sel, prefer);
  const r = typicalPriceWidened({ flatType, scope: scopeOf(sel), window: sel && sel.window });
  if (!r) return null;
  return {
    source: 'typical', isDefault: true, price: Math.round(r.price), flatType, n: r.n, from: r.from, to: r.to, scope: r.scope,
    label: t('Typical {0} in {1}', [ftWord(flatType), r.scope.label]), remainingLease: f && Number.isFinite(f.remainingLease) ? f.remainingLease : null,
  };
}

/**
 * Market rent behind the Annual Value estimate (Afford "True monthly cost", scenarios): the block's rent comps →
 * the area / town typical rent → null.
 * @returns {{ rent:number, flatType:string } | null}
 */
export function marketRentFor(tf, policy) {
  if (!data.rents || !tf) return null;
  const ft = tf.flatType || '4 ROOM';
  if (tf.bid != null) {
    const r = data.rentsFor(tf.bid), c = rentComps(r.block, ft, policy, r.town);
    if (c) return { rent: c.med, flatType: ft };
  }
  const c = typicalRent({ flatType: ft, scope: tf.scope || scopeOf(lastSelection()) }, policy);
  return c ? { rent: c.med, flatType: ft } : null;
}

/** Town of the flat on screen: the block's town, else a drawn area's main town or a single town filter, else null. */
export function townOfFlat(tf) {
  if (!tf) return null;
  if (tf.bid != null) { const town = data.townOf(tf.bid); if (town) return town; }
  const s = tf.scope;
  if (s && s.kind === 'area') return s.town || null;
  if (s && s.kind === 'towns' && s.towns.length === 1) return s.towns[0];
  return null;
}

/** "≈ Typical 4-room in Ang Mo Kio: S$612,000 — pick a block to use a real one." note (empty for a real flat). */
export function defaultNote(tf) {
  if (!tf || !tf.isDefault) return '';
  return `<p class="default-note" role="note"><span class="dn-ic" aria-hidden="true">≈</span>
    <span>${esc(t('Typical {0} in {1}: {2} — pick a block to use a real one.', [ftWord(tf.flatType), tf.scope.label, '\u0000']))
      .replace('\u0000', `<b>${money(tf.price)}</b>`)}</span>
    <small>${esc(t('Median of {0} sales, {1} – {2}.', [tf.n.toLocaleString('en-SG'), monthLabel(tf.from), monthLabel(tf.to)]))}</small>
    <button type="button" class="link" data-act="pick-map">${t('Pick on the map →')}</button></p>`;
}

/** Wire "Pick on the map →" buttons inside root: go to Explore (phone: the Map tab with the sheet at peek). */
export function bindPickMap(root) {
  root.addEventListener('click', (e) => {
    if (!e.target.closest('[data-act="pick-map"]')) return;
    bus.emit('nav:goto', { tab: 'explore' });
    bus.emit('phone:show-map', {}); // no-op on desktop
  });
}
