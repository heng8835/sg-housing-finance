/* HDB Resale Comparer — vanilla JS, Leaflet. Data from data.js (window.HDB_DATA) and
   optional poi.js (window.HDB_POI). All computation is client-side. */
import { feature } from '../../core/features.js'; // DEC-015 feature switches
import { LATE_FILES, isSettled } from '../../core/data-loader.js'; // S1b lazy data: files that arrive after the first map paint
import { stampComparer } from '../../core/blockkey.js'; // stable block ids (go-live F2)
import { loadTownAliases, zhTownSearch, zhTownRow } from '../../core/townalias.js'; // 7b B15: 中文 town names in the map search
import { shareUrl, readShareHash } from './share.js'; // every URL built from user state (privacy test)
import { buildPlaceIndex, searchPlaces, MISS_MIN } from '../../core/placesearch.js';
import { canon, tokens, hits, rankOf, titleCase, tidyName } from '../../core/searchnorm.js'; // 7c C3: one search normaliser // Daily places search: our own data only
import { remainingLease, coversToAge } from '../../engine/lease.js';
import { summarise } from '../../engine/household.js';
import { fillLink, householdLink, FLAT_INPUT } from '../../core/filllink.js'; // empty-state cells link to the missing input
import { t, currentLang } from '../../core/i18n.js';
import { flatTypeLabel, storeyLabel, storeyRange } from '../../core/flattype.js'; // S1a: '4 ROOM' → '4-room', '31 TO 33' → 'storey 31–33'
import { COLOR as BLOCK_COLOR, CHIP_ZOOM, quantileScale, dotOptions as dotOpts, dotBand as dotBandOf, glyphScale, chipSize, placeChips, textWidth, installChipMarker, legendHtml, shortValue, chipMetric, syncChipLabel } from './blocks.js';
import { createCard, wireSeg } from './card.js';
import { mountPeriod, calcLabel } from './period.js';
import { createSelection } from './selection.js';
import { createMapSheet, peekSummary, peekLegend, kindLabel } from './mapsheet.js'; // phones: map sheet content (peek, Map settings, Blocks here, popups)
import { flatsLine } from './mapsettings.js'; // P8 8c: phones, the "Which flats" line in Map settings (M-04)
import { inPoly, polyAreaKm2, tooSmall, roundPts } from './areasheet.js'; // drawn-area maths shared by desktop and phones
import { createCommute } from './commute.js';
import { mountFamily } from './family.js';
import { createHexGrid } from './hexgrid.js'; import { createViews } from './views.js';
import { createComparables, premiumFlag } from './comparables.js';
import { createPriorities } from './priorities.js'; import { createPlaces } from './places.js'; // 7b B1 priorities, B12 daily-place kinds
import { createCompareCards } from './cmpcards.js'; // phones: Compare as one card per flat inside My choices
import { offerUndo } from '../../core/undo.js'; import { searchShortcuts, groupHead } from './searchshortcuts.js'; // P8 8d: M-17 Undo line, M-13 search shortcuts
import { createFutureValue } from './futurevalue-ui.js';
import { createQuickAdd } from './quickadd.js'; // P8 8b: M-05 quick add from a block
import { presetChips, presetIdx } from './ftpresets.js'; // 7c C11: "2–3 room" / "4 room +" one tap
import { createBrief, pickRows } from './brief.js'; import { createCpfLife } from './cpflife.js'; import { createHandoff, flashForm, FLASH_MS } from './handoff.js'; import { createMoney, SIMPLE_MONEY_KEYS } from './money.js'; import { createFamilyRows } from './familyrows.js';

export function startExplore({ policy, store, bus }) {
  const D = window.HDB_DATA;
  let POI = window.HDB_POI || { schools: [], hawkers: [] }; // late file (S1b): re-bound by bindLate()
  if (!D) { document.getElementById('dataInfo').textContent = t('data.js missing — run tools/build_data.py'); return; }

  // ------------------------------------------------------------------ helpers
  const $ = (id) => document.getElementById(id);
  const fmt = {
    money: (v) => v == null ? '—' : 'S$' + Math.round(v).toLocaleString(),
    k: (v) => v == null ? '—' : 'S$' + (v / 1000).toFixed(0) + 'k',
    psf: (v) => v == null ? '—' : t('{0} psf', ['S$' + Math.round(v).toLocaleString()]),
    pct: (v, d = 1) => v == null ? '—' : (v > 0 ? '+' : '') + (v * 100).toFixed(d) + '%',
    num: (v, d = 0) => v == null ? '—' : Number(v).toFixed(d),
    m: (v) => v == null ? '—' : v < 1000 ? t('{0} m', [Math.round(v)]) : t('{0} km', [(v / 1000).toFixed(1)]),
    yrs: (v) => v == null ? '—' : t('{0} y', [v.toFixed(1)]),
  };
  // display-only labels for data codes (data stays English; lookups keep using the codes)
  const ftName = (i) => flatTypeLabel(D.flat_types[i]);
  const distTo = (d, place) => t('{d} to {place}', { d: fmt.m(d), place }); // "350 m to Northpoint"
  const storeyName = storeyLabel;
  const title = titleCase; // "St. Hilda's", "C'wealth" (7c C3)
  const median = (arr) => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); const h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
  const haversine = (la1, lo1, la2, lo2) => { const R = 6371000, r = Math.PI / 180, dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r; const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); };
  const nearest = (lat, lon, pts) => { let best = null, bd = Infinity; for (const p of pts) { const d = haversine(lat, lon, p.lat, p.lon); if (d < bd) { bd = d; best = p; } } return best ? { p: best, d: bd } : null; };
  const within = (lat, lon, pts, r) => pts.filter((p) => haversine(lat, lon, p.lat, p.lon) <= r);
  const stn = (n) => title(String(n).replace(/\s*MRT STATION\s*$/i, '').replace(/\s*LRT STATION\s*$/i, ''));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // ------------------------------------------------------------------ data prep
  const N = D.tx.p.length;
  const TX = { b: Int32Array.from(D.tx.b), m: Int16Array.from(D.tx.m), ft: Int8Array.from(D.tx.ft), s: Int8Array.from(D.tx.s), a: Int16Array.from(D.tx.a), mo: Int8Array.from(D.tx.mo), ly: Int16Array.from(D.tx.ly), p: Int32Array.from(D.tx.p) };
  const PSF = new Float32Array(N); for (let i = 0; i < N; i++) PSF[i] = TX.p[i] / (TX.a[i] * 10.7639);
  const SQFT = 10.7639;
  const NB = D.blocks.length, NM = D.months.length;
  const blockTx = Array.from({ length: NB }, () => []);
  for (let i = 0; i < N; i++) blockTx[TX.b[i]].push(i);
  const blockLease = new Int16Array(NB);
  D.blocks.forEach((b, bi) => { const c = {}; let best = 0, bl = 0; for (const i of blockTx[bi]) { const y = TX.ly[i]; c[y] = (c[y] || 0) + 1; if (c[y] > best) { best = c[y]; bl = y; } } blockLease[bi] = bl || b.yc || 0; b.lease = blockLease[bi]; b.addr = b.b + ' ' + D.streets[b.s]; b.label = b.b + ' ' + title(D.streets[b.s]); });
  const storeyMid = D.storeys.map((s) => { const m = s.match(/(\d+)\s*TO\s*(\d+)/); return m ? (+m[1] + +m[2]) / 2 : null; });
  const storeyHi = D.storeys.map((s) => { const m = s.match(/(\d+)\s*TO\s*(\d+)/); return m ? +m[2] : null; });
  const blockTop = new Int16Array(NB); for (let i = 0; i < N; i++) { const h = storeyHi[TX.s[i]] || 0; if (h > blockTop[TX.b[i]]) blockTop[TX.b[i]] = h; }
  const storeyChoices = D.storeys.map((s, i) => ({ s, i })).filter(({ s }) => { const m = s.match(/(\d+)\s*TO\s*(\d+)/); return m && +m[2] - +m[1] === 2; });
  const zoneOrder = ['Central', 'East', 'North-East', 'North', 'West', 'Unknown'];
  const townsByZone = {}; D.towns.forEach((t, i) => { (townsByZone[D.zones[i]] = townsByZone[D.zones[i]] || []).push(i); });
  const lastMonthIdx = NM - 1;
  const today = new Date();
  const LEASE_TERM = policy.get('lease.term.years'), CPF_AGE = policy.get('cpf.lease.cover_to_age'), CPF_MIN_LEASE = policy.get('cpf.lease.min_years');
  const RESALE_WATCH_LEASE = 60, BUDGET_STRETCH = 0.1; // UI heuristics, not rules
  const BUDGET_COLORS = { within: '#1f9d6b', near: '#e3a008', over: '#c9c8c2' };
  // Simple mode shows only these compare rows (Pro shows all); empty sections are dropped
  const SIMPLE_KEYS = new Set(['Asking price', '$ per sqft', 'Premium vs. recent sales', ...SIMPLE_MONEY_KEYS, 'Remaining lease today', 'Lease covers youngest owner to 95', 'Nearest MRT', 'Primary schools within 1 km', 'Workplaces']);
  const simpleRows = (rows) => pickRows(rows, SIMPLE_KEYS, store.get('ui.mode')); // ./brief.js (same rule for the brief)
  store.subscribe('ui', () => renderCompare());
  // HDB rents (data/rents.js): block × flat type → [n, p25, med, p75, last, n24?, p25_24?, med24?, p75_24?]
  let RENTS = window.HDB_RENTS || null; // late file (S1b): re-bound by bindLate()
  const lateRents = { get blocks() { return RENTS ? RENTS.blocks : undefined; }, get towns() { return RENTS ? RENTS.towns : undefined; }, get quarters() { return RENTS ? RENTS.quarters : undefined; } }; // card: always current
  function blockRent(bi) {
    const r = RENTS && RENTS.blocks[String(bi)]; if (!r) return null;
    let w = 0, sum = 0;
    for (const fi of S.ft) { const row = r[D.flat_types[fi]]; if (!row) continue; const n = row[0] || row[5] || 0, med = row[2] ?? row[7]; if (med != null && n) { w += n; sum += med * n; } }
    return w ? sum / w : null;
  }
  // Share: the shortlist goes in the URL #fragment (never sent to a server) — flats only, no nicknames,
  // listing links, income or CPF. Opening such a link offers to add the flats.
  const shareLink = () => shareUrl(S.choices, D, location); // ./share.js: [block|street key, flat type, storey range, sqm, price, facing]
  function importShared() {
    const got = readShareHash(location.hash, D); if (!got) return;
    history.replaceState(null, '', location.pathname);
    if (got.error) return showBanner(t('That shared link could not be read.'));
    const rows = got.rows; // key rows + old index rows, at most 12
    if (!rows.length || !confirm(rows.length > 1 ? t('Add {0} shared flats to your shortlist?', [rows.length]) : t('Add {0} shared flat to your shortlist?', [rows.length]))) return;
    rows.forEach(({ bid, ft, storey, sqm, price, facing }, i) => S.choices.push({ id: S.nextId++, bid, ft, storey, sqm, price, facing, name: t('Shared {0} — {1}', [i + 1, D.blocks[bid].label]), url: '' }));
    save(); renderChoices(); showTab('choices');
  }
  // compare-table rows → glossary entries (Learn side sheet)
  const ROW_TERMS = { '$ per sqft': 'psf', 'Recent sales benchmark': 'fair-value', 'Premium vs. recent sales': 'fair-value', 'Over-priced? (vs comparable sales)': 'fair-value', 'Possible COV (if valued at recent sales)': 'cov', 'Remaining lease today': 'remaining-lease', 'Lease covers youngest owner to 95': 'lease-to-95', 'Lease in 10 years (when you may sell)': 'lease-decay' };
  const pct = (x) => `${+(x * 100).toFixed(1)}%`, pct0 = (x) => `${(x * 100).toFixed(0)}%`;
  const leaseYearsLeft = (b) => remainingLease(b.lease, today, LEASE_TERM);
  const primaryLike = (s) => /^PRIMARY|MIXED LEVEL \(P/.test(s.lvl);
  // late data (S1b, core/data-loader.js LATE_FILES): poi.js, rents.js, bus_routes.js arrive after the first map paint;
  // bindLate() (again on bus 'data:more') re-reads them — until then the lists are empty and rows say "Loading…"
  const lateWait = (file) => LATE_FILES.includes(file) && !isSettled(file);
  let primarySchools, secondarySchools, BR, MALLS, SUPERS, CC, EC, FUN, PARKS, SITES, BUS, FOOD;
  function bindLate() {
    POI = window.HDB_POI || { schools: [], hawkers: [] }; RENTS = window.HDB_RENTS || null;
    primarySchools = POI.schools.filter((s) => s.lvl === 'PRIMARY');
    secondarySchools = POI.schools.filter((s) => /^SECONDARY|MIXED LEVEL|JUNIOR COLLEGE|CENTRALISED/.test(s.lvl));
    POI.schools.forEach((s) => { if (primaryLike(s) && s.lvl !== 'PRIMARY' && !primarySchools.includes(s)) primarySchools.push(s); }); // P1-S4 mixed schools count for P1 priority too
    BR = window.HDB_BUS || { routes: [], stops: {} };
    MALLS = POI.malls || []; SUPERS = POI.supermarkets || [];
    CC = POI.childcare || []; EC = POI.eldercare || []; FUN = POI.funeral || []; PARKS = POI.parks || []; SITES = POI.sites || []; BUS = POI.bus || []; FOOD = POI.food || [];
  }
  bindLate();
  const FUT = window.HDB_FUTURE || { stations: [], lines: [] }; const FUTST = FUT.stations.filter((x) => x.future);
  // btoData switch (core/features.js, DEC-015): off → no BTO layer / legend row / popups / search hits / compare row,
  // future-value supply = MOP wave only; HDB_BTO is never read
  const BTO_ON = feature('btoData');
  const BTOP = BTO_ON ? (window.HDB_BTO || { projects: [] }).projects : [];
  const stopCode = (b) => (b.c || (String(b.n).match(/(\d{5})/) || [])[1] || '');
  const FACING = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
  const bearing = (la1, lo1, la2, lo2) => { const r = Math.PI / 180, dLo = (lo2 - lo1) * r, y = Math.sin(dLo) * Math.cos(la2 * r), x = Math.cos(la1 * r) * Math.sin(la2 * r) - Math.sin(la1 * r) * Math.cos(la2 * r) * Math.cos(dLo); return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360; };
  const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  // nearest point within a bearing sector (±half°) and radius r — for "what is in front of the windows"
  const nearestInSector = (lat, lon, pts, brg, half, r) => { let best = null, bd = Infinity; for (const p of pts) { const d = haversine(lat, lon, p.lat, p.lon); if (d > r || d >= bd || d < 1) continue; if (angDiff(bearing(lat, lon, p.lat, p.lon), brg) <= half) { bd = d; best = p; } } return best ? { p: best, d: bd } : null; };
  // distance from a point to a polygon ring (list of [lat, lon]) — min over edges, equirectangular metres
  const distToRing = (lat, lon, ring) => { const k = 111320, kx = k * Math.cos(lat * Math.PI / 180); let best = Infinity; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; const ax = (a[1] - lon) * kx, ay = (a[0] - lat) * k, bx = (b[1] - lon) * kx, by = (b[0] - lat) * k; const dx = bx - ax, dy = by - ay; const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0; const px = ax + t * dx, py = ay + t * dy; best = Math.min(best, Math.hypot(px, py)); } return best; };
  const nearestPark = (lat, lon) => { let best = null, bd = Infinity; for (const p of PARKS) { if (Math.abs(p.lat - lat) > 0.03 || Math.abs(p.lon - lon) > 0.03) continue; const d = distToRing(lat, lon, p.ring); if (d < bd) { bd = d; best = p; } } return best ? { p: best, d: bd } : null; };
  const parkInSector = (lat, lon, brg, half, r) => { for (const p of PARKS) { if (Math.abs(p.lat - lat) > 0.01 || Math.abs(p.lon - lon) > 0.01) continue; for (const v of p.ring) { const d = haversine(lat, lon, v[0], v[1]); if (d <= r && angDiff(bearing(lat, lon, v[0], v[1]), brg) <= half) return { p, d }; } } return null; };
  const fmtMonth = (mi) => { const [y, m] = D.months[mi].split('-'); return new Date(+y, +m - 1, 1).toLocaleString(currentLang() === 'zh' ? 'zh-SG' : 'en-SG', { month: 'short', year: 'numeric' }); };

  // ------------------------------------------------------------------ state
  const CHOICE_COLORS = ['#eb6834', '#4a3aa7', '#1baf7a', '#e87ba4', '#eda100', '#e34948'];
  const familyFt = D.flat_types.map((f, i) => i).filter((i) => /4 ROOM|5 ROOM|EXECUTIVE|MULTI/.test(D.flat_types[i]));
  // lean default layers (UI/UX review 2026-10-07): blocks, MRT, future MRT, primary schools + the user's own;
  // bumping LAYERS_V resets saved layer choices once (owner decision). New layer keys need no bump:
  // saved layers are merged over these defaults, so a key the user never saw starts off.
  const LAYERS_V = 2;
  const defaults = () => ({
    colorBy: 'price', chipLabel: 'block', ft: familyFt.slice(), mFrom: Math.max(0, NM - 12), mTo: NM - 1, filt: { pmin: null, pmax: null, lmin: null, lmax: null, amin: null, amax: null, smin: null, smax: null, ymin: null, ymax: null },
    towns: D.towns.map((_, i) => i), layers: { blocks: true, futmrt: true, bto: false, malls: false, supermarkets: false, mrt: true, schools: true, secondary: false, hawkers: false, parks: false, childcare: false, polyclinics: false, clinics: false, flood: false, eldercare: false, funeral: false, sites: false, bus: false, food: false, work: true, choices: true, rings: true }, layersV: LAYERS_V,
    profile: { income: null, cash: null, age: null, grants: null, loan: 'hdb', tenure: 25 }, workplaces: [], choices: [], nextId: 1,
  });
  let S = defaults();
  try { const saved = JSON.parse(localStorage.getItem('hdb-comparer') || 'null'); if (saved) S = Object.assign(defaults(), saved, { layers: Object.assign(defaults().layers, saved.layers || {}), profile: Object.assign(defaults().profile, saved.profile || {}), filt: Object.assign(defaults().filt, saved.filt || {}) }); if (saved && saved.layersV !== LAYERS_V) { S.layers = defaults().layers; S.layersV = LAYERS_V; } if (S.mTo >= NM) { S.mTo = NM - 1; S.mFrom = Math.max(0, NM - 12); } } catch (e) { /* ignore */ }
  const save = debounce(() => { try { localStorage.setItem('hdb-comparer', JSON.stringify(stampComparer(S, D))); /* + block|street keys (core/blockkey.js) */ } catch (e) { /* ignore */ } }, 200);
  // "Commute to…" colour mode + compare rows (commute.js); hub ids live in S → localStorage only
  const makeCommute = () => createCommute({ data: window.HDB_COMMUTE || null, pending: lateWait('data/commute.js'), getHubs: () => S.commuteHubs || [], setHubs: (ids) => { S.commuteHubs = ids; save(); }, onChange: () => { renderBlocks(); renderCompare(); },
    getMax: () => S.commuteMax, setMax: (v) => { S.commuteMax = v; save(); }, active: () => S.colorBy === 'commute', blocks: D.blocks }); let commute = makeCommute(); // S1b: re-made when commute.js arrives; B8 filter "Only show blocks within N min"

  // ------------------------------------------------------------------ aggregation
  // shared filter predicates (More filters): per-transaction and per-block
  function txOk(i) { const f = S.filt; if (f.pmin != null && TX.p[i] < f.pmin) return false; if (f.pmax != null && TX.p[i] > f.pmax) return false; if (f.amin != null && TX.a[i] < f.amin) return false; if (f.amax != null && TX.a[i] > f.amax) return false; const sm = storeyMid[TX.s[i]]; if (f.smin != null && sm != null && sm < f.smin) return false; if (f.smax != null && sm != null && sm > f.smax) return false; return true; }
  function blockOk(b) { const f = S.filt; if (f.lmin != null || f.lmax != null) { if (!b.lease) return false; const l = leaseYearsLeft(b); if (f.lmin != null && l < f.lmin) return false; if (f.lmax != null && l > f.lmax) return false; } const y = b.yc || b.lease; if (f.ymin != null && (!y || y < f.ymin)) return false; if (f.ymax != null && (!y || y > f.ymax)) return false; return commute.keep(b); } // B8: + commute ≤ N min
  const filtActive = () => Object.values(S.filt).some((v) => v != null) || commute.filterOn();
  function aggregateBlocks() {
    const ftSet = new Set(S.ft), townSet = new Set(S.towns);
    const out = new Array(NB);
    for (let bi = 0; bi < NB; bi++) {
      if (!townSet.has(D.blocks[bi].t) || !blockOk(D.blocks[bi])) { out[bi] = null; continue; }
      const psfs = [], prices = [];
      for (const i of blockTx[bi]) { if (TX.m[i] < S.mFrom || TX.m[i] > S.mTo || !ftSet.has(TX.ft[i]) || !txOk(i)) continue; psfs.push(PSF[i]); prices.push(TX.p[i]); }
      out[bi] = psfs.length ? { n: psfs.length, psf: median(psfs), price: median(prices), prices, psfs } : null; // arrays: hex medians over transactions (./hexgrid.js)
    }
    return out;
  }
  // stats for a block or town, restricted to flat type and a month window
  function statsFor(indices, ft, mFrom, mTo) {
    const psfs = [], prices = []; let last = null;
    for (const i of indices) { if (TX.m[i] < mFrom || TX.m[i] > mTo || (ft != null && TX.ft[i] !== ft)) continue; psfs.push(PSF[i]); prices.push(TX.p[i]); if (!last || TX.m[i] >= TX.m[last]) last = i; }
    return { n: psfs.length, psf: median(psfs), price: median(prices), last };
  }
  const townTxCache = {};
  function townTx(ti) { if (!townTxCache[ti]) { const a = []; for (let i = 0; i < N; i++) if (D.blocks[TX.b[i]].t === ti) a.push(i); townTxCache[ti] = a; } return townTxCache[ti]; }
  function trend(indices, ft, yearsBack) { const now = statsFor(indices, ft, lastMonthIdx - 11, lastMonthIdx); const then = statsFor(indices, ft, lastMonthIdx - 11 - yearsBack * 12, lastMonthIdx - yearsBack * 12); if (now.n < 3 || then.n < 3) return null; return now.psf / then.psf - 1; }

  // ------------------------------------------------------------------ map
  const canvas = L.canvas({ padding: 0.3 }); // ONE shared canvas for every vector layer — a second canvas would sit on top and swallow clicks
  const map = L.map('map', { zoomControl: true, preferCanvas: true, renderer: canvas, maxZoom: 21 }).setView([1.3521, 103.8198], 12);
  // desktop: the side panel floats over the map (base.css --cover) — "zoom to" actions and popups use the uncovered part
  const panelCover = () => (innerWidth > 900 && !$('app').classList.contains('panel-hidden') ? $('panel').offsetWidth : 0);
  const viewTo = (ll, z) => { map.setView(ll, z, { animate: false }); const w = panelCover(); if (w) map.panBy([-w / 2, 0], { animate: false }); };
  const fitTo = (b) => map.fitBounds(b, { paddingTopLeft: [panelCover(), 0] });
  const coverPopups = () => { L.Popup.prototype.options.autoPanPaddingTopLeft = L.point(panelCover() + 10, 10); };
  L.DomEvent.disableClickPropagation(document.querySelector('.mapbar')); L.DomEvent.disableScrollPropagation(document.querySelector('.mapbar'));
  ['areaBox', 'panelToggle', 'drawnStrip'].forEach((id) => { const el = document.getElementById(id); L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el); });
  L.tileLayer('https://www.onemap.gov.sg/maps/tiles/Grey/{z}/{x}/{y}.png', { attribution: '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" alt="" style="height:14px;width:14px;vertical-align:middle"> <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a> &copy; <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener">SLA</a> &copy; OpenStreetMap', minZoom: 11, maxNativeZoom: 19, maxZoom: 21 }).addTo(map); // OneMap tiles stop at 19 — upscale beyond
  map.setMaxBounds([[1.15, 103.55], [1.50, 104.10]]);
  window.hdbMap = map; // debugging handle
  // phones (≤ 767 px): what the map sheet shows (./mapsheet.js); every call is a no-op on desktop
  const msheet = createMapSheet({ bus, map, canvas, hooks: {
    fitChoices: () => $('fitChoices').click(), fitSg: () => $('fitSg').click(), setLayers: (o) => { Object.assign(S.layers, o); applyLayers(); save(); } /* P8 8c: a layer group's switch (no zoom jump) */, hasArea: () => !!S.area, area: () => S.area, openBlock: (bi) => openBlock(bi), relayout: () => { renderLegend(); renderArea(); },
    // phones: "Area prices" (./areasheet.js) — finger drawing through the desktop draw mode, the same areaStats / S.area
    draw: { start: () => startDraw({ keep: true, ext: true }), stop: () => stopDraw(), commit: (pts) => commitPoly(pts) },
    areaInfo: () => { const A = S.area, base = { types: S.ft.length === D.flat_types.length ? t('All flat types') : S.ft.length > 2 ? t('{0} flat types', [S.ft.length]) : [...S.ft].sort((a, b) => a - b).map(ftName).join(', '), names: [...S.ft].sort((a, b) => a - b).map(ftName), all: S.ft.length === D.flat_types.length, period: calcLabel(S.calcM), k: fmt.k, pct: fmt.pct };
      if (A) return { ...base, kind: A.type === 'circle' ? 'circle' : 'poly', title: areaTitle(), km2: A.type === 'circle' ? null : polyAreaKm2(A.pts), st: areaStats(areaPred()) };
      if (map.getZoom() < 14) return { ...base, kind: 'out' };
      const bb = map.getBounds(); return { ...base, kind: 'view', st: areaStats((b) => bb.contains([b.lat, b.lon])) }; },
    inView: () => { const bb = map.getBounds(), out = []; for (let bi = 0; bi < NB; bi++) { const b = D.blocks[bi]; if (blockInfo[bi] && bb.contains([b.lat, b.lon])) out.push({ id: bi, lat: b.lat, lon: b.lon }); } return out; },
    blockRow: (bi) => { const info = blockInfo[bi] || {}; return { label: D.blocks[bi].label, value: info.a ? t('median {0} · {1} sales', [fmt.k(info.a.price), info.a.n]) : info.kind === 'new' ? t('New block, no resale yet') : t('No sales match your filters') }; },
  } });
  const tapOr = (click, tap) => t(msheet.phone() ? tap : click); // P-22: "tap" wording on phones
  const popAt = (ll, html, maxWidth, title) => msheet.pop(html, title) || L.popup({ maxWidth }).setLatLng(ll).setContent(html).openOn(map).getElement(); // phones: a sheet view at half (P-23)
  let tileErr = 0; map.on('tileerror', () => { if (++tileErr === 3) showBanner(navigator.onLine === false ? t('Map tiles need a connection. Your data, filters and comparison still work offline.') : t('Map tiles could not load (offline or blocked). Data, filters and comparison still work.')); }); // tiles are never cached (sw.js)
  function showBanner(msg, act) { // act = { label, run } adds one link button
    const b = $('banner'); b.textContent = msg;
    if (act) { const x = document.createElement('button'); x.type = 'button'; x.className = 'link'; x.textContent = act.label; x.onclick = () => { b.classList.remove('show'); act.run(); }; b.append(' ', x); }
    b.classList.add('show'); clearTimeout(showBanner.timer); showBanner.timer = setTimeout(() => b.classList.remove('show'), act ? 12000 : 8000);
  }
  // Icon glyphs (24x24 Material-style paths) drawn straight onto the canvas renderer, so even
  // 9k eateries stay fast. GlyphMarker = CircleMarker (hit-test by radius) with custom paint.
  const GLYPH = {
    mrt: { d: 'M12 2c-4 0-8 .5-8 4v9.5A3.5 3.5 0 0 0 7.5 19L6 20.5V21h12v-.5L16.5 19a3.5 3.5 0 0 0 3.5-3.5V6c0-3.5-4-4-8-4zM7.5 17a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3.5-6H6V6h5v5zm5.5 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm1.5-6h-5V6h5v5z', color: '#4a3aa7', r: 8.5, label: 'MRT / LRT station' },
    bus: { d: 'M4 16c0 .88.39 1.67 1 2.22V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm1.5-6H6V6h12v5z', color: '#52514e', r: 6.5, label: 'Bus stop' },
    schools: { d: 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3 1 9l11 6 9-4.91V17h2V9L12 3z', color: '#008300', r: 7.5, label: 'Primary school' },
    secondary: { d: 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3 1 9l11 6 9-4.91V17h2V9L12 3z', color: '#5fb35f', r: 7, label: 'Secondary school' },
    hawkers: { d: 'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z', color: '#eda100', r: 7.5, label: 'Hawker centre' },
    childcare: { d: 'M12 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm-2 4.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM9 9.5h6a3 3 0 0 1-6 0zM4 21a8 8 0 0 1 16 0v1H4v-1z', color: '#1baf7a', r: 6.5, label: 'Childcare / kindergarten' },
    eldercare: { d: 'M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9.8 8.9 7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3A7.3 7.3 0 0 0 19 13v-2a5.4 5.4 0 0 1-4.5-2.2l-1-1.6a2 2 0 0 0-1.7-1c-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7z', color: '#e87ba4', r: 7, label: 'Eldercare centre' },
    funeral: { d: 'M12 1.5c1.6 2.2 2.6 3.8 2.6 5.3A2.6 2.6 0 0 1 12 9.4a2.6 2.6 0 0 1-2.6-2.6c0-1.5 1-3.1 2.6-5.3zM8.5 11h7v11.5h-7z', color: '#7a1f1f', r: 7.5, label: 'Funeral parlour / columbarium / cemetery' },
    food: { d: 'M20 3H4v10c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4v-3h2c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 5h-2V5h2v3zM4 19h16v2H4z', color: '#eb6834', r: 6, label: 'Café / eatery' },
    work: { d: 'M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 0h-4V4h4v2z', color: '#0b0b0b', r: 10, label: 'Workplace / daily place' },
    malls: { d: 'M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-8 0c0-1.1.9-2 2-2s2 .9 2 2h-4zm8 14H6V8h2v2c0 .55.45 1 1 1s1-.45 1-1V8h4v2c0 .55.45 1 1 1s1-.45 1-1V8h2v12z', color: '#7c3aed', r: 7.5, label: 'Shopping mall' },
    supermarkets: { d: 'M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 20 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z', color: '#0e7490', r: 6.5, label: 'Supermarket' },
    futmrt: { d: 'M12 2c-4 0-8 .5-8 4v9.5A3.5 3.5 0 0 0 7.5 19L6 20.5V21h12v-.5L16.5 19a3.5 3.5 0 0 0 3.5-3.5V6c0-3.5-4-4-8-4zM7.5 17a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3.5-6H6V6h5v5zm5.5 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm1.5-6h-5V6h5v5z', color: '#0aa3a3', r: 8.5, dashed: true, label: 'Future MRT station' },
    bto: { d: 'M13.78 15.17l2.12-2.12 6 6-2.12 2.12zM17.5 10c1.93 0 3.5-1.57 3.5-3.5 0-.58-.16-1.12-.41-1.6l-2.7 2.7-1.49-1.49 2.7-2.7c-.48-.25-1.02-.41-1.6-.41C15.57 3 14 4.57 14 6.5c0 .41.08.8.21 1.16l-1.85 1.85-1.78-1.78.71-.71-1.41-1.41L12 3.49a3 3 0 0 0-4.24 0L4.22 7.03l1.41 1.41H2.81L2.1 9.15l3.54 3.54.71-.71V9.15l1.41 1.41.71-.71 1.78 1.78-7.41 7.41 2.12 2.12L16.34 9.79c.36.13.75.21 1.16.21z', color: '#b45309', r: 8.5, label: 'BTO / under construction' },
  };
  Object.values(GLYPH).forEach((g) => { g.path = new Path2D(g.d); });
  L.Canvas.include({
    _updateGlyph(layer) {
      if (!this._drawing || layer._empty()) return;
      const ctx = this._ctx, p = layer._point, r = layer._radius, g = layer.options.glyph;
      ctx.save();
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 1, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();          // white ring
      if (g.dashed) { ctx.beginPath(); ctx.arc(p.x, p.y, r + 2.5, 0, Math.PI * 2); ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = layer.options.fillColor || g.color; ctx.stroke(); ctx.setLineDash([]); }
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = layer.options.fillColor || g.color; ctx.fill();
      const k = (r * 1.55) / 24; ctx.translate(p.x - r * 0.775, p.y - r * 0.775); ctx.scale(k, k); ctx.fillStyle = '#fff'; ctx.fill(g.path);
      ctx.restore();
    },
  });
  const GlyphMarker = L.CircleMarker.extend({
    _project() { this._radius = this.options.radius * glyphScale(this._map.getZoom()); L.CircleMarker.prototype._project.call(this); }, // bigger when zoomed in
    _updatePath() { this._renderer._updateGlyph(this); },
  });
  const glyph = (kind, p, extra) => new GlyphMarker([p.lat, p.lon], Object.assign({ renderer: canvas, radius: GLYPH[kind].r, glyph: GLYPH[kind], fillColor: GLYPH[kind].color, interactive: true }, extra || {}));
  const swatch = (kind, size = 14) => { const g = GLYPH[kind]; return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="vertical-align:middle;flex:none"><circle cx="12" cy="12" r="12" fill="${g.color}"/><g transform="translate(3 3) scale(.75)"><path d="${g.d}" fill="#fff"/></g></svg>`; };
  const layers = { blocks: L.layerGroup(), parks: L.layerGroup(), sites: L.layerGroup(), malls: L.layerGroup(), supermarkets: L.layerGroup(), mrt: L.layerGroup(), futmrt: L.layerGroup(), bto: L.layerGroup(), schools: L.layerGroup(), secondary: L.layerGroup(), hawkers: L.layerGroup(), childcare: L.layerGroup(), eldercare: L.layerGroup(), funeral: L.layerGroup(), bus: L.layerGroup(), food: L.layerGroup(), work: L.layerGroup(), choices: L.layerGroup(), rings: L.layerGroup() };
  window.hdbLayers = layers; // debugging handle
  if (!BTO_ON) { delete layers.bto; document.querySelector('#layers input[data-l="bto"]')?.closest('label')?.remove(); } // layer + legend row
  const ZOOM_GATED = { bus: 14, food: 15, childcare: 14, supermarkets: 13 }; const LAYER_NAMES = { bus: 'bus stops', food: 'cafés & eateries', childcare: 'childcare centres', supermarkets: 'supermarkets' };
  // family & health layers (./family.js): ECDA childcare vacancies, polyclinics, CHAS clinics, flood-prone points
  const fam = mountFamily({ L, map, canvas, t, esc, phone: () => msheet.phone() }); // phones: a tap → one-line row, no popup Object.assign(layers, fam.layers); Object.assign(ZOOM_GATED, fam.zoomGated); Object.assign(LAYER_NAMES, fam.layerNames);
  const routeLayer = L.layerGroup().addTo(map); const drawnRoutes = new Map();
  // Blocks are drawn by ./blocks.js: one calm blue scale, dots sized by zoom, number boxes from CHIP_ZOOM.
  const chipMarker = installChipMarker(L);
  let blockAgg = [], blockMarkers = [], blockInfo = [], colorScale = null, openBis = new Set(); // blocks with an open card (./dock.js)
  const dotGroup = L.featureGroup().addTo(layers.blocks), chipGroup = L.featureGroup().addTo(layers.blocks);

  const POI_LAYERS = ['schools', 'secondary', 'supermarkets', 'malls', 'hawkers', 'childcare', 'eldercare', 'funeral', 'parks', 'sites', 'bus', 'food'];
  function buildStaticLayers(poiOnly = false) { // poiOnly: poi.js arrived after the first paint (S1b) → redraw its layers only
    if (poiOnly) POI_LAYERS.forEach((k) => { if (layers[k] && !Object.values(fam.layers).includes(layers[k])) layers[k].clearLayers(); });
    const clickLines = t('click for lines');
    if (!poiOnly) D.mrt.stations.forEach((st, i) => { const m = glyph('mrt', st).bindTooltip(`<div class="poi-tip"><b>${esc(stn(st.n))}</b><br>${esc(st.codes.join(' · '))} · ${clickLines}</div>`); m.on('click', () => openStation(i)); m.addTo(layers.mrt); });
    const tip = (fn) => (p) => `<div class="poi-tip">${fn(p)}</div>`;
    if (!poiOnly) FUTST.forEach((st) => { const m = glyph('futmrt', st).bindTooltip(tip((x) => `<b>${esc(x.n)}</b> ${t('(future)')}<br>${x.lines.length ? x.lines.join(', ') + ' · ' : ''}${t(x.status)}${x.year ? ' · ' + x.year : ''}`)(st)); m.on('click', () => openFutureStation(st)); m.addTo(layers.futmrt); });
    if (!poiOnly) BTOP.forEach((p) => { const m = glyph('bto', p).bindTooltip(tip((x) => `<b>${esc(x.n)}</b><br>BTO · ${x.units ? t('{0} units', [x.units]) : ''}${x.approx ? ' · ' + t('location approx.') : ''}`)(p)); m.on('click', () => openBto(p)); m.addTo(layers.bto); });
    primarySchools.forEach((p) => glyph('schools', p).bindTooltip(tip((x) => `<b>${esc(x.n)}</b><br>${esc(x.type || '')}`)(p)).addTo(layers.schools));
    secondarySchools.forEach((p) => glyph('secondary', p).bindTooltip(tip((x) => `<b>${esc(x.n)}</b><br>${esc(x.lvl.toLowerCase())} · ${esc(x.type || '')}`)(p)).addTo(layers.secondary));
    const L_SUPER = t('supermarket'), L_MALL = t('shopping mall'), L_HAWKER = t('Hawker centre'), L_ELDER = t('eldercare centre');
    SUPERS.forEach((p) => glyph('supermarkets', p).bindTooltip(tip((x) => `<b>${esc(x.n)}</b><br>${L_SUPER}${x.b && x.b !== x.n ? ' · ' + esc(x.b) : ''}`)(p)).addTo(layers.supermarkets));
    MALLS.forEach((p) => glyph('malls', p).bindTooltip(tip((x) => `<b>${esc(x.n)}</b><br>${L_MALL}`)(p)).addTo(layers.malls));
    POI.hawkers.forEach((p) => glyph('hawkers', p).bindTooltip(tip((x) => `<b>${esc(x.n)}</b><br>${L_HAWKER}`)(p)).addTo(layers.hawkers));
    if (!fam.ecdaChildcare) CC.forEach((p) => glyph('childcare', p, { fillColor: p.t === 'kindergarten' ? '#149a6a' : GLYPH.childcare.color }).bindTooltip(tip((x) => `<b>${esc(x.n)}</b><br>${t(x.t)}`)(p)).addTo(layers.childcare));
    EC.forEach((p) => glyph('eldercare', p).bindTooltip(tip((x) => `<b>${esc(x.n)}</b><br>${L_ELDER}`)(p)).addTo(layers.eldercare));
    FUN.forEach((p) => glyph('funeral', p).bindTooltip(tip((x) => `<b>${esc(x.n)}</b><br>${t(x.t)}`)(p)).addTo(layers.funeral));
    PARKS.forEach((p) => L.polygon(p.ring, { renderer: canvas, color: '#4c9a45', weight: 1, fillColor: '#a8d5a2', fillOpacity: 0.35, interactive: false }).addTo(layers.parks));
    const approxExtent = t('approximate extent — verify'), clickServices = t('click for services');
    SITES.forEach((p) => L.circle([p.lat, p.lon], { renderer: canvas, radius: p.radius_m, color: '#7a1f1f', weight: 1.5, dashArray: '6 5', fillColor: '#7a1f1f', fillOpacity: 0.05 }).bindTooltip(`<div class="poi-tip"><b>${esc(p.name)}</b><br>${esc(p.period || '')}<br><i>${approxExtent}</i></div>`).addTo(layers.sites));
    BUS.forEach((p) => { const m = glyph('bus', p).bindTooltip(`<div class="poi-tip"><b>${esc(p.n)}</b><br>${servicesAt(p).length ? servicesAt(p).map((x) => x.ref).join(', ') : clickServices}</div>`); m.on('click', () => openBusStop(p)); m.addTo(layers.bus); });
    FOOD.forEach((p) => glyph('food', p, { fillColor: p.t === 'cafe' ? '#c2410c' : GLYPH.food.color }).bindTooltip(tip((x) => `<b>${esc(x.n)}</b><br>${t(x.t.replace('_', ' '))}`)(p)).addTo(layers.food));
    // legend swatches in the layer list
    if (!poiOnly) document.querySelectorAll('#layers label.check').forEach((lbl) => { const k = lbl.querySelector('input').dataset.l; if (GLYPH[k]) { const sw = lbl.querySelector('.sw'); sw.outerHTML = swatch(k); } });
    if (!poiOnly) fam.decorate();
    msheet.tapRows(['schools', 'secondary', 'supermarkets', 'malls', 'hawkers', 'childcare', 'polyclinics', 'clinics', 'eldercare', 'funeral', 'sites', 'food'].map((k) => layers[k]).filter((g) => !poiOnly || !Object.values(fam.layers).includes(g))); // phones: tap → one-line row (no hover there)
  }
  const valueKey = () => (S.colorBy === 'budget' ? 'price' : S.colorBy === 'count' ? 'n' : S.colorBy); // statsFor() calls the count `n`
  const dotOptions = (kind, fill, z) => dotOpts(kind, fill, z, canvas); // ./blocks.js
  const zoomBand = dotBandOf; // ./blocks.js
  let dotBand = null;
  function renderBlocks() {
    blockAgg = aggregateBlocks();
    if (S.colorBy === 'budget' && !S.budgetMax) { S.colorBy = 'price'; syncColorBy(); showBanner(t('Open the Afford tab first — it works out your budget.'), S.profile.income == null ? { label: t('Set income →'), run: () => bus.emit('household:open', { field: 'buyers.0.income' }) } : { label: t('Open Afford →'), run: () => showTab('afford') }); } // budget mode needs a budget from Afford
    if (S.colorBy === 'commute' && !commute.available && !commute.pending) { S.colorBy = 'price'; syncColorBy(); } // commute.js missing → mode hidden
    commute.show(S.colorBy === 'commute');
    const key = valueKey();
    const rentVals = S.colorBy === 'rent' ? D.blocks.map((_, bi) => blockRent(bi)) : null;
    colorScale = S.colorBy === 'commute' ? commute.scale() : quantileScale(rentVals || blockAgg.map((a) => (a ? a[key] : null)));
    const fill = (a, bi) => (S.colorBy === 'commute' ? commute.fill(bi) : S.colorBy === 'rent' ? (rentVals[bi] == null ? null : colorScale.color(rentVals[bi])) : S.colorBy === 'budget' ? (a.price <= S.budgetMax ? BUDGET_COLORS.within : a.price <= S.budgetMax * (1 + BUDGET_STRETCH) ? BUDGET_COLORS.near : BUDGET_COLORS.over) : colorScale.color(a[key]));
    dotGroup.clearLayers(); blockMarkers = []; blockInfo = [];
    let shown = 0, txs = 0;
    const townSet = new Set(S.towns), byKind = { none: [], new: [], sale: [] }, z = map.getZoom();
    for (let bi = 0; bi < NB; bi++) {
      const a = blockAgg[bi], b = D.blocks[bi];
      if (!a && (!townSet.has(b.t) || (filtActive() && !blockOk(b)))) continue;
      const f = a && colorScale ? fill(a, bi) : null;
      const kind = a && f ? 'sale' : !a && b.nt ? 'new' : 'none';
      blockInfo[bi] = { kind, fill: f, a };
      byKind[kind].push(bi);
      if (a) { shown++; txs += a.n; }
    }
    for (const kind of ['none', 'new', 'sale']) { // grey under colour
      for (const bi of byKind[kind]) {
        const b = D.blocks[bi], m = L.circleMarker([b.lat, b.lon], dotOptions(kind, blockInfo[bi].fill, z));
        m.bi = bi; m.on('click', (e) => openBlock(bi, e)); dotGroup.addLayer(m); blockMarkers[bi] = m;
      }
    }
    hex.build(blockInfo.map((info, bi) => ({ lat: D.blocks[bi].lat, lon: D.blocks[bi].lon, kind: info.kind, a: info.a, v: info.kind === 'sale' ? chipValue(bi) : null })), { mode: S.colorBy, scale: colorScale, budget: { max: S.budgetMax, stretch: BUDGET_STRETCH, colors: BUDGET_COLORS } }); // zoom ≤ 13 hexes
    dotBand = zoomBand(z);
    $('visStat').innerHTML = t('<b>{0}</b> blocks · <b>{1}</b> transactions in view', [shown.toLocaleString(), txs.toLocaleString()]);
    renderView(); if (typeof renderArea === 'function') renderArea();
    sel.schedule(); card.refresh(); // explore:selection for the other tabs; open cards follow the filters
  }
  // zoom ≥ CHIP_ZOOM: number boxes for the blocks in view (canvas); below it: dots sized by zoom
  const CHIP_MAX = 1500; // more boxes than this in view → stay with dots
  function renderView() {
    const z = map.getZoom();
    chipGroup.clearLayers();
    let chips = z >= CHIP_ZOOM && drawChips(z), hexOn = hex.show(z); // ./hexgrid.js: hexes instead of dots at zoom ≤ 13
    map.getContainer().classList.toggle('chips-on', !!chips);
    if (chips || hexOn) { if (layers.blocks.hasLayer(dotGroup)) layers.blocks.removeLayer(dotGroup); }
    else {
      if (!layers.blocks.hasLayer(dotGroup)) layers.blocks.addLayer(dotGroup);
      if (zoomBand(z) !== dotBand) {
        dotBand = zoomBand(z);
        blockMarkers.forEach((m, bi) => { if (!m) return; const o = dotOptions(blockInfo[bi].kind, blockInfo[bi].fill, z); m.setRadius(o.radius); m.setStyle({ weight: o.weight, fillOpacity: o.fillOpacity }); });
      }
    }
    card.chipsOn(!!chips); // card pins keep their ring only on the dot view
    renderLegend(!!chips);
  }
  function drawChips(z) {
    const view = map.getBounds().pad(0.15), inView = [];
    for (let bi = 0; bi < NB; bi++) { const info = blockInfo[bi]; if (info && view.contains([D.blocks[bi].lat, D.blocks[bi].lon])) inView.push(bi); }
    if (inView.length > CHIP_MAX) return false;
    const short = new Set(S.choices.map((c) => c.bid));
    const prio = (bi) => (openBis.has(bi) ? 4e9 : short.has(bi) ? 3e9 : blockInfo[bi].kind === 'sale' ? 1e9 + (blockInfo[bi].a?.n || 0) : blockInfo[bi].kind === 'new' ? 1 : 0);
    inView.sort((x, y) => prio(y) - prio(x));
    const font = z >= CHIP_ZOOM + 1 ? 12 : 11, valueOn = chipValueOn(); // G1: block number or the colour metric, rounded
    const items = inView.map((bi) => { const b = D.blocks[bi], p = map.latLngToContainerPoint([b.lat, b.lon]), text = valueOn ? shortValue(S.colorBy, chipValue(bi), t) : b.b, s = chipSize(textWidth(text, font), z); return { id: bi, text, x: p.x, y: p.y, w: s.w, h: s.h, font: s.font, force: openBis.has(bi) || short.has(bi) }; });
    const placed = placeChips(items);
    const order = [...items].sort((x, y) => (placed.get(x.id) === 'mini' ? 0 : 1) - (placed.get(y.id) === 'mini' ? 0 : 1) || openBis.has(x.id) - openBis.has(y.id)); // minis, boxes, open cards last
    for (const it of order) {
      const bi = it.id, b = D.blocks[bi], info = blockInfo[bi];
      const m = chipMarker([b.lat, b.lon], { renderer: canvas, text: it.text, fill: info.fill || BLOCK_COLOR.noSales, kind: info.kind, mode: placed.get(bi), font: it.font, w: it.w, h: it.h, selected: openBis.has(bi) });
      m.bi = bi; m.on('click', (e) => openBlock(bi, e)); chipGroup.addLayer(m);
    }
    return true;
  }
  const chipValueOn = () => S.chipLabel === 'value' && !(S.colorBy === 'commute' && !commute.hubs().length);
  const chipValue = (bi) => { const info = blockInfo[bi], a = info && info.kind === 'sale' ? info.a : null; return !a ? null : S.colorBy === 'rent' ? blockRent(bi) : S.colorBy === 'commute' ? commute.value(bi) : a[valueKey()]; }; // grey / new boxes → "–"
  map.on('zoomend moveend', debounce(renderView, 120));
  // hover: one shared tooltip for dots and boxes
  const hoverTip = L.tooltip({ direction: 'top', offset: [0, -8], opacity: 1 });
  const hex = createHexGrid({ L, map, t, esc, tip: hoverTip, parent: layers.blocks, busy: () => picking || circling || drawing, zoomTo: (ll, z) => viewTo(ll, z), hovering: () => !!canvas._hoveredLayer });
  function hoverText(bi) {
    const b = D.blocks[bi], info = blockInfo[bi] || {}, a = info.a;
    const v = S.colorBy === 'commute' ? commute.hover(bi) : !a ? '' : S.colorBy === 'rent' ? (blockRent(bi) != null ? ` · ${t('rent')} S$${Math.round(blockRent(bi)).toLocaleString()}` : '') : S.colorBy === 'psf' ? ` · S$${Math.round(a.psf)} psf` : ` · ${chipValueOn() ? fmt.money(a.price) : fmt.k(a.price)}`; // value boxes are rounded → exact S$ here
    return `<div class="poi-tip"><b>${esc(b.label)}</b>${v}${a ? ` · ${t('{0} matching sales', [a.n])}` : info.kind === 'new' ? ` · ${t('New block, no resale yet')}` : ` · ${t('No sales match your filters')}`}</div>`;
  }
  for (const g of [dotGroup, chipGroup]) {
    g.on('mouseover', (e) => {
      if (msheet.phone()) return; // phones: no hover (a tap opens the card)
      const m = e.layer; hoverTip.setLatLng(m.getLatLng()).setContent(hoverText(m.bi)); map.openTooltip(hoverTip);
      if (m.options.mode) m.setStyle({ hover: true }); else { m._hoverR = m.getRadius(); m.setRadius(m._hoverR + 1.5); m.setStyle({ color: BLOCK_COLOR.ink, weight: 1 }); }
    });
    g.on('mouseout', (e) => {
      const m = e.layer; map.closeTooltip(hoverTip);
      if (m.options.mode) m.setStyle({ hover: false }); else if (m._hoverR != null) { const o = dotOptions(blockInfo[m.bi].kind, blockInfo[m.bi].fill, map.getZoom()); m.setRadius(o.radius); m.setStyle({ color: o.color || '#fff', weight: o.weight || 0 }); m._hoverR = null; }
    });
  }
  // popups live inside the map pane, under the "prices in view" box — step the box aside while one is open
  map.on('popupopen', () => $('areaBox').classList.add('dim')).on('popupclose', () => $('areaBox').classList.remove('dim'));
  function renderLegend(zoomedIn = map.getZoom() >= CHIP_ZOOM) {
    const chipOff = S.colorBy === 'commute' && !commute.hubs().length, chipLabel = chipValueOn() ? t(chipMetric(S.colorBy)) : null;
    syncChipLabel(document, { value: S.chipLabel, metric: t(chipMetric(S.colorBy)), off: chipOff, zoomedIn, offText: t('Choose a place first'), helpText: t('Boxes appear when you zoom in close.') });
    const ftP = { types: [...S.ft].sort((a, b) => a - b).map(ftName), allTypes: S.ft.length === D.flat_types.length, filt: S.filt }; // P8 8c: + filters in words, "Which flats" line (M-04)
    msheet.legend({ summary: peekSummary({ mode: S.colorBy, period: calcLabel(S.calcM), ...ftP }), flats: flatsLine({ ...ftP, towns: [S.towns.length, D.towns.length] }), html: peekLegend({ mode: S.colorBy, scale: colorScale, budget: S.budgetMax ? { colors: BUDGET_COLORS } : null }) }); // phones: the one-line peek row (F4)
    const el = $('legend'), hx = hex.hint(map.getZoom()); if (!colorScale) { el.innerHTML = `<span class="muted">${t('No transactions match these filters.')}</span>`; return; }
    if (S.colorBy === 'commute') { el.innerHTML = commute.legend({ simple: document.body.classList.contains('simple'), zoomedIn, chipLabel, tap: msheet.phone() }) + hx; return; }
    if (S.colorBy === 'budget') { el.innerHTML = `<div class="key">${t('Median price vs your budget ({0}, from Afford)', [fmt.k(S.budgetMax)])}</div><div class="legend-row"><span><i style="background:${BUDGET_COLORS.within}"></i>${t('within budget')}</span><span><i style="background:${BUDGET_COLORS.near}"></i>${t('up to {0}% over', [Math.round(BUDGET_STRETCH * 100)])}</span><span><i style="background:${BUDGET_COLORS.over}"></i>${t('above')}</span></div><div class="hint">${t('Max-price filter set to budget + {0}%. Reset it under More filters.', [Math.round(BUDGET_STRETCH * 100)])}</div>${hx}`; return; }
    const f = S.colorBy === 'psf' || S.colorBy === 'rent' ? (v) => 'S$' + Math.round(v).toLocaleString() : S.colorBy === 'price' ? fmt.k : (v) => String(Math.round(v));
    const metric = t({ psf: 'Median price per sq ft', price: 'Median resale price', count: 'Number of transactions', rent: 'Median monthly rent (HDB rental approvals)' }[S.colorBy]);
    const label = S.colorBy === 'rent' ? metric : t('{0} · last {1}', [metric, calcLabel(S.calcM)]); // rent: HDB rental approvals, not the price window
    el.innerHTML = legendHtml({ scale: colorScale, mode: S.colorBy, label, fmt: f, t, simple: document.body.classList.contains('simple'), zoomedIn, chipLabel, tap: msheet.phone() }) + hx;
  }
  store?.subscribe?.('ui', () => renderLegend());
  // ------------------------------------------------------------------ bus routes (OSM)
  const ROUTE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7', '#e34948', '#008300'];
  function servicesAt(stop) { const idxs = BR.stops[stopCode(stop)] || []; const seen = new Map(); idxs.forEach((i) => { const r = BR.routes[i]; if (!seen.has(r.ref)) seen.set(r.ref, []); seen.get(r.ref).push(i); }); return [...seen.entries()].map(([ref, dirs]) => ({ ref, dirs })); }
  function drawRoute(i, on) {
    if (on === false || (on == null && drawnRoutes.has(i))) { const g = drawnRoutes.get(i); if (g) routeLayer.removeLayer(g); drawnRoutes.delete(i); }
    else if (!drawnRoutes.has(i)) { const r = BR.routes[i], col = ROUTE_COLORS[drawnRoutes.size % ROUTE_COLORS.length]; const g = L.layerGroup();
      L.polyline(r.stops.map((s) => [s[0], s[1]]), { color: col, weight: 4, opacity: 0.85 }).bindTooltip(`<b>${t('Bus {0}', [esc(r.ref)])}</b> ${esc(r.from)} → ${esc(r.to)}`, { sticky: true }).addTo(g);
      r.stops.forEach((s) => L.circleMarker([s[0], s[1]], { radius: 3, color: col, weight: 1.5, fillColor: '#fff', fillOpacity: 1 }).bindTooltip(`${esc(s[3] || s[2])}`).addTo(g));
      const lbl = (s, t) => L.marker([s[0], s[1]], { icon: L.divIcon({ className: 'route-lbl', html: `${esc(r.ref)} ${t}`, iconSize: null }), interactive: false }).addTo(g);
      lbl(r.stops[0], '▶ ' + (r.from || t('start'))); lbl(r.stops[r.stops.length - 1], '■ ' + (r.to || t('end')));
      g.addTo(routeLayer); drawnRoutes.set(i, g); }
    $('clearRoutes').style.display = drawnRoutes.size || drawnLines.size || drawnFut.size ? '' : 'none'; renderDrawn();
    document.querySelectorAll('.svc[data-r]').forEach((el) => el.classList.toggle('on', el.dataset.r.split(',').some((x) => drawnRoutes.has(+x))));
  }
  function openBusStop(p) {
    const svcs = servicesAt(p);
    const html = `<div class="pop"><h4>${esc(p.n)}</h4><div class="sub">${svcs.length ? `${svcs.length > 1 ? t('{0} services', [svcs.length]) : t('{0} service', [svcs.length])} · ${tapOr('click a service to draw its whole route', 'tap a service to draw its whole route')}` : t('No route data for this stop (OSM coverage gap)')}</div>
      ${svcs.map((s) => `<span class="svc ${s.dirs.some((i) => drawnRoutes.has(i)) ? 'on' : ''}" data-r="${s.dirs.join(',')}"><b>${esc(s.ref)}</b><small>${esc(BR.routes[s.dirs[0]].from)} → ${esc(BR.routes[s.dirs[0]].to)}${s.dirs.length > 1 ? ' ⇄' : ''}</small></span>`).join('')}
      ${svcs.length ? `<div class="foot"><button class="btn sm" id="busAll">${t('Show all')}</button><button class="btn sm" id="busNone">${t('Hide all')}</button></div>` : ''}</div>`;
    const root = popAt([p.lat, p.lon], html, 380, p.n);
    setTimeout(() => { root.querySelectorAll('.svc[data-r]').forEach((el) => { el.onclick = () => { const ids = el.dataset.r.split(',').map(Number); const on = !ids.some((i) => drawnRoutes.has(i)); ids.forEach((i) => drawRoute(i, on)); }; });
      const a = $('busAll'); if (a) a.onclick = () => svcs.forEach((s) => s.dirs.forEach((i) => drawRoute(i, true)));
      const n = $('busNone'); if (n) n.onclick = () => svcs.forEach((s) => s.dirs.forEach((i) => drawRoute(i, false))); }, 0);
  }
  $('clearRoutes').addEventListener('click', () => { [...drawnRoutes.keys()].forEach((i) => drawRoute(i, false)); [...drawnLines.keys()].forEach((i) => drawLine(i, false)); [...drawnFut.keys()].forEach((i) => drawFutureLine(i, false)); });
  // chip strip under the map bar: one chip per drawn bus route / MRT line / future line, click to remove
  function renderDrawn() {
    const chips = [];
    drawnRoutes.forEach((_, i) => { const r = BR.routes[i]; chips.push(`<span class="dchip" data-k="b" data-i="${i}" style="border-color:${ROUTE_COLORS[[...drawnRoutes.keys()].indexOf(i) % ROUTE_COLORS.length]}"><b>${t('Bus {0}', [esc(r.ref)])}</b> ${esc(r.from)} → ${esc(r.to)} <i>✕</i></span>`); });
    drawnLines.forEach((_, i) => { const l = D.mrt.lines[i]; chips.push(`<span class="dchip" data-k="m" data-i="${i}" style="border-color:${l.color}"><b style="color:${l.color}">${esc(l.id)}</b> ${esc(l.name)} <i>✕</i></span>`); });
    drawnFut.forEach((_, i) => { const l = FUT.lines[i]; chips.push(`<span class="dchip" data-k="f" data-i="${i}" style="border-color:${l.color};border-style:dashed"><b style="color:${l.color}">${esc(l.id)}</b> ${esc(l.name)} · ${l.year} <i>✕</i></span>`); });
    const el = $('drawnStrip'); el.innerHTML = chips.join(''); el.style.display = chips.length ? '' : 'none';
  }
  $('drawnStrip').addEventListener('click', (e) => { const c = e.target.closest('.dchip'); if (!c) return; const i = +c.dataset.i; if (c.dataset.k === 'b') drawRoute(i, false); else if (c.dataset.k === 'm') drawLine(i, false); else drawFutureLine(i, false); });
  // --- MRT / LRT lines
  const drawnLines = new Map();
  const linesAt = (si) => D.mrt.lines.map((l, i) => ({ l, i })).filter(({ l }) => l.st.includes(si));
  function drawLine(i, on) {
    if (on === false || (on == null && drawnLines.has(i))) { const g = drawnLines.get(i); if (g) routeLayer.removeLayer(g); drawnLines.delete(i); }
    else if (!drawnLines.has(i)) { const l = D.mrt.lines[i], pts = l.st.map((si) => D.mrt.stations[si]); const g = L.layerGroup();
      L.polyline(pts.map((st) => [st.lat, st.lon]), { color: l.color, weight: 6, opacity: 0.85 }).bindTooltip(`<b>${esc(l.name)}</b>`, { sticky: true }).addTo(g);
      pts.forEach((st, k) => L.circleMarker([st.lat, st.lon], { radius: 5, color: l.color, weight: 2.5, fillColor: '#fff', fillOpacity: 1 }).bindTooltip(`<b>${esc(stn(st.n))}</b> ${esc(l.codes[k] || '')}`).addTo(g));
      const lbl = (st, t) => L.marker([st.lat, st.lon], { icon: L.divIcon({ className: 'route-lbl', html: t, iconSize: null }), interactive: false }).addTo(g);
      lbl(pts[0], `${esc(l.id)} ▶ ${esc(stn(pts[0].n))}`); lbl(pts[pts.length - 1], `${esc(l.id)} ■ ${esc(stn(pts[pts.length - 1].n))}`);
      g.addTo(routeLayer); drawnLines.set(i, g); }
    $('clearRoutes').style.display = drawnRoutes.size || drawnLines.size || drawnFut.size ? '' : 'none'; renderDrawn();
    document.querySelectorAll('.lc[data-l]').forEach((el) => el.classList.toggle('on', drawnLines.has(+el.dataset.l)));
  }
  const drawnFut = new Map();
  function drawFutureLine(i, on) {
    if (on === false || (on == null && drawnFut.has(i))) { const g = drawnFut.get(i); if (g) routeLayer.removeLayer(g); drawnFut.delete(i); }
    else if (!drawnFut.has(i)) { const l = FUT.lines[i], pts = l.st.map((si) => FUT.stations[si]); const g = L.layerGroup();
      L.polyline(pts.map((st) => [st.lat, st.lon]), { color: l.color, weight: 6, opacity: 0.8, dashArray: l.status === 'open' ? null : '10 8' }).bindTooltip(`<b>${esc(l.name)}</b><br>${t(l.status)} · ${l.year}`, { sticky: true }).addTo(g);
      pts.forEach((st) => L.circleMarker([st.lat, st.lon], { radius: 5, color: l.color, weight: 2.5, fillColor: st.future ? '#fff' : l.color, fillOpacity: 1 }).bindTooltip(`<b>${esc(st.n)}</b>${st.future ? ' · ' + t('future') : ''}`).addTo(g));
      const lbl = (st, t) => L.marker([st.lat, st.lon], { icon: L.divIcon({ className: 'route-lbl', html: t, iconSize: null }), interactive: false }).addTo(g);
      lbl(pts[0], `${esc(l.id)} ▶ ${esc(pts[0].n)}`); lbl(pts[pts.length - 1], `${esc(l.id)} ■ ${esc(pts[pts.length - 1].n)} · ${l.year}`);
      g.addTo(routeLayer); drawnFut.set(i, g); }
    $('clearRoutes').style.display = drawnRoutes.size || drawnLines.size || drawnFut.size ? '' : 'none'; renderDrawn();
    document.querySelectorAll('.fc[data-f]').forEach((el) => el.classList.toggle('on', drawnFut.has(+el.dataset.f)));
  }
  const futChips = (name) => { const ls = FUT.lines.map((l, i) => ({ l, i })).filter(({ l }) => l.st.some((si) => FUT.stations[si].n.toUpperCase() === name.toUpperCase())); return ls.map(({ l, i }) => `<span class="svc fc ${drawnFut.has(i) ? 'on' : ''}" data-f="${i}" style="border-color:${l.color};border-style:${l.status === 'open' ? 'solid' : 'dashed'}"><b style="color:${l.color}">${esc(l.id)}</b><small>${esc(l.name)} · ${t(l.status)} · ${l.year} · ${t('{0} stations', [l.st.length])}</small></span>`).join(''); };
  const wireFut = (root) => setTimeout(() => root.querySelectorAll('.fc[data-f]').forEach((el) => { el.onclick = () => drawFutureLine(+el.dataset.f); }), 0);
  function openFutureStation(st) {
    const html = `<div class="pop"><h4>${esc(st.n)} <span class="tag neutral">${t('future')}</span></h4><div class="sub">${t(st.status)}${st.year ? ' · ' + t('opening ~{0}', [st.year]) : ''} · ${tapOr('position from URA Master Plan 2025 · click a line to draw it', 'position from URA Master Plan 2025 · tap a line to draw it')}</div>${futChips(st.n) || `<span class="muted">${t('Line not yet curated (safeguarded site).')}</span>`}</div>`;
    wireFut(popAt([st.lat, st.lon], html, 400, st.n));
  }
  function openBto(p) {
    const html = `<div class="pop"><h4>${esc(p.n)} <span class="tag neutral">BTO</span></h4><div class="sub">${esc(p.status)}${p.launch && p.launch !== 'nan' ? ' · ' + t('launched {0}', [esc(p.launch)]) : ''}${p.top && p.top !== 'nan' ? ' · ' + t('TOP {0}', [esc(p.top)]) : ''}${p.approx ? ` · <b>${t('location approximate (placed by road)')}</b>` : ''}</div>
      <div class="stats"><div class="stat"><small>${t('Units')}</small><b>${p.units ? p.units.toLocaleString() : '—'}</b></div><div class="stat"><small>${t('Blocks · storeys')}</small><b>${p.blocks || '—'} · ${p.floors || '—'}</b></div><div class="stat"><small>${t('Launch price')}</small><b>${p.pmin ? fmt.k(p.pmin) + '–' + fmt.k(p.pmax) : '—'}</b></div></div>
      ${p.types.length ? `<div class="hint">${esc(p.types.join(' · '))}</div>` : ''}<div class="foot"><a class="btn sm" href="${esc(p.url)}" target="_blank" rel="noopener">${t('project page ↗')}</a> <button type="button" class="btn sm" data-bto-compare>${t('Compare with resale →')}</button></div></div>`;
    popAt([p.lat, p.lon], html, 380, p.n)?.querySelector('[data-bto-compare]')?.addEventListener('click', () => {
      store.set('plan.btoId', p.n); store.set('plan.btoPrice', null);
      bus.emit('nav:goto', { tab: 'plan' }); bus.emit('plan:show', { section: 'planBto' });
    });
  }
  function openStation(si) {
    const st = D.mrt.stations[si], ls = linesAt(si);
    const html = `<div class="pop"><h4>${esc(stn(st.n))} ${st.n.match(/LRT/i) ? 'LRT' : 'MRT'}</h4><div class="sub">${esc(st.codes.join(' · '))} · ${ls.length > 1 ? t('{0} lines', [ls.length]) : t('{0} line', [ls.length])} · ${tapOr('click a line to draw all its stations', 'tap a line to draw all its stations')}</div>
      ${ls.map(({ l, i }) => `<span class="svc lc ${drawnLines.has(i) ? 'on' : ''}" data-l="${i}" style="border-color:${l.color}"><b style="color:${l.color}">${esc(l.id)}</b><small>${esc(l.name)} · ${t('{0} stations', [l.st.length])} · ${esc(stn(D.mrt.stations[l.st[0]].n))} → ${esc(stn(D.mrt.stations[l.st[l.st.length - 1]].n))}</small></span>`).join('')}
      <div class="foot"><button class="btn sm" id="lineAll">${t('Show all')}</button><button class="btn sm" id="lineNone">${t('Hide all')}</button></div>${futChips(stn(st.n)) ? `<div class="sub" style="margin-top:8px">${t('Coming here:')}</div>${futChips(stn(st.n))}` : ''}</div>`;
    const root = popAt([st.lat, st.lon], html, 400, `${stn(st.n)} ${st.n.match(/LRT/i) ? 'LRT' : 'MRT'}`); wireFut(root);
    setTimeout(() => { root.querySelectorAll('.lc[data-l]').forEach((el) => { el.onclick = () => drawLine(+el.dataset.l); });
      const a = $('lineAll'); if (a) a.onclick = () => ls.forEach(({ i }) => drawLine(i, true));
      const n = $('lineNone'); if (n) n.onclick = () => ls.forEach(({ i }) => drawLine(i, false)); }, 0);
  }
  // services reachable from stops near a point, and which of them pass near a target
  function routesNear(lat, lon, r) { const set = new Set(); within(lat, lon, BUS, r).forEach((s) => (BR.stops[stopCode(s)] || []).forEach((i) => set.add(i))); return set; }
  function directBus(fromLat, fromLon, toLat, toLon) { const refs = new Set(); routesNear(fromLat, fromLon, 300).forEach((i) => { const rt = BR.routes[i]; if (rt.stops.some((s) => Math.abs(s[0] - toLat) < 0.005 && Math.abs(s[1] - toLon) < 0.005 && haversine(s[0], s[1], toLat, toLon) <= 400)) refs.add(rt.ref); }); return [...refs].sort((a, b) => a.length - b.length || a.localeCompare(b)); }
  // block card (./card.js): header facts; warnings (tone 'warn') stay visible, the rest goes under "Nearby"
  function envItems(b) {
    const out = [], add = (html, tone = 'info') => out.push({ html, tone });
    const fm = nearest(b.lat, b.lon, FUTST); if (fm && fm.d <= 1500) add(`${t('{0} to future {1} MRT', [fmt.m(fm.d), esc(fm.p.n)])}${fm.p.year ? ' (' + fm.p.year + ')' : ''}`);
    const ml = nearest(b.lat, b.lon, MALLS); if (ml && ml.d <= 1500) add(distTo(ml.d, esc(ml.p.n)));
    const sp = nearest(b.lat, b.lon, SUPERS); if (sp && sp.d <= 800) add(distTo(sp.d, esc(sp.p.n)));
    const pk = nearestPark(b.lat, b.lon); if (pk) add(distTo(pk.d, esc(pk.p.n)));
    if (CC.length) add(t('{0} childcare ≤500 m', [within(b.lat, b.lon, CC, 500).length]));
    if (BUS.length) add(t('{0} bus stops ≤300 m', [within(b.lat, b.lon, BUS, 300).length]));
    if (FOOD.length) add(t('{0} eateries ≤500 m', [within(b.lat, b.lon, FOOD, 500).length]));
    const fn = nearest(b.lat, b.lon, FUN); if (fn && fn.d <= 500) add(distTo(fn.d, esc(fn.p.n)), 'warn');
    const fl = fam.floodLine(b); if (fl) add(fl, 'warn');
    const st = SITES.find((s) => haversine(b.lat, b.lon, s.lat, s.lon) <= s.radius_m); if (st) add(t('within former {0} (approx.)', [esc(st.name)]), 'warn');
    return out;
  }
  function blockFacts(bi) {
    const b = D.blocks[bi], lease = leaseYearsLeft(b), mrt = nearest(b.lat, b.lon, D.mrt.stations), ps = within(b.lat, b.lon, primarySchools, 1000).length;
    const facts = [b.yc ? t('Completed {0}', [b.yc]) : t('Lease from {0}', [b.lease]), lease == null ? t('Lease unknown') : t('{0} y lease left', [lease.toFixed(0)]), b.top && t('{0} storeys', [b.top]), b.u && t('{0} units', [b.u]), mrt && t('{d} to {place} MRT', { d: fmt.m(mrt.d), place: esc(stn(mrt.p.n)) }), primarySchools.length && (ps === 1 ? t('{0} primary school within 1 km', [ps]) : t('{0} primary schools within 1 km', [ps]))].filter(Boolean);
    const items = envItems(b).concat((S.workplaces || []).map((w) => ({ html: distTo(haversine(b.lat, b.lon, w.lat, w.lon), esc(w.name)), tone: 'info' })));
    return { title: esc(b.label), sub: `${esc(title(D.towns[b.t]))} · ${t(D.zones[b.t])}`, town: title(D.towns[b.t]), facts, items, newYear: b.nt && b.yc ? b.yc + 5 : null, lease, mrt: mrt && { d: fmt.m(mrt.d), name: stn(mrt.p.n) } };
  }
  // block cards float in ./dock.js (up to 3, numbered pins); they follow every filter / window change (renderBlocks)
  const card = createCard({ map, L, canvas, bus, D, TX, PSF, blockTx, txOk, filtActive, getS: () => S, getAgg: () => blockAgg, statsFor, median, fmtMonth, rents: lateRents, facts: blockFacts, panelCover, viewTo, period: () => per.info(), futureValue: (bi, ft) => fv.cardHtml(bi, ft), mode: () => store.get('ui.mode'), fvFacts: (bi, ft) => fv.factsFor(bi, ft),
    cardSize: { get: () => S.ui && S.ui.cardSize, set: (s) => { S.ui.cardSize = { w: s.w, h: s.h }; save(); } }, onCards: (bis) => { openBis = new Set(bis); renderView(); },
    handoff: (bi) => ho.flat(bi), onAdd: (bi) => addFromBlock(bi), onAfford: (bi) => focusBlock(bi), onRent: (bi) => focusBlock(bi, 'rent'),
    commuteLine: (bi) => commute.cardLine(bi), schools: () => primarySchools, p1Bands: policy.get('p1.distance.bands_km'), budget: () => (S.budgetMax ? { max: S.budgetMax, stretch: BUDGET_STRETCH } : null) }); // B8 card line, B3 school fold + school card
  const ho = createHandoff({ D, TX, blockTx, getS: () => S, getAgg: () => blockAgg, txOk, median, lastMonthIdx, storeyMid, storeyChoices }); // ./handoff.js (A8)
  const sel = createSelection({ bus, D, getS: () => S, areaPred: () => areaPred(), areaLabel: () => (S.area.type === 'circle' ? t('{0} circle', [fmt.m(S.area.r)]) : t('drawn area ({0} km²)', [polyAreaKm2(S.area.pts).toFixed(2)])) });
  function openBlock(bi, e) { if (picking || circling || drawing) return; if (e && msheet.blocksHere(e)) return; card.open(bi); if (!msheet.phone() && $('drawer').classList.contains('open')) openDrawer(false); } // 7c C5: the compare drawer folds so it never covers the card // phones: > 3 blocks within 30 px → "Blocks here" list (P-20)

  // ------------------------------------------------------------------ choices
  // "Add a flat from this block…" (./handoff.js): one type selected + sales of it → added; else the form, prefilled and highlighted
  const qa = createQuickAdd({ D, TX, blockTx, lastMonthIdx, median, storeyMid, storeyChoices, getS: () => S, bus, phone: () => msheet.phone(), // P8 8b M-05
    add: (c) => { c.id = S.nextId++; S.choices.push(c); renderChoices(); save(); return { id: c.id, n: S.choices.length }; },
    undo: (id) => { const k = S.choices.findIndex((x) => x.id === id); if (k >= 0) { S.choices.splice(k, 1); renderChoices(); save(); } },
    compare: () => { if (!msheet.phone()) return openDrawer(true); bus.emit('nav:goto', { tab: 'choices' }); $('choicesView')?.querySelector('button[data-v="compare"]')?.click(); },
    storeyOptions: () => $('cStorey').innerHTML, facingOptions: () => $('cFacing').innerHTML });
  function addFromBlock(bi) {
    if (qa.open(bi)) return; // P8 8b M-05: quick add (type + price); never-sold blocks keep the full form below
    const b = D.blocks[bi], { direct, row: r } = ho.add(bi);
    if (direct) { S.choices.push({ id: S.nextId++, bid: bi, ...r, name: b.label, url: '', facing: '' }); renderChoices(); save(); return showBanner(t('Added — edit in My choices'), { label: t('Open My choices →'), run: () => showTab('choices') }); }
    $('cId').value = ''; $('cAddr').value = b.label; $('cAddr').dataset.bid = bi; $('cFt').value = r.ft; if (r.storey != null) $('cStorey').value = r.storey;
    $('cSqm').value = r.sqm ?? ''; $('cPrice').value = r.price ?? ''; $('cName').value = ''; $('cUrl').value = '';
    $('cPrice').placeholder = r.price ? '' : t('No resales yet — type the asking price'); $('cSqm').placeholder = r.sqm ? '' : t('from the listing');
    updateFormMeta(); $('cSubmit').textContent = t('Add to comparison'); showTab('choices');
    flashForm($('choiceForm'), r.price ? $('cFt') : $('cPrice')); // never-resold block: the price is the one thing we can't prefill
  }
  function updateFormMeta() {
    const bi = $('cAddr').dataset.bid; const el = $('cMeta');
    if (bi === undefined || bi === '') { el.textContent = t('Pick a block from the suggestions so we can look up its lease, location and transaction history.'); return; }
    const b = D.blocks[+bi]; el.innerHTML = `✓ ${esc(title(D.towns[b.t]))} · ${t('lease from <b>{0}</b>', [b.lease])} · ${t('{0} past transactions in this block', [blockTx[+bi].length])}`;
  }
  function choiceFromForm() {
    const bi = $('cAddr').dataset.bid; if (bi === undefined || bi === '') { alert(t('Please pick the block from the suggestion list.')); return null; }
    const b = D.blocks[+bi];
    return { id: $('cId').value ? +$('cId').value : S.nextId++, bid: +bi, ft: +$('cFt').value, storey: +$('cStorey').value, sqm: +$('cSqm').value, price: +$('cPrice').value, name: $('cName').value.trim() || b.label, url: $('cUrl').value.trim(), facing: $('cFacing').value || '' };
  }
  function resetForm() { $('choiceForm').reset(); $('cPrice').placeholder = ''; $('cSqm').placeholder = ''; $('cId').value = ''; delete $('cAddr').dataset.bid; setFormDefaults(); $('cSubmit').textContent = t('Add to comparison'); updateFormMeta(); }
  function editChoice(c) { $('cId').value = c.id; $('cAddr').value = D.blocks[c.bid].label; $('cAddr').dataset.bid = c.bid; $('cFt').value = c.ft; $('cStorey').value = c.storey; $('cSqm').value = c.sqm; $('cPrice').value = c.price; $('cName').value = c.name; $('cUrl').value = c.url || ''; $('cFacing').value = c.facing || ''; $('cSubmit').textContent = t('Save changes'); updateFormMeta(); showTab('choices'); }
  const colorOf = (idx) => CHOICE_COLORS[idx % CHOICE_COLORS.length];

  // --- autocomplete over 9.7k blocks
  const acInput = $('cAddr'), acList = $('acList'); let acHi = -1, acItems = [];
  function acSearch(q) {
    if (canon(q).length < 2) return [];
    const toks = tokens(q); const res = [];
    for (let i = 0; i < NB && res.length < 40; i++) { if (hits(D.blocks[i].addr, toks)) res.push(i); }
    res.sort((x, y) => rankOf(D.blocks[x].addr, toks) - rankOf(D.blocks[y].addr, toks));
    return res.slice(0, 8);
  }
  function acRender() { acList.innerHTML = acItems.map((bi, k) => `<div data-i="${k}" class="${k === acHi ? 'hi' : ''}">${esc(D.blocks[bi].label)}<small>${esc(title(D.towns[D.blocks[bi].t]))}</small></div>`).join(''); acList.classList.toggle('open', acItems.length > 0); }
  function acPick(k) { const bi = acItems[k]; if (bi == null) return; acInput.value = D.blocks[bi].label; acInput.dataset.bid = bi; acItems = []; acRender(); updateFormMeta(); if (!$('cSqm').value) { const same = blockTx[bi].filter((i) => TX.ft[i] === +$('cFt').value); if (same.length) $('cSqm').value = Math.round(median(same.map((i) => TX.a[i]))); } }
  acInput.addEventListener('input', () => { delete acInput.dataset.bid; acItems = acSearch(acInput.value); acHi = acItems.length ? 0 : -1; acRender(); updateFormMeta(); });
  acInput.addEventListener('keydown', (e) => { if (!acItems.length) return; if (e.key === 'ArrowDown') { acHi = (acHi + 1) % acItems.length; acRender(); e.preventDefault(); } else if (e.key === 'ArrowUp') { acHi = (acHi - 1 + acItems.length) % acItems.length; acRender(); e.preventDefault(); } else if (e.key === 'Enter') { acPick(acHi); e.preventDefault(); } else if (e.key === 'Escape') { acItems = []; acRender(); } });
  acList.addEventListener('mousedown', (e) => { const d = e.target.closest('div[data-i]'); if (d) { acPick(+d.dataset.i); e.preventDefault(); } });
  acInput.addEventListener('blur', () => setTimeout(() => { acItems = []; acRender(); }, 150));

  // ------------------------------------------------------------------ metrics per choice
  // Comparable-sales benchmark (tiers block → 400 m similar lease → town) + fair value v2 rows: ./comparables.js
  const comps = createComparables({ D, TX, PSF, blockTx, statsFor, townTx, haversine, title, lastMonthIdx, fmtMonth, body: $('cmpBody'), rerender: () => renderCompare() }), benchmark = comps.benchmark;
  // Future-value scorecard (per-driver rows, scoring panel, card fold, MOP-wave flag; cached per flat): ./futurevalue-ui.js
  const fv = createFutureValue({ ctx: () => ({ hdb: D, market: window.HDB_MARKET || null, future: window.HDB_FUTURE || null, bto: BTO_ON ? window.HDB_BTO || null : null, btoOff: !BTO_ON, rents: RENTS }), policy, asOf: () => D.months[lastMonthIdx], asOfLabel: () => fmtMonth(lastMonthIdx), body: $('cmpBody'), mode: () => store.get('ui.mode') }); Object.assign(ROW_TERMS, fv.terms); const cpfLife = createCpfLife({ policy, store, bus, D, body: $('cmpBody'), rerender: () => renderCompare() }); Object.assign(ROW_TERMS, cpfLife.terms); // CPF-11 row: ./cpflife.js
  const money = createMoney({ policy, store, D, rerender: () => renderCompare() }); Object.assign(ROW_TERMS, money.terms); const family = createFamilyRows({ policy, fam: fam.data, schools: () => primarySchools }); // money rows + glance lines = Afford's planPurchase (./money.js, 7a A1); "For the family" section (./familyrows.js, B2)
  const SUN = { N: ['good', t('minimal direct sun — coolest')], S: ['good', t('minimal direct sun — coolest')], E: ['neutral', t('morning sun (bright till ~11 am)')], NE: ['neutral', t('gentle morning sun')], SE: ['neutral', t('gentle morning sun')], W: ['serious', t('afternoon sun — hot 2–6 pm')], SW: ['serious', t('afternoon sun — hot 2–6 pm')], NW: ['warn', t('late-afternoon sun')] };
  function envMetrics(c, b) {
    const brg = c.facing ? FACING[c.facing] : null;
    const hi = storeyHi[c.storey] || 0, top = b.top || blockTop[c.bid] || 0, midS = storeyMid[c.storey] || 0, topSrc = b.top ? 'HDB' : 'sales';
    const floorPos = midS <= 3 ? 'low floor' : midS <= 6 ? 'lower-mid' : !top ? 'mid' : hi >= top ? (topSrc === 'HDB' ? 'top floor band' : 'top band (highest ever sold here)') : hi >= top - 3 ? 'near the top' : 'mid';
    const blk = nearestInSector.bind(null, b.lat, b.lon, D.blocks.filter((x) => Math.abs(x.lat - b.lat) < 0.004 && Math.abs(x.lon - b.lon) < 0.004 && x !== b));
    const outlook = brg == null ? null : blk(brg, 30, 120);
    const parkF = brg == null ? null : parkInSector(b.lat, b.lon, brg, 45, 300);
    return {
      brg, sun: c.facing ? SUN[c.facing] : null, floorPos, top, topSrc,
      outlook, parkF, park: nearestPark(b.lat, b.lon),
      cc500: within(b.lat, b.lon, CC, 500), cc1k: within(b.lat, b.lon, CC, 1000), ccN: nearest(b.lat, b.lon, CC),
      ecN: nearest(b.lat, b.lon, EC), funN: nearest(b.lat, b.lon, FUN),
      sites: SITES.map((s) => ({ s, d: haversine(b.lat, b.lon, s.lat, s.lon) })).filter((x) => x.d <= x.s.radius_m + 500).sort((x, y) => x.d - y.d),
      bus300: within(b.lat, b.lon, BUS, 300), busN: nearest(b.lat, b.lon, BUS), services: BR.routes.length ? new Set([...routesNear(b.lat, b.lon, 300)].map((i) => BR.routes[i].ref)).size : null,
      food500: within(b.lat, b.lon, FOOD, 500), cafe500: within(b.lat, b.lon, FOOD.filter((f) => f.t === 'cafe'), 500),
    };
  }
  function metrics(c) {
    const b = D.blocks[c.bid], P = S.profile;
    const sqft = c.sqm * SQFT, psf = c.price / sqft;
    const blk12 = statsFor(blockTx[c.bid], c.ft, lastMonthIdx - 11, lastMonthIdx);
    const blkAny12 = statsFor(blockTx[c.bid], null, lastMonthIdx - 11, lastMonthIdx);
    const blkAll = statsFor(blockTx[c.bid], c.ft, 0, lastMonthIdx);
    const tt = townTx(b.t), town12 = statsFor(tt, c.ft, lastMonthIdx - 11, lastMonthIdx);
    const townSqm = median(tt.filter((i) => TX.ft[i] === c.ft && TX.m[i] >= lastMonthIdx - 23).map((i) => TX.a[i]));
    const bench = benchmark(c, b), refPsf = bench.psf, refSrc = bench.src;
    const fair = refPsf ? refPsf * sqft : null, premium = fair ? c.price / fair - 1 : null;
    const cov = fair ? Math.max(0, c.price - fair) : 0;
    const leaseNow = leaseYearsLeft(b), lease10 = leaseNow == null ? null : leaseNow - 10;
    const coverTo95 = coversToAge(leaseNow, P.age, CPF_AGE);
    const conf = bench.tier <= 2 ? 'strong' : bench.tier <= 4 ? 'moderate' : 'weak';
    const mrt = nearest(b.lat, b.lon, D.mrt.stations), exit = nearest(b.lat, b.lon, D.mrt.exits);
    const mallN = nearest(b.lat, b.lon, MALLS), malls1k = within(b.lat, b.lon, MALLS, 1000);
    const superN = nearest(b.lat, b.lon, SUPERS), super500 = within(b.lat, b.lon, SUPERS, 500);
    const fmrt = nearest(b.lat, b.lon, FUTST), bto1k = within(b.lat, b.lon, BTOP, 1000), btoUnits = bto1k.reduce((t, x) => t + (x.units || 0), 0);
    const ps1 = within(b.lat, b.lon, primarySchools, 1000), ps2 = within(b.lat, b.lon, primarySchools, 2000), psN = nearest(b.lat, b.lon, primarySchools), hk = nearest(b.lat, b.lon, POI.hawkers);
    const work = (S.workplaces || []).map((w) => ({ w, d: haversine(b.lat, b.lon, w.lat, w.lon), bus: BR.routes.length ? directBus(b.lat, b.lon, w.lat, w.lon) : null })), workTotal = work.length ? work.reduce((t, x) => t + x.d, 0) : null;
    const mid = storeyMid[c.storey], storeyLbl = mid == null ? '—' : mid <= 6 ? 'Low' : mid <= 12 ? 'Mid' : mid <= 24 ? 'High' : 'Very high';
    return { c, b, sqft, psf, mallN, malls1k, superN, super500, fmrt, bto1k, btoUnits, env: envMetrics(c, b), work, workTotal, conf, bench, blk12, blkAny12, blkAll, town12, townSqm, refPsf, refSrc, fair, premium, cov, leaseNow, lease10, coverTo95, mrt, exit, ps1, ps2, psN, hk, storeyLbl, mid,
      town1y: trend(tt, c.ft, 1), town3y: trend(tt, c.ft, 3), town5y: trend(tt, c.ft, 5), blk3y: trend(blockTx[c.bid], null, 3) };
  }
  // mode: 'simple' → plain words in the money / lease / supply lines (B10, core/plain.js); same flags and numbers
  function verdict(m, mode = store.get('ui.mode')) {
    const flags = [];
    if (m.premium != null) flags.push(premiumFlag(m.premium, m.bench.short)); // ./comparables.js: same bands + "unusual" beyond ±20% (7b B13)
    flags.push(...money.glance(m, mode)); // instalment + cash lines from the Afford plan (./money.js, 7a A1)
    if (m.coverTo95 != null) flags.push(m.coverTo95 ? ['good', '✓', t('lease covers youngest owner to 95 (full CPF use)')] : ['warn', '!', t('lease does not cover youngest owner to 95 — HDB/CPF will lower the loan and CPF use (not in these figures)')]);
    if (m.leaseNow != null && m.leaseNow < CPF_MIN_LEASE) flags.push(['critical', '✕', t('under {0} y lease left — CPF cannot be used', [CPF_MIN_LEASE])]); else if (m.lease10 != null && m.lease10 < RESALE_WATCH_LEASE) flags.push(['warn', '!', t(mode === 'simple' ? 'in 10 years only buyers aged {0}+ can use their CPF in full — fewer buyers when you sell' : 'in 10 y only buyers aged {0}+ get full CPF — smaller resale pool', [Math.ceil(CPF_AGE - m.lease10)])]);
    if (m.mrt) flags.push(m.mrt.d <= 600 ? ['good', '✓', t('{0} to MRT (~{1} min walk)', [fmt.m(m.mrt.d), Math.max(3, Math.round(m.mrt.d * 1.25 / 80))])] : m.mrt.d <= 1000 ? ['neutral', '•', t('{0} to MRT (~{1} min walk)', [fmt.m(m.mrt.d), Math.round(m.mrt.d * 1.25 / 80)])] : ['warn', '!', t('{0} to nearest MRT (~{1} min walk)', [fmt.m(m.mrt.d), Math.round(m.mrt.d * 1.25 / 80)])]);
    m.work.forEach(({ w, bus }) => { if (bus && bus.length) flags.push(['good', '✓', t('direct bus to {0}: {1}', [w.name, bus.slice(0, 4).join(', ')])]); });
    m.work.slice(0, 3).forEach(({ w, d }) => flags.push(d <= 5000 ? ['good', '✓', distTo(d, w.name)] : d <= 12000 ? ['neutral', '•', distTo(d, w.name)] : ['warn', '!', t('{0} to {1} — long commute', [fmt.m(d), w.name])]));
    const e = m.env;
    if (m.fmrt && m.fmrt.d <= 800 && m.fmrt.p.year) flags.push(['good', '✓', `${t('{0} to future {1} MRT', [fmt.m(m.fmrt.d), m.fmrt.p.n])} (${m.fmrt.p.year})`]);
    flags.push(...fv.badges(m, mode)); // MOP wave nearby (./futurevalue-ui.js)
    if (e.sun && (e.sun[0] === 'serious' || e.sun[0] === 'good')) flags.push([e.sun[0] === 'good' ? 'good' : 'serious', e.sun[0] === 'good' ? '✓' : '▲', t('{0}-facing: {1}', [m.c.facing, e.sun[1]])]);
    if (e.funN && e.funN.d <= 300) flags.push(['warn', '!', `${distTo(e.funN.d, e.funN.p.n)} (${t(e.funN.p.t)})`]);
    if (e.sites.length && e.sites[0].d <= e.sites[0].s.radius_m) flags.push(['warn', '!', t('within former {0} area (approx.)', [e.sites[0].s.name.replace(/ \(.*\)/, '')])]);
    if (e.parkF) flags.push(['good', '✓', t('faces {0}', [e.parkF.p.n])]);
    if (m.superN && m.superN.d <= 400) flags.push(['good', '✓', distTo(m.superN.d, m.superN.p.n)]);
    if (m.mallN && m.mallN.d <= 500) flags.push(['good', '✓', distTo(m.mallN.d, m.mallN.p.n)]);
    if (CC.length && e.cc500.length) flags.push(['good', '✓', t('{0} childcare within 500 m', [e.cc500.length])]);
    if (primarySchools.length) flags.push(m.ps1.length ? ['good', '✓', m.ps1.length > 1 ? t('{0} primary schools within 1 km', [m.ps1.length]) : t('{0} primary school within 1 km', [m.ps1.length])] : ['warn', '!', t('no primary school within 1 km (P1 priority)')]);
    return flags;
  }

  // ------------------------------------------------------------------ compare table
  // k / sec stay English: they are lookup keys (SIMPLE_KEYS, ROW_TERMS, ROWS()); translated at render
  const NA = `<span class="muted">${t('n/a')}</span>`;
  const setFacing = (m) => fillLink({ target: 'flat', id: m.c.id, field: 'facing', text: 'facing' }); // → this flat's edit form, "Main windows face"
  const BASE_ROWS = [
    { sec: 'Price & value' },
    { k: 'Asking price', f: (m) => fmt.money(m.c.price), v: (m) => m.c.price, best: 'min', tip: t('What the seller is asking. Lower is not always better — see the premium row.') },
    { k: '$ per sqft', f: (m) => fmt.psf(m.psf), fs: (m) => m.psf == null ? '—' : t('{0} per sq ft', ['S$' + Math.round(m.psf).toLocaleString()]), v: (m) => m.psf, best: 'min', tip: t('Asking price ÷ floor area. The cleanest way to compare flats of different sizes.') },
    { k: 'Recent sales benchmark', f: (m) => m.refPsf ? `${fmt.psf(m.refPsf)}<small>${t('{0}, same flat type · <b>{1}</b> comparables', [m.refSrc, t(m.conf)])}</small>` : '—', tip: t('Median $psf of comparable sales, most specific available: this block (12 m, then 24 m) → blocks within 400 m with a similar lease start → the town with similar lease → the town overall. Storey and renovation are not adjusted.') },
    { k: 'Premium vs. recent sales', f: (m) => m.premium == null ? '—' : `<span class="tag ${m.premium > 0.08 ? 'serious' : m.premium < -0.03 ? 'good' : 'neutral'}">${fmt.pct(m.premium)}</span><small>${t('fair value ≈ {0}', [fmt.k(m.fair)])}</small>`,
      slbl: t('Price vs recent sales'), fs: (m) => m.premium == null ? '—' : `<span class="tag ${m.premium > 0.08 ? 'serious' : m.premium < -0.03 ? 'good' : 'neutral'}">${fmt.pct(m.premium)}</span><small>${t('similar flats sold for about {0}', [fmt.k(m.fair)])}</small>`, v: (m) => m.premium, best: 'min', tip: t('How far the asking price sits above/below what comparable flats actually sold for. Above ~8% you are likely paying cash-over-valuation.') },
    { k: 'Possible COV (if valued at recent sales)', f: (m) => m.cov ? `${fmt.money(m.cov)}<small>${t('scenario: HDB values it at the benchmark ({0} comparables)', [t(m.conf)])}</small>` : `S$0<small>${t('asking is at or below recent sales')}</small>`, v: (m) => m.cov, best: 'min', tip: t('HDB valuations are not published, so this is a scenario, not an estimate of the actual valuation. COV = price − HDB valuation, payable in cash only. Assumes the valuation lands on the recent-sales benchmark; valuers adjust for floor, renovation and view, so real COV is usually smaller — but budget a buffer, especially when comparables are weak.') },
    { sec: 'Can we afford it?' },
    { sec: 'Lease & future value' },
    { k: 'Remaining lease today', f: (m) => `${fmt.yrs(m.leaseNow)}<small>${t('lease from {0}', [m.b.lease])}</small>`, v: (m) => m.leaseNow, best: 'max', tip: t('{0}-year lease counted from the block\'s lease start (January assumed). Older flats are cheaper but lose value faster as the lease shortens.', [LEASE_TERM]) },
    { k: 'Lease covers youngest owner to 95', f: (m) => m.coverTo95 == null ? householdLink(store.get('household'), 'age') : m.coverTo95 ? `<span class="tag good">✓ ${t('Yes')}</span>` : `<span class="tag warn">! ${t('No')}</span><small>${t('need {0} y, has {1} y', [CPF_AGE - S.profile.age, m.leaseNow.toFixed(0)])}</small>`, tip: t('If the remaining lease does not cover the youngest owner to age {0}, CPF use and the HDB loan LTV are pro-rated; with under {1} y left, CPF cannot be used at all.', [CPF_AGE, CPF_MIN_LEASE]) },
    { k: 'Lease in 10 years (when you may sell)', f: (m) => m.lease10 == null ? '—' : `${fmt.yrs(m.lease10)}${m.lease10 < RESALE_WATCH_LEASE ? `<small style="color:var(--serious-ink)">${t('full CPF only for buyers aged {0}+', [Math.ceil(CPF_AGE - m.lease10)])}</small>` : ''}`, v: (m) => m.lease10, best: 'max', tip: t('When you sell, a buyer gets full CPF use only if the lease covers them to {0}, so younger buyers face pro-rated CPF and HDB loans — a smaller pool and softer prices. With under {1} y left no buyer can use CPF.', [CPF_AGE, CPF_MIN_LEASE]) },
    { k: 'Town price trend (same type)', f: (m) => `${t('1 y {0} · 3 y {1} · 5 y {2}', [fmt.pct(m.town1y, 0), fmt.pct(m.town3y, 0), fmt.pct(m.town5y, 0)])}<small>${t('median $psf change')}</small>`, v: (m) => m.town3y, best: 'max', tip: t('How median $psf for this flat type in this town moved. Past appreciation is not a guarantee, but shows demand.') },
    { k: 'Block price trend (3 y, all types)', f: (m) => m.blk3y == null ? `<span class="muted">${t('too few sales')}</span>` : fmt.pct(m.blk3y, 0), v: (m) => m.blk3y, best: 'max', tip: t('Median $psf change of this specific block over 3 years (needs ≥ 3 sales in each window).') },
    { k: 'Upcoming BTO supply within 1 km', f: (m) => BTOP.length ? `${m.bto1k.length === 1 ? t('{0} project', [m.bto1k.length]) : t('{0} projects', [m.bto1k.length])}${m.btoUnits ? ` · ${t('~{0} units', [m.btoUnits.toLocaleString()])}` : ''}<small>${m.bto1k.slice(0, 3).map((x) => esc(x.n)).join(', ')}${m.bto1k.length > 3 ? '…' : ''}</small>` : NA, v: (m) => m.btoUnits, tip: t('New flats being built nearby: they compete with you when you resell (after their 5-year MOP) but also bring new amenities. From an external BTO listing — coverage and positions are approximate.') },
    { k: 'Block liquidity', f: (m) => `${t('{0} sales last 12 m', [m.blkAny12.n])}<small>${m.blk12.last != null ? t('last same-type: {0}', [fmtMonth(TX.m[m.blk12.last]) + ', ' + fmt.k(TX.p[m.blk12.last]) + ', ' + storeyName(D.storeys[TX.s[m.blk12.last]])]) : t('no same-type sale last 12 m')}</small>`, v: (m) => m.blkAny12.n, best: 'max', tip: t('Active blocks are easier to value and to resell later.') },
    { sec: 'Location & convenience' },
    { k: 'Nearest MRT', f: (m) => m.mrt ? `${fmt.m(m.mrt.d)}<small>${esc(stn(m.mrt.p.n))} (${m.mrt.p.codes.join('/')})${m.exit ? ' · ' + t('nearest exit {0}', [fmt.m(m.exit.d)]) : ''}</small>` : '—', v: (m) => m.mrt ? m.mrt.d : null, best: 'min', tip: t('Straight-line distance to the station centre; walking is usually 20–30% longer. ≤ 500 m ≈ 6-min walk.') },
    { k: 'Nearest future MRT station', f: (m) => m.fmrt ? `${m.fmrt.d <= 800 ? '<span class="tag good">✓ ' : '<span class="tag neutral">'}${fmt.m(m.fmrt.d)}</span><small>${esc(m.fmrt.p.n)} · ${m.fmrt.p.lines.join('/') || t('safeguarded')} · ${t(m.fmrt.p.status)}${m.fmrt.p.year ? ' · ' + m.fmrt.p.year : ''}</small>` : NA, v: (m) => m.fmrt ? m.fmrt.d : null, best: 'min', tip: t('Stations under construction or planned (URA Master Plan 2025 positions; lines/years from LTA announcements). A new station within ~800 m historically lifts resale demand once it opens — a common "future value" driver.') },
    { k: 'Primary schools within 1 km', f: (m) => primarySchools.length ? `${m.ps1.length}<small>${m.ps1.slice(0, 3).map((s) => esc(s.n)).join(', ')}${m.ps1.length > 3 ? '…' : ''}</small>` : `<span class="muted">${lateWait('data/poi.js') ? t('Loading…') : t('poi.js missing')}</span>`, v: (m) => m.ps1.length, best: 'max', tip: t('P1 registration gives priority to homes within 1 km, then 1–2 km. Matters most if the children are under 7.') },
    { k: 'Primary schools within 2 km', f: (m) => primarySchools.length ? `${m.ps2.length}` : '—', v: (m) => m.ps2.length, best: 'max', tip: t('Second priority band for P1 registration.') },
    { k: 'Nearest primary school', f: (m) => m.psN ? `${fmt.m(m.psN.d)}<small>${esc(m.psN.p.n)}</small>` : '—', v: (m) => m.psN ? m.psN.d : null, best: 'min' },
    { k: 'Nearest shopping mall', f: (m) => m.mallN ? `${fmt.m(m.mallN.d)}<small>${esc(m.mallN.p.n)}${m.malls1k.length > 1 ? ` · ${t('{0} malls within 1 km', [m.malls1k.length])}` : ''}</small>` : NA, v: (m) => m.mallN ? m.mallN.d : null, best: 'min', tip: t('OpenStreetMap shop=mall. Groceries, food courts, clinics and enrichment classes under one roof — a big daily convenience for families, and malls anchor resale demand.') },
    { k: 'Nearest supermarket', f: (m) => m.superN ? `${fmt.m(m.superN.d)}<small>${esc(m.superN.p.n)}${m.super500.length > 1 ? ` · ${t('{0} within 500 m', [m.super500.length])}` : ''}</small>` : NA, v: (m) => m.superN ? m.superN.d : null, best: 'min', tip: t('OpenStreetMap shop=supermarket (FairPrice, Sheng Siong, Giant, Cold Storage, Prime…). Groceries within a short walk matter daily, especially with young kids.') },
    { k: 'Nearest hawker centre', f: (m) => m.hk ? `${fmt.m(m.hk.d)}<small>${esc(m.hk.p.n)}</small>` : '—', v: (m) => m.hk ? m.hk.d : null, best: 'min', tip: t('Cheap family meals within walking distance — a daily-life convenience.') },
    { k: 'Town / region', f: (m) => `${esc(title(D.towns[m.b.t]))}<small>${t(D.zones[m.b.t])}</small>` },
    { sec: 'Environment & feng shui' },
    { k: 'Sun & heat (window facing)', f: (m) => m.c.facing ? `<span class="tag ${m.env.sun[0]}">${m.c.facing}</span> ${m.env.sun[1]}` : setFacing(m), tip: t('Near the equator the sun tracks east→west almost overhead; west/south-west windows get the hot 2–6 pm sun (higher aircon bills, faded furniture). North/south facing is the classic preference.') },
    { k: 'Floor position', f: (m) => `${storeyName(D.storeys[m.c.storey])}<small>${t(m.env.floorPos)}${m.env.top ? (m.env.topSrc === 'HDB' ? ' · ' + t('block has {0} storeys (HDB)', [m.env.top]) : ' · ' + t('highest storey sold here: {0}', [m.env.top])) : ''}</small>`, tip: t('Top floor: hotter ceiling, water-tank/lift-motor noise, but no upstairs neighbours. Low floors (≤3): road & void-deck noise, less privacy, more insects, easier with strollers/elderly. Block top is inferred from the highest storey ever transacted.') },
    { k: 'Outlook in facing direction', f: (m) => m.c.facing ? (m.env.outlook ? `${t('faces a block ~{0} away', [fmt.m(m.env.outlook.d)])}<small>${esc(m.env.outlook.p.label)}</small>` : `<span class="tag good">${t('open')}</span><small>${t('no HDB block within 120 m in that direction')}</small>`) : setFacing(m), v: (m) => m.c.facing ? (m.env.outlook ? m.env.outlook.d : 999) : null, best: 'max', tip: t('Uses HDB block coordinates only (no condos, landed, or future sites) — treat as a hint and verify on site.') },
    { k: 'Park', f: (m) => m.env.park ? `${m.env.parkF ? `<span class="tag good">${t('faces park')}</span> ` : ''}${distTo(m.env.park.d, esc(m.env.park.p.n))}${m.env.park.p.reserve ? ' ' + t('(nature reserve)') : ''}` : NA, v: (m) => m.env.park ? m.env.park.d : null, best: 'min', tip: t('Distance to the edge of the nearest NParks park/reserve. "Faces park" = park within 300 m in the window direction (±45°).') },
    { k: 'Childcare within 500 m', f: (m) => CC.length ? `${m.env.cc500.length}<small>${t('{0} within 1 km', [m.env.cc1k.length])} · ${t('nearest {0}', [m.env.ccN ? fmt.m(m.env.ccN.d) + ' ' + esc(m.env.ccN.p.n) : '—'])}</small>` : NA, v: (m) => m.env.cc500.length, best: 'max', tip: t('ECDA-licensed childcare centres and kindergartens. Walking distance matters twice a day.') },
    { k: 'Nearest eldercare centre', f: (m) => m.env.ecN ? `${fmt.m(m.env.ecN.d)}<small>${esc(m.env.ecN.p.n)}</small>` : NA, tip: t('MOH eldercare list (senior activity / day-care centres). Useful if parents will live with or near you; nursing homes are not published separately.') },
    { k: 'Nearest funeral parlour / columbarium / cemetery', f: (m) => m.env.funN ? `${m.env.funN.d <= 300 ? '<span class="tag warn">! ' : '<span class="tag neutral">'}${fmt.m(m.env.funN.d)}</span><small>${esc(m.env.funN.p.n)} · ${t(m.env.funN.p.t)}</small>` : NA, v: (m) => m.env.funN ? m.env.funN.d : null, best: 'max', tip: t('NEA-listed active facilities. Many buyers avoid direct line of sight or < 300 m; resale demand can be affected regardless of your own view.') },
    { k: 'Former burial ground nearby', f: (m) => SITES.length ? (m.env.sites.length ? `<span class="tag ${m.env.sites[0].d <= m.env.sites[0].s.radius_m ? 'warn' : 'neutral'}">${m.env.sites[0].d <= m.env.sites[0].s.radius_m ? '! ' + t('inside area') : t('{0} from edge', [fmt.m(m.env.sites[0].d - m.env.sites[0].s.radius_m)])}</span><small>${esc(m.env.sites[0].s.name)} · ${esc(m.env.sites[0].s.period || '')} · <a href="${esc(m.env.sites[0].s.source)}" target="_blank" rel="noopener">${t('source')}</a> · ${t('approx.')}</small>` : `<span class="tag good">${t('none known')}</span><small>${t('within 500 m of the curated list')}</small>`) : NA, tip: t('From comparer/curated_sites.json — a hand-kept list of well-documented former cemeteries (Bidadari, Bishan, Tiong Bahru…). Centres and radii are approximate; add or correct entries in that file.') },
    { k: 'Bus stops within 300 m', f: (m) => BUS.length ? `${m.env.bus300.length}${m.env.services != null ? ` <small style="display:inline">· ${t('{0} services', [m.env.services])}</small>` : ''}<small>${t('nearest {0}', [m.env.busN ? fmt.m(m.env.busN.d) + ' · ' + esc(m.env.busN.p.n.replace(/^Bus stop\b/, t('Bus stop'))) : '—'])}</small>` : NA, v: (m) => m.env.bus300.length, best: 'max', tip: t('LTA bus stops. Several within 300 m usually means more routes and a shorter first/last mile.') },
    { k: 'Cafés & eateries within 500 m', f: (m) => FOOD.length ? `${m.env.food500.length}<small>${t('{0} cafés', [m.env.cafe500.length])} · ${m.env.food500.slice(0, 3).map((f) => esc(f.n)).join(', ')}${m.env.food500.length > 3 ? '…' : ''}</small>` : NA, v: (m) => m.env.food500.length, best: 'max', tip: t('OpenStreetMap cafés, restaurants, fast food and food courts (coverage varies; hawker centres are a separate row).') },
    { sec: 'The flat itself' },
    { k: 'Floor area', f: (m) => `${t('{0} sqm · {1} sqft', [m.c.sqm, Math.round(m.sqft)])}<small>${m.townSqm ? (m.c.sqm >= m.townSqm ? t('at/above town median {0} sqm', [Math.round(m.townSqm)]) : t('below town median {0} sqm', [Math.round(m.townSqm)])) : ''}</small>`, v: (m) => m.c.sqm, best: 'max', tip: t('A family of 4 typically wants ≥ 90 sqm (4-room) — check against the town\'s typical size for this type.') },
    { k: 'Storey', f: (m) => `${storeyRange(D.storeys[m.c.storey])}<small>${t('{0} floor', [t(m.storeyLbl)])}</small>`, v: (m) => m.mid, best: 'max', tip: t('Higher floors: better views, breeze, less noise, usually resell better. Lower floors: cheaper, no lift wait, easier with strollers.') },
    { k: 'Flat type', f: (m) => ftName(m.c.ft) },
    { k: 'Listing', f: (m) => m.c.url ? `<a href="${esc(m.c.url)}" target="_blank" rel="noopener">${t('open ↗')}</a>` : fillLink({ target: 'flat', id: m.c.id, field: 'url', text: 'url' }) },
  ];
  if (!BTO_ON) BASE_ROWS.splice(BASE_ROWS.findIndex((x) => x.k === 'Upcoming BTO supply within 1 km'), 1); // removed, not shown as —
  function commuteRows() {
    const W = S.workplaces || []; if (!W.length) return [{ sec: 'Commute' }, { k: 'Workplaces', f: () => fillLink({ target: 'places', text: 'places' }) }];
    const rows = [{ sec: 'Commute (straight-line; road/MRT ≈ 1.3–1.5×)' }];
    // k stays English (lookup key); lbl is the displayed label for these per-place rows
    W.forEach((w, wi) => rows.push({ k: `To ${esc(w.name)}`, lbl: t('To {0}', [esc(w.name)]), f: (m) => `${fmt.m(m.work[wi].d)}<small>${esc(w.label)}${m.work[wi].bus ? (m.work[wi].bus.length ? ` · <b>${t('direct bus {0}', [m.work[wi].bus.slice(0, 6).join(', ') + (m.work[wi].bus.length > 6 ? '…' : '')])}</b>` : ' · ' + t('no direct bus (stops ≤300 m → ≤400 m)')) : ''}</small>`, v: (m) => m.work[wi].d, best: 'min', tip: t('Straight-line distance from the block to this place. Under ~5 km is usually a short bus/MRT hop; over 12 km means a long daily commute.') }));
    if (W.length > 1) rows.push({ k: 'All places combined', f: (m) => fmt.m(m.workTotal), v: (m) => m.workTotal, best: 'min', tip: t('Sum of the distances above — a rough proxy for the household\'s total daily travel.') });
    return rows;
  }
  const ROWS = () => { const r = money.insert(BASE_ROWS.slice()); const at = r.findIndex((x) => x.sec === 'Location & convenience'); r.splice(at, 0, ...commute.rows(), ...commuteRows()); r.splice(r.findIndex((x) => x.k === 'Premium vs. recent sales') + 1, 0, comps.row()); return family.insert(cpfLife.insert(fv.insert(r))); };
  const rowLabel = (r) => r.lbl ?? t(r.k);
  // "What matters most to you?" above the table, drawer hint + header note while ticks exist (./priorities.js, 7b B1)
  const prio = createPriorities({ store, money, family, rows: ROWS, verdict, metrics, choices: () => S.choices, bandKm: policy.get('p1.distance.bands_km')[0], body: $('cmpBody'), rerender: () => renderCompare(), goCommute: () => showTab('explore') });
  const cards = createCompareCards({ body: $('cmpBody'), rerender: () => renderChoices() }); // ./cmpcards.js (≤ 767 px); renderChoices: list empty line + compare
  function renderCompare() {
    const body = $('cmpBody'), n = S.choices.length;
    $('choiceCount').textContent = n; $('drawerHint').textContent = n ? (n > 1 ? t('{0} flats · green = best in row', [n]) : t('{0} flat · green = best in row', [n])) : t('add flats to compare them side by side');
    if (cards.on()) { const ms = S.choices.map(metrics); return cards.render(ms, simpleRows(ROWS()), { verdict, label: rowLabel, simple: store.get('ui.mode') !== 'pro', color: colorOf, before: n ? prio.html(ms, { phone: true }) : '', after: n ? comps.panel(ms) + fv.panel(ms) : '', note: prio.headerNote, head: (m) => cards.head(esc(m.b.label), D.flat_types[m.c.ft], D.storeys[m.c.storey]) }); }
    if (!n) { body.innerHTML = `<div class="empty" style="margin:14px 0">${t('Add at least one flat under <b>My choices</b>, or click a block on the map.')}</div>`; return; }
    const ms = S.choices.map(metrics);
    const wins = ms.map(() => 0);
    let html = prio.html(ms) + '<table class="cmp"><thead><tr><th class="lbl"></th>' + ms.map((m, i) => `<th><div class="hd"><i class="sw" style="background:${colorOf(i)}"></i><div>${i + 1}. ${esc(m.c.name)}<small>${esc(m.b.label)} · ${ftName(m.c.ft)}</small></div></div>${brief.button(m.c)}</th>`).join('') + '</tr></thead><tbody>';
    // verdict row
    html += `<tr><th class="lbl">${t('At a glance')}</th>` + ms.map((m) => `<td class="verdict">${verdict(m).map(([cls, ic, txt]) => `<div class="tag ${cls}" style="margin:2px 0;display:flex">${ic} ${esc(txt)}</div>`).join('')}</td>`).join('') + '</tr>';
    const rows = simpleRows(ROWS());
    for (const r of rows) {
      if (r.sec) { html += `<tr class="sec"><th class="lbl">${t(r.sec)}</th><td colspan="${n}"></td></tr>`; continue; }
      let bestIdx = new Set();
      if (r.v && n > 1) { const vals = ms.map(r.v); const valid = vals.map((v, i) => [v, i]).filter(([v]) => v != null && !isNaN(v)); if (valid.length > 1) { const bv = r.best === 'min' ? Math.min(...valid.map(([v]) => v)) : Math.max(...valid.map(([v]) => v)); valid.forEach(([v, i]) => { if (v === bv) bestIdx.add(i); }); if (bestIdx.size === valid.length) bestIdx = new Set(); } }
      bestIdx.forEach((i) => wins[i]++);
      const label = rowLabel(r);
      html += `<tr><th class="lbl">${label}${r.tip ? `<button type="button" class="info" data-tip="${esc(r.tip)}" data-term-id="${ROW_TERMS[r.k] || ''}" aria-label="${t('About {0}', [esc(label)])}">i</button>` : ''}</th>` + ms.map((m, i) => `<td class="num ${bestIdx.has(i) ? 'best' : ''}">${r.f(m)}</td>`).join('') + '</tr>';
    }
    html += '</tbody></table>';
    body.innerHTML = html + comps.panel(ms) + fv.panel(ms);
    // wins summary into the header cells
    body.querySelectorAll('thead th:not(.lbl)').forEach((th, i) => { const s = document.createElement('small'); s.style.color = 'var(--good-ink)'; s.textContent = n > 1 ? prio.headerNote(i) ?? t('best in {0} of {1} measures', [wins[i], rows.filter((r) => r.v).length]) : ''; th.querySelector('.hd > div').appendChild(s); });
    const ph = prio.hint(ms); if (ph) $('drawerHint').textContent = ph; // 7b B1: "fits your ticks best" while ticks exist
  }
  // Flat brief (print one A4 page per flat) + Copy table (TSV) + Download CSV: ./brief.js
  const brief = createBrief({ policy, D, choices: () => S.choices, metrics, verdict, rows: ROWS, rowLabel, simpleKeys: SIMPLE_KEYS, mode: () => store.get('ui.mode'), facts: blockFacts, schools: () => primarySchools, stn,
    town: (b) => title(D.towns[b.t]), ftName, storeyName, money: fmt.money, dataTo: () => fmtMonth(lastMonthIdx), banner: showBanner, body: $('cmpBody'), list: $('choiceList'), csvBtn: $('csvDownload'),
    planFor: money.planFor, glance: (m) => money.glance(m, store.get('ui.mode')), store, why: prio.why }); // 7b B4 money box (./briefmoney.js)

  // ------------------------------------------------------------------ choices UI + map pins
  function renderChoices() {
    const el = $('choiceList');
    if (!S.choices.length) { el.innerHTML = `<div class="empty">${tapOr('Nothing yet. Add a flat above or click a block on the map.', 'Nothing yet. Add a flat below or tap a block on the map.')}</div>`; }
    else el.innerHTML = S.choices.map((c, i) => { const m = metrics(c); return `<div class="card" style="border-left-color:${colorOf(i)}"><div class="t"><b>${i + 1}. ${esc(c.name)}</b><small>${esc(m.b.label)}</small></div><div class="m">${cards.ftLabel(D.flat_types[c.ft])} · ${cards.storeyLabel(D.storeys[c.storey])} · ${t('{0} sqm', [c.sqm])} · ${esc(title(D.towns[m.b.t]))}</div><div class="k"><span>${fmt.money(c.price)}</span><span><b>${fmt.psf(m.psf)}</b></span><span>${m.premium == null ? '' : t('{0} vs sales', [`<b style="color:${m.premium > 0.08 ? 'var(--serious-ink)' : m.premium < -0.03 ? 'var(--good-ink)' : 'inherit'}">${fmt.pct(m.premium, 0)}</b>`])}</span><span>${t('{0} lease', [fmt.yrs(m.leaseNow)])}</span>${m.mrt ? `<span>${t('{0} MRT', [fmt.m(m.mrt.d)])}</span>` : ''}</div><div class="a"><button class="btn sm primary" data-a="afford" data-id="${c.id}">${t('Afford')}</button><button class="btn sm" data-a="zoom" data-id="${c.id}">${t('Show on map')}</button><button class="btn sm" data-brief="${c.id}" aria-label="${esc(t('Flat brief for {0}', [c.name]))}">${t('Brief')}</button><button class="btn sm" data-a="edit" data-id="${c.id}">${t('Edit')}</button><button class="btn sm danger" data-a="del" data-id="${c.id}">${t('Remove')}</button></div></div>`; }).join('');
    renderPins(); renderCompare();
    bus.emit('choices:list', { list: S.choices.map(choiceFocus) }); // P8 M-01: the flat bar's ‹ › and "Which flat?" (shell/flatbar.js)
  }
  // the focus for one shortlisted flat: the Afford button here, and the flat bar's ‹ › / "Which flat?" rows (P8 M-01)
  function choiceFocus(c) { const m = metrics(c); return { source: 'choice', choiceId: c.id, bid: c.bid, label: c.name, price: c.price, flatType: D.flat_types[c.ft], remainingLease: m.leaseNow, cov: m.cov || 0 }; }
  function renderPins() {
    layers.choices.clearLayers(); layers.rings.clearLayers();
    S.choices.forEach((c, i) => { const b = D.blocks[c.bid], col = colorOf(i);
      L.marker([b.lat, b.lon], { icon: L.divIcon({ className: '', html: `<div class="pin" style="background:${col}"><span>${i + 1}</span></div>`, iconSize: [26, 26], iconAnchor: [13, 26] }), zIndexOffset: 1000 }).bindTooltip(`<b>${esc(c.name)}</b><br>${esc(b.label)} · ${fmt.money(c.price)}`).on('click', () => openBlock(c.bid)).addTo(layers.choices);
      L.circle([b.lat, b.lon], { renderer: canvas, radius: 1000, color: col, weight: 1.5, dashArray: '4 4', fill: true, fillOpacity: 0.04, interactive: false }).addTo(layers.rings);
    });
  }
  $('shareChoices').addEventListener('click', async () => {
    if (!S.choices.length) return showBanner(t('Add flats to your shortlist first.'));
    const link = shareLink();
    // 7c C6: say inline what the receiver sees; no prompt() when the clipboard is blocked — the link is shown to copy
    const note = $('shareNote'), sees = esc(t("They'll see addresses, flat types and asking prices — not your names or money."));
    try { await navigator.clipboard.writeText(link); note.innerHTML = `<b>${esc(t('Link copied ✓'))}</b> ${sees}`; note.hidden = false; }
    catch { note.innerHTML = `${esc(t('Copy this link:'))} <input type="text" readonly class="share-link" aria-label="${esc(t('Share link'))}" value="${esc(link)}"> ${sees}`; note.hidden = false; note.querySelector('input').select(); }
  });
  $('printSummary').addEventListener('click', () => { openDrawer(true); setTimeout(() => window.print(), 300); });
  $('choiceList').addEventListener('click', (e) => { const btn = e.target.closest('button[data-a]'); if (!btn) return; const c = S.choices.find((x) => x.id === +btn.dataset.id); if (!c) return;
    if (btn.dataset.a === 'afford') { store.set('focus', choiceFocus(c)); showTab('afford'); return; }
    if (btn.dataset.a === 'del') { const at = S.choices.indexOf(c); S.choices = S.choices.filter((x) => x !== c); renderChoices(); save(); // M-17: Undo line, no confirm
      offerUndo(t('Removed {0}.', [c.name]), () => { if (!S.choices.some((x) => x.id === c.id)) { S.choices.splice(Math.min(at, S.choices.length), 0, c); renderChoices(); save(); } }, { focusAfter: () => document.querySelector(`#choiceList [data-a="del"][data-id="${c.id}"]`) }); }
    else if (btn.dataset.a === 'edit') editChoice(c);
    else if (btn.dataset.a === 'zoom') { const b = D.blocks[c.bid]; bus.emit('phone:show-map'); viewTo([b.lat, b.lon], 16); openBlock(c.bid); } // phone: Map tab first (P-41)
  });
  $('choiceForm').addEventListener('submit', (e) => { e.preventDefault(); const c = choiceFromForm(); if (!c) return; const k = S.choices.findIndex((x) => x.id === c.id); if (k >= 0) S.choices[k] = c; else S.choices.push(c); resetForm(); renderChoices(); save(); openDrawer(true); });
  $('cReset').addEventListener('click', resetForm);
  $('clearChoices').addEventListener('click', () => { if (!S.choices.length) return; const was = S.choices; S.choices = []; renderChoices(); save(); // M-17: Undo line instead of confirm()
    offerUndo(was.length > 1 ? t('Removed all {0} flats.', [was.length]) : t('Removed {0}.', [was[0].name]), () => { S.choices = [...was, ...S.choices.filter((x) => !was.some((w) => w.id === x.id))]; renderChoices(); save(); }, { focusAfter: () => $('clearChoices') }); });
  $('cFt').addEventListener('change', () => { const bi = $('cAddr').dataset.bid; if (bi != null && bi !== '') { const same = blockTx[+bi].filter((i) => TX.ft[i] === +$('cFt').value && TX.m[i] >= lastMonthIdx - 23); if (same.length) { $('cSqm').value = Math.round(median(same.map((i) => TX.a[i]))); if (!$('cId').value) $('cPrice').value = Math.round(median(same.map((i) => TX.p[i])) / 1000) * 1000; } } });

  // ------------------------------------------------------------------ explore UI
  function renderFtChips() { $('ftChips').innerHTML = presetChips(D.flat_types, S.ft) + D.flat_types.map((f, i) => `<button class="chip ${S.ft.includes(i) ? 'on' : ''}" data-i="${i}">${flatTypeLabel(f)}</button>`).join(''); }
  $('ftChips').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return;
    if (b.dataset.ftPreset) { const idx = presetIdx(D.flat_types, b.dataset.ftPreset); if (idx.length) { S.ft = idx; renderFtChips(); renderBlocks(); save(); $('ftChips').querySelector(`[data-ft-preset="${b.dataset.ftPreset}"]`)?.focus(); } return; }
    const i = +b.dataset.i; S.ft = S.ft.includes(i) ? S.ft.filter((x) => x !== i) : [...S.ft, i]; renderFtChips(); renderBlocks(); save(); });
  $('ftFamily').addEventListener('click', () => { S.ft = familyFt.slice(); renderFtChips(); renderBlocks(); save(); });
  $('colorBy').addEventListener('change', (e) => { S.colorBy = e.target.value; renderBlocks(); save(); });
  wireSeg($('chipLabel'), (v) => { S.chipLabel = v; save(); renderView(); }); // box labels: block number ↔ value (only boxes + legend redraw)
  const syncColorBy = () => { const r = document.querySelector(`#colorBy input[value="${S.colorBy}"]`); if (r) r.checked = true; };
  // calculation window (under the legend) + sales-history slider (./period.js) derive S.mFrom / S.mTo; defaults = today's [NM − 12, NM − 1]
  const per = mountPeriod({ months: D.months, S, fmtMonth, monthName: (mm) => new Date(2000, mm - 1, 1).toLocaleString(currentLang() === 'zh' ? 'zh-SG' : 'en-SG', { month: 'short' }), save, onChange: () => renderBlocks() });
  function renderTowns() {
    const only = t('only');
    $('towns').innerHTML = zoneOrder.filter((z) => townsByZone[z]).map((z) => { const ts = townsByZone[z], all = ts.every((ti) => S.towns.includes(ti)), some = ts.some((ti) => S.towns.includes(ti));
      return `<div class="zone"><label class="check"><input type="checkbox" data-z="${z}" ${all ? 'checked' : ''} ${!all && some ? 'data-ind="1"' : ''}>${t(z)}<button class="link only" data-onlyz="${z}">${only}</button></label><div class="towns">${ts.map((ti) => `<label class="check"><input type="checkbox" data-t="${ti}" ${S.towns.includes(ti) ? 'checked' : ''}>${title(D.towns[ti])}<button class="link only" data-only="${ti}">${only}</button></label>`).join('')}</div></div>`; }).join('');
    $('towns').querySelectorAll('input[data-ind]').forEach((i) => { i.indeterminate = true; });
    if ($('areaSummary')) $('areaSummary').textContent = townsSummary();
  }
  $('towns').addEventListener('click', (e) => { const only = e.target.closest('button[data-only], button[data-onlyz]'); if (!only) return; e.preventDefault(); S.towns = only.dataset.only != null ? [+only.dataset.only] : townsByZone[only.dataset.onlyz].slice(); renderTowns(); renderBlocks(); save(); });
  $('towns').addEventListener('change', (e) => { const i = e.target; if (i.dataset.t != null) { const t = +i.dataset.t; S.towns = i.checked ? [...S.towns, t] : S.towns.filter((x) => x !== t); } else if (i.dataset.z) { const ts = townsByZone[i.dataset.z]; S.towns = i.checked ? [...new Set([...S.towns, ...ts])] : S.towns.filter((x) => !ts.includes(x)); } renderTowns(); renderBlocks(); save(); });
  $('townsAll').addEventListener('click', () => { S.towns = D.towns.map((_, i) => i); renderTowns(); renderBlocks(); save(); });
  $('townsNone').addEventListener('click', () => { S.towns = []; renderTowns(); renderBlocks(); save(); });
  function applyLayers() { for (const k in layers) { const on = !!S.layers[k] && (!ZOOM_GATED[k] || map.getZoom() >= ZOOM_GATED[k]); if (on && !map.hasLayer(layers[k])) layers[k].addTo(map); if (!on && map.hasLayer(layers[k])) map.removeLayer(layers[k]); const cb = document.querySelector(`#layers input[data-l="${k}"]`); if (cb) cb.checked = !!S.layers[k]; } fam.sync(S.layers); msheet.syncLayers(); /* P8 8c: group lines */ }
  map.on('zoomend', applyLayers);
  $('layers').addEventListener('change', (e) => { const k = e.target.dataset.l; S.layers[k] = e.target.checked; applyLayers(); save(); if (e.target.checked && ZOOM_GATED[k] && map.getZoom() < ZOOM_GATED[k]) { showBanner(t('{0} appear once you zoom in to street level (zoom {1}+) — zooming in now', [t(LAYER_NAMES[k]), ZOOM_GATED[k]])); const c = S.choices.length ? [D.blocks[S.choices[0].bid].lat, D.blocks[S.choices[0].bid].lon] : map.getCenter(); map.setView(c, ZOOM_GATED[k]); } });

  // ------------------------------------------------------------------ layer quick links, collapsible sections, more filters
  const setAllLayers = (on) => { for (const k in layers) if (!['blocks', 'choices'].includes(k)) S.layers[k] = on; applyLayers(); save(); };
  $('layersAll').addEventListener('click', () => setAllLayers(true));
  $('layersNone').addEventListener('click', () => setAllLayers(false));
  $('layersDefault').addEventListener('click', () => { S.layers = Object.assign({}, defaults().layers); applyLayers(); save(); });
  document.querySelectorAll('.section.collapsible > h3').forEach((h) => { h.addEventListener('click', (e) => { if (e.target.closest('.link')) return; const sec = h.parentElement; sec.classList.toggle('collapsed'); const t = h.querySelector('.tog'); const open = !sec.classList.contains('collapsed'); t.textContent = open ? '▾' : '▸'; t.setAttribute('aria-expanded', open); S.ui = S.ui || {}; S.ui[sec.id] = open; save(); }); });
  (S.ui || {}) && Object.entries(S.ui || {}).forEach(([id, open]) => { const sec = $(id); if (sec) { sec.classList.toggle('collapsed', !open); const t = sec.querySelector('.tog'); if (t) { t.textContent = open ? '▾' : '▸'; t.setAttribute('aria-expanded', open); } } });
  const FILT_IDS = { pmin: 'fPmin', pmax: 'fPmax', lmin: 'fLmin', lmax: 'fLmax', amin: 'fAmin', amax: 'fAmax', smin: 'fSmin', smax: 'fSmax', ymin: 'fYmin', ymax: 'fYmax' };
  function syncFilters() {
    for (const [k, id] of Object.entries(FILT_IDS)) $(id).value = S.filt[k] ?? '';
    document.querySelectorAll('#secFilters .chip').forEach((c) => c.classList.toggle('on', !!((c.dataset.pmax && +c.dataset.pmax === S.filt.pmax) || (c.dataset.lmin && +c.dataset.lmin === S.filt.lmin))));
    const parts = []; const f = S.filt;
    if (f.pmin != null || f.pmax != null) parts.push(t('price {0}–{1}', [f.pmin != null ? fmt.k(f.pmin) : '', f.pmax != null ? fmt.k(f.pmax) : '']));
    if (f.lmin != null || f.lmax != null) parts.push(t('lease {0}–{1} y', [f.lmin ?? '', f.lmax ?? '']));
    if (f.amin != null || f.amax != null) parts.push(t('{0}–{1} sqm', [f.amin ?? '', f.amax ?? '']));
    if (f.smin != null || f.smax != null) parts.push(t('storey {0}–{1}', [f.smin ?? '', f.smax ?? '']));
    if (f.ymin != null || f.ymax != null) parts.push(t('built {0}–{1}', [f.ymin ?? '', f.ymax ?? '']));
    $('filtSummary').textContent = parts.length ? '· ' + parts.join(' · ') : '';
    $('areaSummary').textContent = townsSummary();
  }
  function townsSummary() { return S.towns.length === D.towns.length ? '· ' + t('all towns') : '· ' + t('{0} of {1} towns', [S.towns.length, D.towns.length]); }
  const applyFilters = debounce(() => { for (const [k, id] of Object.entries(FILT_IDS)) { const v = $(id).value; S.filt[k] = v === '' ? null : +v; } syncFilters(); renderBlocks(); save(); }, 250);
  Object.values(FILT_IDS).forEach((id) => $(id).addEventListener('input', applyFilters));
  $('secFilters').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; if (c.dataset.pmax) S.filt.pmax = S.filt.pmax === +c.dataset.pmax ? null : +c.dataset.pmax; if (c.dataset.lmin) S.filt.lmin = S.filt.lmin === +c.dataset.lmin ? null : +c.dataset.lmin; syncFilters(); renderBlocks(); save(); });
  $('filtReset').addEventListener('click', (e) => { e.stopPropagation(); S.filt = Object.assign({}, defaults().filt); syncFilters(); renderBlocks(); save(); });

  // ------------------------------------------------------------------ profile UI
  // The household lives in the shared store (header chip → drawer). The compare rows read this flat view of it.
  function syncProfile() {
    const h = store.get('household'), hs = summarise(h);
    S.profile = { income: hs.income, age: hs.youngestAge };
  }
  syncProfile();
  store.subscribe('household', () => { syncProfile(); renderChoices(); });
  // Afford hand-offs: a block becomes the focus flat; Afford can push a budget onto the map
  function focusBlock(bi, tab = 'afford') { // price + flat type of the same sales (./handoff.js, A8)
    store.set('focus', ho.focus(bi, leaseYearsLeft(D.blocks[bi])));
    showTab(tab);
  }
  bus.on('nav:goto', ({ tab }) => showTab(tab));
  // fill links (core/filllink.js): "Add a daily place →" → My choices → Daily places, search focused; "Set the facing →" /
  // "Add the listing link →" → that flat's edit form, field focused. Phones: List view, the fold opened (./cmpcards.js)
  const focusField = (form, el) => setTimeout(() => { if (!form || !el) return; el.scrollIntoView?.({ block: 'center' }); el.focus({ preventScroll: true }); form.classList.remove('ho-flash'); void form.offsetWidth; form.classList.add('ho-flash'); setTimeout(() => form.classList.remove('ho-flash'), FLASH_MS); }, 0);
  bus.on('fill:open', ({ target, field, id } = {}) => {
    if (target === 'places') { showTab('choices'); cards.reveal('choices-daily'); focusField($('workForm'), $('wPlace')); }
    else if (target === 'flat') { const c = S.choices.find((x) => x.id === id); if (!c || !FLAT_INPUT[field]) return; editChoice(c); cards.reveal('choices-add'); focusField($('choiceForm'), $(FLAT_INPUT[field])); }
  });
  bus.on('panel:resized', coverPopups);
  // P1 distance rings from the Plan tab: { lat, lon, radiiKm, label } or null to clear
  let p1Rings = null;
  const offMap = () => !$('tab-explore').classList.contains('active');
  bus.on('explore:rings', (r) => {
    const fresh = !p1Rings;
    if (p1Rings) { map.removeLayer(p1Rings); p1Rings = null; }
    if (!r) return;
    if (fresh && offMap()) bus.emit('phone:show-map'); // "Show rings" from Plan → Map at peek (P-41); a focus change keeps the page
    p1Rings = L.layerGroup(r.radiiKm.map((km, i) => L.circle([r.lat, r.lon], { radius: km * 1000, renderer: canvas, interactive: false, color: i ? '#7c3aed' : '#16a34a', weight: 2, dashArray: '6 6', fillOpacity: i ? 0.03 : 0.07 }))).addTo(map);
    fitTo(L.latLng(r.lat, r.lon).toBounds(r.radiiKm[r.radiiKm.length - 1] * 2000));
  });
  bus.on('explore:budget', ({ maxPrice, apply }) => {
    S.budgetMax = maxPrice || null;
    if (apply && S.budgetMax) { S.colorBy = 'budget'; S.filt.pmax = Math.round(S.budgetMax * (1 + BUDGET_STRETCH)); syncColorBy(); syncFilters(); showTab('explore'); bus.emit('phone:show-map'); } // phone: sheet at peek (P-41)
    if (S.colorBy === 'budget') renderBlocks();
  });

  // ------------------------------------------------------------------ tabs, drawer, misc
  function showTab(name) { document.querySelectorAll('.tabs button').forEach((b) => { b.classList.toggle('active', b.dataset.tab === name); b.setAttribute('aria-selected', String(b.dataset.tab === name)); if (b.dataset.tab === name) b.scrollIntoView?.({ inline: 'nearest', block: 'nearest' }); }); document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name)); }
  document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });
  function openDrawer(v) { const d = $('drawer'); const open = v == null ? !d.classList.contains('open') : v; d.classList.toggle('open', open); const tg = $('drawerToggle'); tg.textContent = open ? '▼' : '▲'; tg.setAttribute('aria-expanded', String(open)); tg.setAttribute('aria-label', open ? t('Close the comparison') : t('Open the comparison')); } // 7c C4: a named toggle
  $('drawerBar').addEventListener('click', (e) => { if (!e.target.closest('button') || e.target.id === 'drawerToggle') openDrawer(); });
  $('copyTsv').addEventListener('click', (e) => { e.stopPropagation(); if (!S.choices.length) return; navigator.clipboard.writeText(brief.tsv()).then(() => showBanner(t('Comparison table copied — paste into Google Sheets or Excel.')), () => showBanner(t('Copy failed — your browser blocked clipboard access.'))); });
  $('fitSg').addEventListener('click', () => viewTo([1.3521, 103.8198], 12));
  $('fitChoices').addEventListener('click', () => { if (!S.choices.length) return showBanner(t('No choices yet — add flats first.')); fitTo(L.latLngBounds(S.choices.map((c) => [D.blocks[c.bid].lat, D.blocks[c.bid].lon])).pad(0.3)); });

  // ------------------------------------------------------------------ workplaces & daily places
  const wIn = $('wPlace'), wList = $('wList'); let wItems = [], wHi = -1, wSel = null, picking = false, placeIdx = null;
  const places = createPlaces({ store, places: () => S.workplaces || [], focusAt: () => { const f = store.get('focus'); return f && f.bid != null ? D.blocks[f.bid] || null : null; } }); // "This place is" + parents → PHG per flat (./places.js, 7b B12)
  const pickBanner = (() => { const d = document.createElement('div'); d.className = 'picking-banner'; d.textContent = t('Click the map where this place is · Esc to cancel'); $('mapwrap').appendChild(d); return d; })();
  // blocks, streets, towns (中文 too), MRT, schools, malls, polyclinics, hawkers, parks — nothing typed leaves the browser
  const findPlaces = (q) => searchPlaces(placeIdx || (placeIdx = buildPlaceIndex({ hdb: D, poi: POI, family: window.HDB_FAMILY || null, t, lang: currentLang() })), q);
  function wRender(miss = false) { wList.innerHTML = miss ? `<div class="miss">${t('Not found — try the street name, an MRT station or a school nearby')}</div>` : wItems.map((r, k) => `<div data-i="${k}" class="${k === wHi ? 'hi' : ''}"><span class="kind ${r.kind}">${t(kindLabel(r.kind))}</span>${esc(r.label)}<small>${esc(r.sub)}</small></div>`).join(''); wList.classList.toggle('open', wItems.length > 0 || miss); }
  function wSet(sel) { wSel = sel; wIn.value = sel ? sel.label : ''; $('wMeta').innerHTML = sel ? `✓ ${esc(sel.sub || sel.label)} (${sel.lat.toFixed(4)}, ${sel.lon.toFixed(4)})` : t('Search, or <button type="button" class="link" id="wPick">pick on the map</button>.'); }
  const wSearch = debounce(() => { const q = wIn.value.trim(); wItems = findPlaces(q); wHi = wItems.length ? 0 : -1; wRender(!wItems.length && q.length >= MISS_MIN); }, 250);
  wIn.addEventListener('input', () => { wSel = null; wSearch(); });
  wIn.addEventListener('keydown', (e) => { if (!wItems.length) return; if (e.key === 'ArrowDown') { wHi = (wHi + 1) % wItems.length; wRender(); e.preventDefault(); } else if (e.key === 'ArrowUp') { wHi = (wHi - 1 + wItems.length) % wItems.length; wRender(); e.preventDefault(); } else if (e.key === 'Enter') { wSet(wItems[wHi]); wItems = []; wRender(); e.preventDefault(); } else if (e.key === 'Escape') { wItems = []; wRender(); } });
  wList.addEventListener('mousedown', (e) => { const d = e.target.closest('div[data-i]'); if (d) { wSet(wItems[+d.dataset.i]); wItems = []; wRender(); e.preventDefault(); } });
  wIn.addEventListener('blur', () => setTimeout(() => { wItems = []; wRender(); }, 150));
  function startPick() { pickBanner.textContent = tapOr('Click the map where this place is · Esc to cancel', 'Tap the map where this place is'); bus.emit('phone:show-map'); picking = true; $('map').classList.add('picking'); pickBanner.classList.add('show'); map.closePopup(); openDrawer(false); } // phone: Map at peek (P-41)
  function stopPick() { picking = false; $('map').classList.remove('picking'); pickBanner.classList.remove('show'); }
  $('wMeta').addEventListener('click', (e) => { if (e.target.id === 'wPick') startPick(); });
  map.on('click', (e) => { if (!picking) return; stopPick(); wSet({ label: t('Map pin ({0}, {1})', [e.latlng.lat.toFixed(4), e.latlng.lng.toFixed(4)]), sub: t('picked on map'), lat: e.latlng.lat, lon: e.latlng.lng, kind: 'place' }); showTab('choices'); $('wName').focus(); }); // back to the Daily places form (was the retired 'profile' tab)
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && picking) stopPick(); });
  $('workForm').addEventListener('submit', (e) => { e.preventDefault(); if (!wSel) { alert(t('Pick a place from the suggestions or on the map.')); return; } S.workplaces = S.workplaces || []; S.workplaces.push({ id: S.nextId++, name: $('wName').value.trim() || wSel.label, label: wSel.label, lat: wSel.lat, lon: wSel.lon, kind: places.kind() }); $('workForm').reset(); wSet(null); renderWork(); renderChoices(); save(); });
  $('wCancel').addEventListener('click', () => { $('workForm').reset(); wSet(null); stopPick(); });
  function renderWork() {
    const W = S.workplaces || [];
    $('workList').innerHTML = W.length ? W.map((w) => `<div class="wcard">${swatch('work', 22)}<div class="n"><b>${esc(w.name)}</b><small>${places.small(w)}</small></div><button class="btn sm" data-wz="${w.id}">${t('Map')}</button><button class="btn sm danger" data-wd="${w.id}">✕</button></div>`).join('') : `<div class="empty">${t('No places yet — add an office, childcare, or grandparents\' home.')}</div>`;
    layers.work.clearLayers();
    W.forEach((w) => glyph('work', w).bindTooltip(`<b>${esc(w.name)}</b><br>${esc(w.label)}`).addTo(layers.work));
    places.sync(); // parents' place → store household.parentsPlace (7b B12)
  }
  $('workList').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.wd) { S.workplaces = S.workplaces.filter((w) => w.id !== +b.dataset.wd); renderWork(); renderChoices(); save(); } else if (b.dataset.wz) { const w = S.workplaces.find((x) => x.id === +b.dataset.wz); bus.emit('phone:show-map'); viewTo([w.lat, w.lon], 15); } });

  // ------------------------------------------------------------------ map search (blocks, towns, MRT, schools)
  const mIn = $('mSearch'), mList = $('mList'); let mItems = [], mHi = -1;
  const townBounds = D.towns.map((_, ti) => { const pts = D.blocks.filter((b) => b.t === ti).map((b) => [b.lat, b.lon]); return pts.length ? L.latLngBounds(pts) : null; });
  loadTownAliases(); // 7b B15
  function mSearch(q) {
    const zh = zhTownSearch(q, D.towns), town = (i) => ({ kind: 'town', ...zhTownRow(title(D.towns[i]), D.towns[i], t(D.zones[i])), i }); q = zh.rest; // 7b B15
    const nq = canon(q); if (nq.length < 2) return zh.towns.map(town);
    const toks = tokens(q), hit = (str) => hits(str, toks); // punctuation + abbreviations both ways (core/searchnorm.js)
    const res = [];
    D.towns.forEach((tn, i) => { if (hit(tn) || zh.towns.includes(i)) res.push(town(i)); });
    D.mrt.stations.forEach((st) => { if (hit(stn(st.n) + ' ' + st.codes.join(' ') + ' MRT')) res.push({ kind: 'mrt', label: stn(st.n) + ' MRT', sub: st.codes.join(' · '), p: st }); });
    POI.schools.forEach((sc) => { if (hit(sc.n)) res.push({ kind: 'school', label: tidyName(sc.n), sub: sc.lvl.toLowerCase(), p: sc }); });
    SUPERS.forEach((m) => { if (hit(m.n + ' supermarket')) res.push({ kind: 'place', label: m.n, sub: t('supermarket'), p: m }); });
    MALLS.forEach((m) => { if (hit(m.n + ' mall')) res.push({ kind: 'place', label: m.n, sub: t('shopping mall'), p: m }); });
    FUTST.forEach((st) => { if (hit(st.n + ' MRT future')) res.push({ kind: 'mrt', label: st.year ? t('{0} MRT (future {1})', [st.n, st.year]) : t('{0} MRT (future)', [st.n]), sub: st.lines.join(', ') || t(st.status), p: st }); });
    BTOP.forEach((b) => { if (hit(b.n + ' BTO')) res.push({ kind: 'block', label: b.n + ' (BTO)', sub: b.units ? t('{0} units', [b.units]) : 'BTO', p: b }); });
    res.sort((x, y) => x.label.length - y.label.length); res.length = Math.min(res.length, 4);
    const bl = []; for (let i = 0; i < NB && bl.length < 40; i++) { if (hit(D.blocks[i].addr)) bl.push(i); } // 7c C3: best address match first
    bl.sort((x, y) => rankOf(D.blocks[x].addr, toks) - rankOf(D.blocks[y].addr, toks)).slice(0, 10 - res.length).forEach((i) => res.push({ kind: 'block', label: D.blocks[i].label, sub: title(D.towns[D.blocks[i].t]), i }));
    return res;
  }
  // M-13: the empty search offers your flats, daily places and picked towns (./searchshortcuts.js, local data only)
  const mShort = () => searchShortcuts({ choices: S.choices, places: S.workplaces, towns: S.towns, townCount: D.towns.length, townName: (i) => title(D.towns[i]), choiceSub: (c) => `${cards.ftLabel(D.flat_types[c.ft])} · ${fmt.money(c.price)}`, hasBlock: (bid) => !!D.blocks[bid] });
  function mRender() { mList.innerHTML = mItems.map((r, k) => `${groupHead(mItems, k)}<div data-i="${k}" class="${k === mHi ? 'hi' : ''}"><span class="kind ${r.kind}">${t(kindLabel(r.kind))}</span>${esc(r.label)}<small>${esc(r.sub)}</small></div>`).join(''); mList.classList.toggle('open', mItems.length > 0); }
  function mPick(k) {
    const r = mItems[k]; if (!r) return; mItems = []; mRender(); mIn.value = r.label; if (msheet.phone()) mIn.blur(); // phone: drop the keyboard; wider: focus stays (a11y audit)
    if (r.kind === 'block') { const b = D.blocks[r.i]; viewTo([b.lat, b.lon], 17); openBlock(r.i); focusCard(r.i); }
    else if (r.kind === 'town') { if (!S.towns.includes(r.i)) { S.towns.push(r.i); renderTowns(); renderBlocks(); save(); } if (msheet.phone()) bus.emit('sheet:size', 'peek'); if (townBounds[r.i]) fitTo(townBounds[r.i].pad(0.1)); }
    else if (r.kind === 'school' && primarySchools.includes(r.p)) { viewTo([r.p.lat, r.p.lon], 15); card.openSchool(r.p); if (!S.layers.schools) { S.layers.schools = true; applyLayers(); save(); } } // B3: school card (./schoolcard.js)
    else { viewTo([r.p.lat, r.p.lon], 16); if (!msheet.row(`<b>${esc(r.label)}</b> · ${esc(r.sub)} · ${t('tap a nearby blue block to add a flat')}`)) L.popup({ maxWidth: 260 }).setLatLng([r.p.lat, r.p.lon]).setContent(`<div class="pop"><h4>${esc(r.label)}</h4><div class="sub">${esc(r.sub)} · ${t('click a nearby blue block to add a flat')}</div></div>`).openOn(map); /* phone: one row at peek */ if (r.kind === 'school' && !S.layers.schools && r.p.lvl === 'PRIMARY') { S.layers.schools = true; applyLayers(); save(); } if (r.kind === 'school' && r.p.lvl === 'SECONDARY' && !S.layers.secondary) { S.layers.secondary = true; applyLayers(); save(); } }
  }
  // a11y audit: the picked block's card takes the focus (its title), so the keyboard does not fall back to the page
  const focusCard = (key) => { const h = document.querySelector(`.bc-win[data-key="${key}"] .bc-wt`); if (!h) return; h.tabIndex = -1; h.focus({ preventScroll: true }); };
  mIn.addEventListener('input', () => { const q = mIn.value.trim(); mItems = q ? mSearch(mIn.value) : mShort(); mHi = q && mItems.length ? 0 : -1; mRender(); });
  mIn.addEventListener('focus', () => { mItems = mIn.value.trim() ? mSearch(mIn.value) : mShort(); if (!mIn.value.trim()) mHi = -1; mRender(); });
  mIn.addEventListener('keydown', (e) => { if (e.key === 'Escape') { mItems = []; mRender(); mIn.blur(); return; } if (!mItems.length) return; if (e.key === 'ArrowDown') { mHi = (mHi + 1) % mItems.length; mRender(); e.preventDefault(); } else if (e.key === 'ArrowUp') { mHi = (mHi - 1 + mItems.length) % mItems.length; mRender(); e.preventDefault(); } else if (e.key === 'Enter') { mPick(mHi); e.preventDefault(); } });
  mList.addEventListener('mousedown', (e) => { const d = e.target.closest('div[data-i]'); if (d) { mPick(+d.dataset.i); e.preventDefault(); } });
  mIn.addEventListener('blur', () => setTimeout(() => { mItems = []; mRender(); }, 150));

  // ------------------------------------------------------------------ area price stats (viewport or circle)
  let circling = false, circleCenter = null, tempCircle = null, circleLayer = null;
  function areaStats(pred) {
    const ftSet = new Set(S.ft), townSet = new Set(S.towns); const prices = [], psfs = [], now = [], prev = []; let blocks = 0;
    for (let bi = 0; bi < NB; bi++) { const b = D.blocks[bi]; if (!townSet.has(b.t) || !pred(b) || !blockOk(b)) continue; let any = false;
      for (const i of blockTx[bi]) { if (!ftSet.has(TX.ft[i]) || !txOk(i)) continue; const mo = TX.m[i]; if (mo >= lastMonthIdx - 11) now.push(PSF[i]); else if (mo >= lastMonthIdx - 23) prev.push(PSF[i]); if (mo < S.mFrom || mo > S.mTo) continue; prices.push(TX.p[i]); psfs.push(PSF[i]); any = true; }
      if (any) blocks++; }
    const avg = (a) => a.length ? a.reduce((t, x) => t + x, 0) / a.length : null;
    return { blocks, n: prices.length, medP: median(prices), avgP: avg(prices), medPsf: median(psfs), avgPsf: avg(psfs), yoy: now.length >= 5 && prev.length >= 5 ? median(now) / median(prev) - 1 : null };
  }
  function renderArea() {
    msheet.areaRefresh(); // phones: the Area prices view reads the same stats (once per burst, only while it is open)
    const box = $('abBody'); let title, st; const mini = (s) => { $('abMini').textContent = s; };
    if (S.area) { title = areaTitle(); st = areaStats(areaPred()); }
    else if (map.getZoom() < 14) { $('abTitle').textContent = t('Prices in view'); mini('· ' + t('zoom in')); box.innerHTML = `<div class="ab-note">${tapOr('Zoom in (≥ 14), <b>circle</b> or <b>draw</b> an area to see prices for it — uses the flat-type, period and More filters.', 'Zoom in close, or circle an area, to see prices for it. Uses the flat types, period and More filters.')}</div>`; return; }
    else { const bb = map.getBounds(); title = t('Prices in view'); st = areaStats((b) => bb.contains([b.lat, b.lon])); }
    $('abTitle').textContent = title;
    if (!st.n) { mini('· ' + t('no sales')); box.innerHTML = `<div class="ab-note">${t('No transactions here for the selected flat types / period.')}</div>`; return; }
    mini('· ' + t('median {0} · {1} · {2} sales', [fmt.k(st.medP), t('{0} psf', ['S$' + Math.round(st.medPsf)]), st.n.toLocaleString()]));
    box.innerHTML = `<div class="ab-grid"><div class="st"><small>${t('Median price')}</small><b>${fmt.k(st.medP)}</b></div><div class="st"><small>${t('Average price')}</small><b>${fmt.k(st.avgP)}</b></div><div class="st"><small>${t('Median $psf')}</small><b>S$${Math.round(st.medPsf)}</b></div><div class="st"><small>${t('Average $psf')}</small><b>S$${Math.round(st.avgPsf)}</b></div><div class="st"><small>${t('Transactions')}</small><b>${st.n.toLocaleString()}</b></div><div class="st"><small>${t('Blocks · 12-m $psf change')}</small><b>${st.blocks} · ${st.yoy == null ? '—' : fmt.pct(st.yoy, 0)}</b></div></div><div class="ab-note">${S.ft.length === D.flat_types.length ? t('All flat types') : S.ft.map((i) => ftName(i)).join(', ')} · ${fmtMonth(S.mFrom)} – ${fmtMonth(S.mTo)}</div>`;
  }
  // --- area selection: S.area = {type:'circle', lat, lon, r} | {type:'poly', pts:[[lat,lon],...]}
  if (S.circle && !S.area) { S.area = { type: 'circle', lat: S.circle.lat, lon: S.circle.lon, r: S.circle.r }; S.circle = null; }
  let areaLayer = null, drawing = false, drawPts = [], sketchLine = null;
  const AREA_STYLE = { renderer: canvas, color: '#0b0b0b', weight: 2, dashArray: '6 4', fillColor: '#0b0b0b', fillOpacity: 0.06, interactive: false };
  // inPoly / polyAreaKm2 / tooSmall / roundPts: ./areasheet.js (moved unchanged; phones share them)
  const areaPred = () => { const A = S.area; if (!A) return null; return A.type === 'circle' ? (b) => haversine(A.lat, A.lon, b.lat, b.lon) <= A.r : (b) => inPoly(b.lat, b.lon, A.pts); };
  const areaTitle = () => { const A = S.area; return A.type === 'circle' ? t('Within {0} of the circle centre', [fmt.m(A.r)]) : t('Inside drawn area ({0} km²)', [polyAreaKm2(A.pts).toFixed(2)]); };
  function drawArea() { if (areaLayer) { map.removeLayer(areaLayer); areaLayer = null; } const A = S.area; if (A) { areaLayer = A.type === 'circle' ? L.circle([A.lat, A.lon], Object.assign({ radius: A.r }, AREA_STYLE)).addTo(map) : L.polygon(A.pts, AREA_STYLE).addTo(map); } $('abClear').style.display = A ? '' : 'none'; sel.syncArea(); } // emits explore:area
  function clearArea(redraw = true) { S.area = null; drawArea(); save(); if (redraw) renderArea(); }
  // circle: click centre, click radius
  function startCircle() { stopDraw(); clearArea(false); circling = true; circleCenter = null; $('map').classList.add('circling'); openDrawer(false); map.closePopup(); showBanner(tapOr('Click the centre of the area, then click again to set the radius · Esc to cancel', 'Tap the centre of the area, then tap again where the edge should be')); renderArea(); }
  function stopCircle() { circling = false; circleCenter = null; $('map').classList.remove('circling'); if (tempCircle) { map.removeLayer(tempCircle); tempCircle = null; } }
  $('abCircle').addEventListener('click', () => (circling ? stopCircle() : startCircle()));
  $('abClear').addEventListener('click', () => { stopCircle(); stopDraw(); clearArea(); });
  map.on('click', (e) => { if (!circling) return; if (!circleCenter) { circleCenter = e.latlng; tempCircle = L.circle(circleCenter, { radius: 300, color: '#0b0b0b', weight: 2, dashArray: '6 4', fillOpacity: 0.05, interactive: false }).addTo(map); return; } const r = Math.max(100, circleCenter.distanceTo(e.latlng)); S.area = { type: 'circle', lat: circleCenter.lat, lon: circleCenter.lng, r }; stopCircle(); drawArea(); renderArea(); save(); });
  map.on('mousemove', (e) => { if (circling && circleCenter && tempCircle) tempCircle.setRadius(Math.max(100, circleCenter.distanceTo(e.latlng))); });
  // freehand: press-and-drag to sketch; auto-closes on release
  // phones (./areasheet.js): keep = the old area stays until a new one is saved; ext = the finger stroke and its hint
  // (peek row, no banner) are run there, so the mouse handlers below stand aside
  let drawExt = false;
  function startDraw({ keep = false, ext = false } = {}) { stopCircle(); if (!keep) clearArea(false); drawing = true; drawExt = ext; drawPts = []; $('map').classList.add('drawing'); map.dragging.disable(); openDrawer(false); map.closePopup(); if (!ext) showBanner(t('Press and drag on the map to sketch the area — release to close it · Esc to cancel')); renderArea(); }
  function stopDraw() { if (!drawing) return; drawing = false; drawExt = false; $('map').classList.remove('drawing'); map.dragging.enable(); if (sketchLine) { map.removeLayer(sketchLine); sketchLine = null; } drawPts = []; }
  $('abDraw').addEventListener('click', () => (drawing ? stopDraw() : startDraw()));
  /** Save a drawn shape (desktop release, phones' finger stroke): false when too small. */
  function commitPoly(pts) { if (tooSmall(pts)) return false; S.area = { type: 'poly', pts: roundPts(pts) }; drawArea(); renderArea(); save(); return true; }
  const mapEl = $('map'); let drawActive = false, lastPx = null;
  mapEl.addEventListener('pointerdown', (e) => { if (!drawing || drawExt || e.button !== 0) return; drawActive = true; drawPts = []; lastPx = null; mapEl.setPointerCapture(e.pointerId); if (sketchLine) map.removeLayer(sketchLine); sketchLine = L.polyline([], { color: '#0b0b0b', weight: 2.5, dashArray: '6 4' }).addTo(map); e.preventDefault(); });
  mapEl.addEventListener('pointermove', (e) => { if (!drawing || !drawActive) return; if (lastPx && Math.hypot(e.clientX - lastPx[0], e.clientY - lastPx[1]) < 4) return; lastPx = [e.clientX, e.clientY]; const ll = map.mouseEventToLatLng(e); drawPts.push([ll.lat, ll.lng]); sketchLine.addLatLng(ll); });
  const finishDraw = () => { if (!drawing || !drawActive) return; drawActive = false; const pts = drawPts.slice(); stopDraw(); if (!commitPoly(pts)) showBanner(t('Area too small — press and drag a larger shape')); };
  mapEl.addEventListener('pointerup', finishDraw); mapEl.addEventListener('pointercancel', finishDraw);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (circling) stopCircle(); if (drawing) stopDraw(); } });
  map.on('moveend', debounce(() => { if (!S.area) renderArea(); }, 150));

  // ------------------------------------------------------------------ collapsible area box + side panel
  S.ui = S.ui || {};
  function setAreaCollapsed(c) { $('areaBox').classList.toggle('collapsed', c); $('abTog').textContent = c ? '▸' : '▾'; $('abTog').title = c ? t('Expand') : t('Collapse'); S.ui.areaBox = c; save(); }
  $('abTog').addEventListener('click', () => setAreaCollapsed(!$('areaBox').classList.contains('collapsed')));
  $('abTitle').addEventListener('click', () => setAreaCollapsed(!$('areaBox').classList.contains('collapsed')));
  if (S.ui.areaBox) setAreaCollapsed(true);
  function setPanelHidden(h) { $('app').classList.toggle('panel-hidden', h); $('panelToggle').textContent = h ? '▶' : '◀'; $('panelToggle').title = h ? t('Show side panel (\\ key)') : t('Hide side panel (\\ key)'); S.ui.panelHidden = h; save(); coverPopups(); setTimeout(() => map.invalidateSize(), 220); }
  $('panelToggle').addEventListener('click', () => setPanelHidden(!$('app').classList.contains('panel-hidden')));
  document.addEventListener('keydown', (e) => { if (e.key === '\\' && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { e.preventDefault(); setPanelHidden(!$('app').classList.contains('panel-hidden')); } });
  if (S.ui.panelHidden) setPanelHidden(true);
  coverPopups(); viewTo([1.3521, 103.8198], 12);
  // opening a tab from a map action (Add as choice, pick on map) should reveal the panel
  const showTabOrig = showTab; showTab = (name) => { if ($('app').classList.contains('panel-hidden')) setPanelHidden(false); showTabOrig(name); };

  // ------------------------------------------------------------------ init
  $('cFt').innerHTML = D.flat_types.map((f, i) => `<option value="${i}">${flatTypeLabel(f)}</option>`).join('');
  $('cStorey').innerHTML = storeyChoices.map(({ s, i }) => `<option value="${i}">${storeyRange(s)}</option>`).join('');
  function setFormDefaults() { const i4 = D.flat_types.indexOf('4 ROOM'); $('cFt').value = i4 >= 0 ? i4 : 0; $('cStorey').value = storeyChoices[Math.min(3, storeyChoices.length - 1)].i; }
  setFormDefaults();
  const setDataInfo = () => { $('dataInfo').textContent = `${t('{0} resale transactions', [D.row_count.toLocaleString()])} · ${D.months[0]} → ${D.months[NM - 1]} · ${t('{0} blocks', [D.blocks.length.toLocaleString()])}${POI.schools.length ? ` · ${t('{0} primary schools', [primarySchools.length])}` : ''}${FUTST.length ? ` · ${t('{0} future MRT', [FUTST.length])}` : ''}${CC.length ? ` · ${t('{0} childcare', [CC.length])}` : ''}${FOOD.length ? ` · ${t('{0} eateries', [FOOD.length.toLocaleString()])}` : ''} · ${t('built {0}', [D.generated_at.slice(0, 10)])}`; };
  setDataInfo();
  importShared(); createViews({ S, D, map, bus, save, per, fitTo, refresh: () => { renderFtChips(); renderTowns(); applyLayers(); syncColorBy(); syncFilters(); drawArea(); renderArea(); renderBlocks(); } }); // ./views.js saved map views + 'explore:view'
  buildStaticLayers(); renderFtChips(); renderTowns(); applyLayers(); syncColorBy(); syncFilters(); renderBlocks(); updateFormMeta(); renderWork(); renderChoices(); drawArea(); renderArea();
  // S1b: a late data file arrived (main.js, bus 'data:more') → re-bind it and redraw what uses it
  bus.on('data:more', ({ file }) => {
    bindLate();
    if (file === 'data/poi.js') { buildStaticLayers(true); applyLayers(); placeIdx = null; setDataInfo(); }
    if (file === 'data/commute.js') commute = makeCommute();
    if (file === 'data/commute.js' || (file === 'data/rents.js' && S.colorBy === 'rent')) renderBlocks(); else card.refresh();
    renderCompare();
  });
  msheet.start(); // phones: Map settings layout, "Area prices", + / − placement (and back at ≥ 768 px)
}
