// Explore — printable one-page "Flat brief" per shortlisted flat + shortlist CSV (phase 6b, AC 7).
// The brief is built from the compare-table rows (ROWS() in legacy.js), so rows added later (e.g. the
// future-value scorecard) appear automatically; empty rows are skipped. A preview <dialog> shows it with
// Print / Close; the printed copy is a plain block in #briefPrint (print CSS shows only that, A4 named page).
// One page: try the row set the user sees, then Simple rows, then smaller text, then fewer flags — each
// level measured off-screen at the A4 content width (fitLevels / chooseLevel).
// Privacy: everything stays local — the brief may show household-derived numbers (instalment, MSR) because
// it is only printed; the CSV is a Blob saved on this device. No network calls.
// Pure parts are exported for node tests; createBrief() wires the browser.
import { t, currentLang } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';
import { stripFillLinks } from '../../core/filllink.js';
import { withinKm, nearest } from '../../core/geo.js';
import { bus } from '../../core/bus.js';
import { moneyBoxHtml, moneyFor, MONEY_SECTION } from './briefmoney.js';

// UI layout constants (not rules)
export const PAGE_MM = { w: 186, h: 273 };   // A4 portrait 210 × 297 mm less the 12 mm @page margins
export const PX_PER_MM = 96 / 25.4;          // CSS reference pixel
export const FIT_SAFETY = 0.97;              // print font metrics differ slightly from screen
export const MAP_RADIUS_M = 1000;            // locator ring (P1 priority band); schools listed within it
export const MAP_MRT_M = 2000, MAP_MAX_M = 2500, MAP_MRT_MAX = 3, MAP_SCHOOL_MAX = 6;
export const FLAGS_SHORT = 8;                // the fewer-flags level keeps this many "At a glance" flags
export const FLAGS_MIN = 5;                  // B4: the last level (money box kept) — fewer still, lease notes left out, smaller map
// rows already in the brief header (or useless on paper) — not repeated under "Key numbers"
export const HEADER_KEYS = new Set(['Asking price', 'Flat type', 'Storey', 'Town / region', 'Listing']);
// their row tips become the "Lease & CPF notes" box
export const LEASE_KEYS = ['Remaining lease today', 'Lease covers youngest owner to 95', 'Lease in 10 years (when you may sell)'];
/** Phone layout (same breakpoint as styles/phone.css): the preview is the full-screen reading view. */
const isPhone = () => typeof matchMedia === 'function' && matchMedia('(max-width: 767px)').matches;

/** A row in plain words (B10): its Simple cell `fs` and label `slbl` when it has them; same key, `v` and tip. */
export const plainRow = (r) => (r.fs || r.slbl ? { ...r, f: r.fs || r.f, lbl: r.slbl ?? r.lbl } : r);

/**
 * Simple mode keeps SIMPLE_KEYS rows and rows flagged `simple`; sections left empty are dropped. Pro = all.
 * words: 'simple' (default for Simple) swaps in the plain-word cells; 'pro' keeps the Pro text (a Pro user's brief
 * shortened to the Simple rows still reads in Pro terms).
 */
export function pickRows(rows, simpleKeys, mode, words = mode) {
  if (mode === 'pro') return rows;
  const out = [], plain = words === 'simple';
  for (const r of rows) {
    if (r.sec) { if (out.length && out[out.length - 1].sec) out.pop(); out.push(r); }
    else if (simpleKeys.has(r.k) || r.simple) out.push(plain ? plainRow(r) : r);
  }
  if (out.length && out[out.length - 1].sec) out.pop();
  return out;
}

/** Cell HTML → plain text (the "Copy table" extraction: <small> becomes " (…)"). */
export const stripCell = (h) => String(h).replace(/<small[^>]*>/g, ' (').replace(/<\/small>/g, ')').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();

/** A cell with nothing to say for this flat: blank, a dash, or only a muted placeholder ("n/a", "set income"…). */
export function isEmptyCell(html) {
  const s = String(html ?? '').trim(), txt = stripCell(s);
  return !txt || txt === '—' || /^<span class="muted">[^<]*<\/span>$/.test(s);
}

/** Rows → [{ sec, rows: [{ k, label, html }] }] for one flat; header keys and empty rows / sections skipped. */
export function briefSections(rows, m, { label = (r) => r.k, skip = HEADER_KEYS } = {}) {
  const out = []; let cur = null;
  for (const r of rows) {
    if (r.sec) { cur = { sec: r.sec, rows: [] }; out.push(cur); continue; }
    if (skip.has(r.k)) continue;
    const html = stripFillLinks(r.f(m)); // paper: the "Add … →" fill links are not printed
    if (isEmptyCell(html)) continue;
    if (!cur) { cur = { sec: '', rows: [] }; out.push(cur); }
    cur.rows.push({ k: r.k, label: label(r), html });
  }
  return out.filter((s) => s.rows.length);
}

/** Tips of the lease rows, in LEASE_KEYS order (plain text). */
export const leaseNotes = (rows) => LEASE_KEYS.map((k) => rows.find((r) => r.k === k)?.tip).filter(Boolean);

/** A cell in a file (TSV / CSV): plain text; "Add … →" fill links left out (a cell that was only a link → "—"). */
export const fileCell = (html) => { const h = String(html ?? ''), s = stripFillLinks(h), txt = stripCell(s); return s !== h && !txt ? '—' : txt; };

/** Shortlist table as cells: header, one line per section (upper case), one per row; one column per flat. */
export function tableLines(rows, ms, label) {
  const lines = [[t('Measure'), ...ms.map((m) => m.c.name)]];
  for (const r of rows) lines.push(r.sec ? [t(r.sec).toUpperCase()] : [label(r), ...ms.map((m) => fileCell(r.f(m)))]);
  return lines;
}
export const tsvText = (lines) => lines.map((l) => l.join('\t')).join('\n');

export const BOM = '﻿'; // lets Excel open UTF-8 (中文) correctly
/** RFC 4180 quoting; a leading = or @ is neutralised so a typed nickname cannot run as a formula. */
export function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=@]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csvText = (lines) => BOM + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';

/** Fitting levels, least change first. A user in Simple mode starts at Simple rows. */
export function fitLevels(mode) {
  const lv = [
    { rows: 'pro', dense: false, flags: Infinity },
    { rows: 'simple', dense: false, flags: Infinity },
    { rows: 'simple', dense: true, flags: Infinity },
    { rows: 'simple', dense: true, flags: FLAGS_SHORT },
    // 7b B4: the money box stays at every level, so two more steps shrink the rest
    { rows: 'simple', dense: true, flags: FLAGS_SHORT, notes: false },
    { rows: 'simple', dense: true, flags: FLAGS_MIN, notes: false, tight: true },
  ];
  return mode === 'pro' ? lv : lv.slice(1);
}
/** First level whose height fits `limit` (an unmeasurable 0 / NaN counts as fitting); else the last. */
export function chooseLevel(levels, heightOf, limit) {
  for (let i = 0; i < levels.length; i++) if (!(heightOf(levels[i]) > limit)) return i;
  return levels.length - 1;
}

const RANK = { critical: 0, serious: 1, warn: 2, neutral: 3, good: 4 };
/** Keep the `max` most serious flags (warnings before good news), in their original order. */
export function trimFlags(flags, max = Infinity) {
  if (flags.length <= max) return { shown: flags, hidden: 0 };
  const keep = new Set(flags.map((f, i) => [RANK[f[0]] ?? 3, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, max).map(([, i]) => i));
  return { shown: flags.filter((_, i) => keep.has(i)), hidden: flags.length - max };
}

export const distText = (v) => (v < 1000 ? t('{0} m', [Math.round(v)]) : t('{0} km', [(v / 1000).toFixed(1)]));

/** Nearest MRT / LRT stations (≤ MAP_MRT_M, else the nearest one) and primary schools within the ring. */
export function nearby(centre, stations = [], schools = [], name = (p) => p.n) {
  let mrt = withinKm(stations, centre, MAP_MRT_M / 1000).slice(0, MAP_MRT_MAX);
  if (!mrt.length) { const n = nearest(stations, centre); if (n) mrt = [n]; }
  const all = withinKm(schools, centre, MAP_RADIUS_M / 1000);
  const pt = ({ item, km }) => ({ lat: item.lat, lon: item.lon, name: name(item), m: km * 1000 });
  return { mrt: mrt.map(pt), schools: all.slice(0, MAP_SCHOOL_MAX).map(pt), schoolCount: all.length };
}

export const LABEL_GAP = 12;   // SVG units: a station name this close to one already placed is left out (squares stay)
const LABEL_FS = 8.5, LABEL_CHAR = 0.56; // locator text size and an average glyph width (em) for the overlap test
/** Station names that fit (S1a): nearest first; a name whose anchor is within LABEL_GAP of a placed one, or whose box
 *  overlaps a placed box, is dropped (its square stays). items: [{ x, y, left, name }] → the same items + `show`. */
export function placeLabels(items, gap = LABEL_GAP) {
  const boxes = [];
  return items.map((it) => {
    const w = String(it.name || '').length * LABEL_FS * LABEL_CHAR, x0 = it.left ? it.x - 6 - w : it.x + 6;
    const box = { ax: it.x, ay: it.y, x0, x1: x0 + w, y0: it.y - LABEL_FS + 3, y1: it.y + 3 };
    const clash = boxes.some((b) => Math.hypot(b.ax - box.ax, b.ay - box.ay) < gap
      || (box.x0 < b.x1 && b.x0 < box.x1 && box.y0 < b.y1 && b.y0 < box.y1));
    if (!clash) boxes.push(box);
    return { ...it, show: !clash };
  });
}

/** Static SVG locator (no tiles): the block, a 1 km ring, MRT squares with names, school triangles, 500 m bar. */
export function locatorSvg({ centre, mrt = [], schools = [], radiusM = MAP_RADIUS_M, maxM = MAP_MAX_M }) {
  const S = 240, pad = 16, kx = 111320 * Math.cos((centre.lat * Math.PI) / 180), ky = 110574;
  const xy = (p) => [(p.lon - centre.lon) * kx, (centre.lat - p.lat) * ky]; // metres east / south
  const far = Math.min(maxM, Math.max(radiusM, ...[...mrt, ...schools].map((p) => Math.hypot(...xy(p)))));
  const k = (S / 2 - pad) / (far * 1.05);
  const at = (p) => { let [x, y] = xy(p); const d = Math.hypot(x, y); if (d > far) { x *= far / d; y *= far / d; } return [S / 2 + x * k, S / 2 + y * k]; };
  const f1 = (v) => v.toFixed(1), c = S / 2, r = radiusM * k, bar = 500 * k;
  const parts = [
    `<rect x="0.5" y="0.5" width="${S - 1}" height="${S - 1}" fill="#fff" stroke="#999"/>`,
    `<circle cx="${c}" cy="${c}" r="${f1(r)}" fill="none" stroke="#666" stroke-width="1" stroke-dasharray="4 3"/>`,
    `<text x="${f1(c + r * 0.72 + 3)}" y="${f1(c - r * 0.72 - 3)}" font-size="8" fill="#555">${esc(t('{0} km', ['1']))}</text>`,
  ];
  for (const s of schools) { const [x, y] = at(s); parts.push(`<path d="M${f1(x)} ${f1(y - 4.5)}L${f1(x + 4)} ${f1(y + 3)}L${f1(x - 4)} ${f1(y + 3)}Z" fill="#fff" stroke="#222" stroke-width="1.2"/>`); }
  const byNear = mrt.map((s, i) => ({ s, i })).sort((a, b) => (a.s.m ?? 0) - (b.s.m ?? 0) || a.i - b.i).map(({ s }) => s);
  for (const { x, y, left, name, show } of placeLabels(byNear.map((s) => { const [x, y] = at(s); return { x, y, left: x > S * 0.62, name: s.name }; }))) {
    parts.push(`<rect x="${f1(x - 3.5)}" y="${f1(y - 3.5)}" width="7" height="7" fill="#222"/>`);
    if (show) parts.push(`<text x="${f1(left ? x - 6 : x + 6)}" y="${f1(y + 3)}" font-size="${LABEL_FS}" fill="#111"${left ? ' text-anchor="end"' : ''}>${esc(name)}</text>`);
  }
  parts.push(`<circle cx="${c}" cy="${c}" r="6" fill="#111" stroke="#fff" stroke-width="2"/>`,
    `<path d="M${S - 16} 22V9M${S - 20} 13L${S - 16} 8L${S - 12} 13" fill="none" stroke="#222" stroke-width="1.3"/><text x="${S - 16}" y="32" font-size="8" text-anchor="middle" fill="#222">N</text>`,
    `<path d="M10 ${S - 12}H${f1(10 + bar)}" stroke="#222" stroke-width="2"/><text x="10" y="${S - 17}" font-size="8" fill="#222">${esc(t('{0} m', ['500']))}</text>`);
  const label = t('Locator: the block (black dot), a 1 km ring, nearest MRT / LRT stations (squares) and primary schools within 1 km (triangles); north up.');
  return `<svg viewBox="0 0 ${S} ${S}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
}

/** Text under the locator. */
export function legendHtml(near) {
  const mrt = near.mrt.map((s) => `${esc(s.name)} ${distText(s.m)}`).join(', ');
  const more = near.schoolCount > near.schools.length ? '…' : '';
  const sch = near.schoolCount ? `${near.schools.map((s) => esc(s.name)).join(', ')}${more}` : esc(t('none'));
  return `<span>■ ${t('MRT / LRT: {0}', [mrt || '—'])}</span><span>▲ ${t('Primary schools within 1 km ({0}): {1}', [near.schoolCount, sch])}</span><span>${t('Straight-line distances; north up.')}</span>`;
}

/** Sources line (data and rule versions). */
export const sourcesText = ({ dataTo, built, policyVersion }) => t('Sources: HDB resale transactions (data.gov.sg) to {0}, data built {1}; MRT, schools, amenities and parks from data.gov.sg and OpenStreetMap; Singapore rules from the app\'s policy file, version {2}, each with its official source and date. Benchmarks are medians of past sales, not valuations.', [dataTo, built, policyVersion]);

/** Compare-table header control (label via CSS ::after, so the table dump / "Copy table" stay unchanged). */
export function headerButton(c) {
  const label = esc(t('Brief'));
  return `<button type="button" class="link br-open" data-brief="${c.id}" data-label="${label}" aria-label="${esc(t('Flat brief for {0}', [c.name]))}"></button>`;
}

/** The page. md = model (see modelFor), lv = one fitLevels() entry. */
export function briefHtml(md, lv) {
  const sections = lv.rows === 'pro' ? md.pro : md.simple;
  const { shown, hidden } = trimFlags(md.flags, lv.flags);
  const sub = [md.address, md.town, md.flatType, md.storey, t('{0} sqm', [md.sqm])].filter(Boolean).map(esc).join(' · ');
  const flags = shown.map(([cls, ic, txt]) => `<li class="bf-f ${esc(cls)}"><span class="bf-ic" aria-hidden="true">${esc(ic)}</span><span>${esc(txt)}</span></li>`).join('');
  const keys = sections.map((s) => `<section class="bf-sec">${s.sec ? `<h3>${esc(t(s.sec))}</h3>` : ''}<table>${s.rows.map((r) => `<tr><th scope="row">${r.label}</th><td>${r.html}</td></tr>`).join('')}</table></section>`).join('');
  const notes = md.notes.length && lv.notes !== false ? `<section class="bf-notes"><h2>${esc(t('Lease & CPF notes'))}</h2><ul>${md.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>` : '';
  return `<article class="brief${lv.dense ? ' dense' : ''}${lv.tight ? ' tight' : ''}">`
    + `<header class="bf-head"><div class="bf-id"><p class="bf-kicker">${t('Flat brief')}</p><h1>${esc(md.name)}</h1><p class="bf-sub">${sub}</p>${md.facts.length ? `<p class="bf-facts">${md.facts.join(' · ')}</p>` : ''}</div>`
    + `<div class="bf-price"><small>${t('Asking price')}</small><b>${esc(md.price)}</b><small>${esc(t('Printed {0}', [md.printed]))}</small></div></header>`
    + `<p class="bf-disc">${t('Educational summary — not financial advice. Check the price, valuation and eligibility with HDB, CPF and your bank before you commit. Household numbers come from your details on this device.')}</p>`
    + `<div class="bf-top"><figure class="bf-map">${md.mapSvg}<figcaption>${md.mapLegend}</figcaption></figure>`
    + `<section class="bf-flags"><h2>${t('At a glance')}</h2><ul>${flags}</ul>${hidden ? `<p class="bf-more">${t('+ {0} more in the app', [hidden])}</p>` : ''}</section></div>`
    + (md.money ? moneyBoxHtml(md.money) : '') // B4: between the top and Key numbers, kept at every fit level
    + `<h2 class="bf-kh">${t('Key numbers')}</h2><div class="bf-keys">${keys}</div>${notes}`
    + `<p class="bf-src">${esc(md.sources)}</p>`
    + `<footer class="bf-foot"><span>${esc(t('{0} · Flat brief', [md.title]))}</span>${md.listing ? `<span class="bf-url">${esc(t('Listing: {0}', [md.listing]))}</span>` : ''}</footer></article>`;
}

/** Line under the preview title: how the page was fitted. */
export function fitNote(lv, startMode) {
  if (lv.notes === false) return t('Shortened to fit one A4 page: Simple rows, smaller text, fewer flags, no lease notes.');
  if (lv.flags !== Infinity) return t('Shortened to fit one A4 page: Simple rows, smaller text, fewer flags.');
  if (lv.dense) return t('Shortened to fit one A4 page: Simple rows, smaller text.');
  if (lv.rows === 'simple' && startMode === 'pro') return t('Shortened to fit one A4 page: Simple rows only.');
  return lv.rows === 'pro' ? t('One A4 page · all rows (Pro).') : t('One A4 page · Simple rows.');
}

const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * B4: the "Can we afford it?" rows leave Key numbers (the money box has them — no duplicates); with "Include my
 * numbers" off the At-a-glance money lines leave too (moneyFlags = their texts), so no household money is printed.
 */
export function dropMoney(rows, flags, { include = true, moneyFlags = [] } = {}) {
  const out = []; let inMoney = false;
  for (const r of rows) { if (r.sec) inMoney = r.sec === MONEY_SECTION; if (!inMoney) out.push(r); }
  const drop = new Set(include ? [] : moneyFlags);
  return { rows: out, flags: flags.filter((f) => !drop.has(f[2])) };
}

/**
 * ctx: { policy, D, choices(), metrics(c), verdict(m), rows(), rowLabel(r), simpleKeys, mode(), facts(bid),
 *        schools(), stn(name), town(b), ftName(ft), storeyName(s), money(v), dataTo(), banner(msg),
 *        body (compare table host), list (My choices list), csvBtn,
 *        B4: planFor(m) (money.js — Afford's planPurchase), glance(m) (money At-a-glance lines), store, why(c) (B1) }
 * → { button(c), tsv(), csv(), open(id) }
 */
export function createBrief(ctx) {
  const lines = () => tableLines(ctx.rows(), ctx.choices().map(ctx.metrics), ctx.rowLabel);
  let include = true; // "Include my numbers" (session only, O4)

  function modelFor(c) {
    const m = ctx.metrics(c), b = m.b, D = ctx.D, opt = { label: ctx.rowLabel };
    const near = nearby(b, D.mrt.stations, ctx.schools(), (p) => ctx.stn(p.n));
    const printed = new Date().toLocaleDateString(currentLang() === 'zh' ? 'zh-SG' : 'en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
    const B4 = !!ctx.planFor, store = ctx.store;
    const { rows, flags } = B4 ? dropMoney(ctx.rows(), ctx.verdict(m), { include, moneyFlags: ctx.glance(m).map((f) => f[2]) }) : { rows: ctx.rows(), flags: ctx.verdict(m) };
    const money = B4 && include ? moneyFor({ p: ctx.planFor(m), household: store.get('household'), policy: ctx.policy, c, flatType: D.flat_types[c.ft], focus: store.get('focus'), plan: store.get('plan'), why: ctx.why ? ctx.why(c) : null, date: printed }) : null;
    if (money) money.plain = isPhone() && ctx.mode() !== 'pro'; // phone + Simple: plain words in the money box (P-44)
    return { money,
      name: c.name, address: b.label, town: ctx.town(b), flatType: ctx.ftName(c.ft), storey: ctx.storeyName(D.storeys[c.storey]), sqm: c.sqm,
      price: ctx.money(c.price), listing: c.url || '', facts: ctx.facts(c.bid).facts.slice(0, 4),
      printed,
      flags, pro: briefSections(rows, m, opt), simple: briefSections(pickRows(rows, ctx.simpleKeys, 'simple', ctx.mode() === 'pro' ? 'pro' : 'simple'), m, opt),
      notes: leaseNotes(rows), mapSvg: locatorSvg({ centre: b, mrt: near.mrt, schools: near.schools }), mapLegend: legendHtml(near),
      sources: sourcesText({ dataTo: ctx.dataTo(), built: String(D.generated_at || '').slice(0, 10), policyVersion: ctx.policy.version }),
      title: document.title,
    };
  }

  let dlg = null, printEl = null, opener = null, current = null;
  function ensure() {
    if (dlg) return;
    printEl = Object.assign(document.createElement('div'), { id: 'briefPrint' });
    printEl.setAttribute('aria-hidden', 'true');
    dlg = document.createElement('dialog');
    // phone (≤ 767 px, brief.css + phone.css): a full-screen reading view — title + Done on top, the page in one column
    // at the phone type scale, "Include my numbers" + Print at the bottom. The printed A4 page (#briefPrint) is unchanged.
    dlg.className = 'brief-dlg phone-full'; dlg.setAttribute('aria-labelledby', 'briefDlgTitle');
    dlg.innerHTML = `<div class="brief-bar"><div><h2 id="briefDlgTitle">${t('Flat brief')}</h2><p class="brief-note" aria-live="polite"></p></div>`
      + `<div class="brief-acts">${ctx.planFor ? `<label class="check"><input type="checkbox" data-brief-include checked> ${t('Include my numbers')}</label>` : ''}<button type="button" class="btn sm primary" data-brief-print>${t('Print or save as PDF')}</button><button type="button" class="btn sm" data-brief-close>${t('Close')}</button></div></div>`
      + '<div class="brief-stage"><div class="brief-paper"></div></div>';
    document.body.append(printEl, dlg);
    dlg.addEventListener('click', (e) => {
      if (e.target.closest('[data-brief-print]')) window.print();
      else if (e.target.closest('[data-brief-close]')) dlg.close();
    });
    dlg.addEventListener('change', (e) => { const x = e.target.closest('[data-brief-include]'); if (x && current != null) { include = x.checked; open(current, opener); } });
    dlg.addEventListener('close', () => { if (dlg.open) return; /* re-opened before this queued event ran */ document.body.classList.remove('brief-on'); printEl.innerHTML = ''; dlg.querySelector('.brief-paper').innerHTML = ''; opener?.focus?.(); opener = null; });
  }

  function open(id, from = null) {
    const c = ctx.choices().find((x) => x.id === id); if (!c) return;
    ensure(); opener = from; current = id;
    const md = modelFor(c), mode = ctx.mode() === 'pro' ? 'pro' : 'simple', levels = fitLevels(mode);
    document.body.classList.add('brief-on');
    const limit = PAGE_MM.h * PX_PER_MM * FIT_SAFETY;
    const k = chooseLevel(levels, (lv) => { printEl.innerHTML = briefHtml(md, lv); return printEl.firstElementChild.getBoundingClientRect().height; }, limit);
    const html = briefHtml(md, levels[k]);
    printEl.innerHTML = html;
    dlg.querySelector('.brief-paper').innerHTML = html;
    dlg.querySelector('.brief-note').textContent = fitNote(levels[k], mode);
    dlg.querySelector('[data-brief-close]').textContent = isPhone() ? t('Done') : t('Close');
    if (!dlg.open) dlg.showModal();
    dlg.querySelector('.brief-stage').scrollTop = 0;
    dlg.querySelector('[data-brief-print]').focus();
  }

  function csv() {
    if (!ctx.choices().length) return ctx.banner(t('Add flats to your shortlist first.'));
    const url = URL.createObjectURL(new Blob([csvText(lines())], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `shortlist-${localDate(new Date())}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const onClick = (e) => { const btn = e.target.closest('button[data-brief]'); if (btn) open(+btn.dataset.brief, btn); };
  ctx.body?.addEventListener('click', onClick);
  ctx.list?.addEventListener('click', onClick);
  ctx.csvBtn?.addEventListener('click', (e) => { e.stopPropagation(); csv(); });
  // other surfaces (phone Compare cards) open a brief without a ctx host: bus 'brief:open' {id, from?}
  bus.on('brief:open', (d) => { if (d && d.id != null) open(+d.id, d.from || null); });

  return { button: headerButton, tsv: () => tsvText(lines()), csv, open };
}
