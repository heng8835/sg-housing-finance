// Explore map — "Commute to…" colour mode (Phase 5 AC 7, docs/specs/phase5-map-redesign.md).
// Pick one place (hub) and optionally a second ("two workers"): blocks are coloured by the estimated
// public-transport minutes on the calm blue ramp from blocks.js, darker = longer, fixed bins; with two
// places, by the longer of the two trips. The compare table gets one "Public transport to {hub}" row per
// place. Minutes come from data/commute.js (window.HDB_COMMUTE, tools/build_commute.py) via
// engine/commute.js — a MODEL ESTIMATE from assumed speeds and waits (ASSUMPTION policy values), not a
// journey planner. The hub choice is kept by legacy.js in localStorage (never in URLs or requests).
// Pure helpers are exported for node tests; createCommute() wires the side-panel picker (browser).

import { t } from '../../core/i18n.js';
import { decodeMinutes } from '../../engine/commute.js';
import { fixedScale, legendHtml } from './blocks.js';

/** Map bins in minutes (inclusive upper edges): ≤20 / 21–30 / 31–45 / 46–60 / >60. UI choice, not a policy rule. */
export const COMMUTE_BINS = [20, 30, 45, 60];
export const MAX_HUBS = 2;
const CATS = [['work', 'Work areas'], ['school', 'Universities & schools'], ['border', 'Border crossing']];
const MODEL_NOTE = 'Model estimate of door-to-door public transport (walk or feeder bus, MRT/LRT, transfers) from assumed speeds and waits — not a journey planner. Real trips vary with the time of day.';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hubName = (h) => esc(t(h.name));

/** The colour scale for commute minutes (blocks.js fixed bins on the shared ramp). */
export const commuteScale = () => fixedScale(COMMUTE_BINS);

/** Saved hub ids → at most MAX_HUBS distinct ids that exist in `known` (a Set or Map of hub ids), order kept. */
export function cleanHubs(ids, known) {
  const out = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id === 'string' && id && known.has(id) && !out.includes(id)) out.push(id);
    if (out.length === MAX_HUBS) break;
  }
  return out;
}

/**
 * Per block, the longest trip over several hubs (two workers → the longer one), or null when any hub
 * has no estimate (`na`) for that block. `arrays` are decodeMinutes() outputs; null when there are none.
 */
export function combineMinutes(arrays, na) {
  const list = (arrays || []).filter(Boolean);
  if (!list.length) return null;
  const n = Math.min(...list.map((a) => a.length));
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let worst = 0;
    for (const a of list) { const v = a[i]; if (v === na) { worst = null; break; } if (v > worst) worst = v; }
    out[i] = worst;
  }
  return out;
}

/** Compare-table cell for one estimate. */
export function minutesCell(min) {
  return min == null ? `<span class="muted">${t('no estimate')}</span>` : `${t('~{0} min', [min])}<small>${t('model estimate')}</small>`;
}

/** Row tip: the model caveat plus the hub's own note (e.g. "excludes immigration queues"). */
export function rowTip(hub) {
  return `${t('Estimated door-to-door time by public transport from the block to {0}.', [t(hub.name)])} ${t(MODEL_NOTE)}${hub.note ? ' ' + t(hub.note) : ''}`;
}

/**
 * Compare-table rows for the chosen hubs (none → no rows, so the table is unchanged).
 * `minutesAt(hubId, blockIndex)` → minutes or null. Rows read the block from `m.c.bid`.
 * `simple: true` keeps a row in Simple mode (the user chose these places explicitly).
 */
export function commuteRows(hubs, minutesAt) {
  if (!hubs || !hubs.length) return [];
  const rows = [{ sec: 'Public transport (model estimate)' }];
  for (const h of hubs) {
    const v = (m) => minutesAt(h.id, m.c.bid);
    rows.push({ k: `Public transport to ${h.name}`, lbl: t('Public transport to {0}', [hubName(h)]), simple: true, f: (m) => minutesCell(v(m)), v, best: 'min', tip: rowTip(h) });
  }
  if (hubs.length > 1) {
    const longest = (m) => { const vals = hubs.map((h) => minutesAt(h.id, m.c.bid)); return vals.some((x) => x == null) ? null : Math.max(...vals); };
    rows.push({ k: 'Longer of the two trips', f: (m) => minutesCell(longest(m)), v: longest, best: 'min', tip: t('The map colours each block by this: a home is only as convenient as the longer of the two daily trips.') });
  }
  return rows;
}

/** Legend label for the chosen hubs. */
export function legendLabel(hubs) {
  if (hubs.length > 1) return t('Public transport to {0} or {1}, whichever is longer', [hubName(hubs[0]), hubName(hubs[1])]);
  return t('Public transport to {0}', [hubName(hubs[0])]);
}

// ---- B8: the commute filter ("Only show blocks within … min", Simple + Pro, under the picker) and the card line
/** Filter choices in minutes (UI heuristics, not policy). null = Any. */
export const COMMUTE_MAX_OPTIONS = [30, 40, 45, 60];
/** A saved / imported filter value → one of COMMUTE_MAX_OPTIONS, else null (Any). */
export const cleanMax = (v) => (COMMUTE_MAX_OPTIONS.includes(v) ? v : null);
/** Keep a block under the filter? minutes = the longer trip (combineMinutes); no estimate → hidden while a filter is on. */
export const keepBlock = (minutes, max) => max == null || (minutes != null && minutes <= max);

/**
 * Block card header line (B8): the same minutesAt() as the compare rows, so the card and the row always agree.
 * No hub → null (no line). HTML (hub names escaped).
 */
export function cardLine(hubs, bi, minutesAt) {
  if (!hubs || !hubs.length) return null;
  const vals = hubs.map((h) => minutesAt(h.id, bi));
  if (vals.every((v) => v == null)) return t('No commute estimate for this block');
  if (hubs.length === 1) return t('≈ {0} min to {1} by public transport (estimate)', [vals[0], hubName(hubs[0])]);
  const parts = hubs.map((h, k) => (vals[k] == null ? t('no estimate to {0}', [hubName(h)]) : t('{0} min to {1}', [vals[k], hubName(h)])));
  return t('≈ {0} (estimates)', [parts.join(' · ')]);
}

/** Legend line while the filter is on: "Showing blocks within 45 min of one-north" (+ "Show all" link). */
export function filterNote(hubs, max) {
  if (!hubs.length || max == null) return '';
  const text = hubs.length > 1 ? t('Showing blocks within {0} min of both {1} and {2}', [max, hubName(hubs[0]), hubName(hubs[1])]) : t('Showing blocks within {0} min of {1}', [max, hubName(hubs[0])]);
  return `<div class="hint">${text} · <button type="button" class="link" data-commute-max="">${t('Show all')}</button></div>`;
}

/** The chips under the picker: "Only show blocks within" Any · 30 · 40 · 45 · 60 min (single-select, aria-pressed). */
export function filterChips(max) {
  const chip = (v, label) => `<button type="button" class="chip${v === max ? ' on' : ''}" data-commute-max="${v ?? ''}" aria-pressed="${v === max}">${label}</button>`;
  return `<span class="f-label" id="commuteMaxLbl">${t('Only show blocks within')}</span><div class="chips" role="group" aria-labelledby="commuteMaxLbl">${chip(null, t('Any'))}${COMMUTE_MAX_OPTIONS.map((v) => chip(v, t('{0} min', [v]))).join('')}</div>`;
}

/** Hover text part for one block: " · ~35 min to X" (one per hub). */
export function hoverPart(hubs, bi, minutesAt) {
  if (!hubs.length) return '';
  return hubs.map((h) => { const v = minutesAt(h.id, bi); return ' · ' + (v == null ? t('no estimate to {0}', [hubName(h)]) : t('~{0} min to {1}', [v, hubName(h)])); }).join('');
}

// ------------------------------------------------------------------ browser wiring
/**
 * @param {{ data: object|null, getHubs: () => string[], setHubs: (ids: string[]) => void, onChange: () => void, doc?: Document,
 *   getMax?: () => number|null, setMax?: (v: number|null) => void, active?: () => boolean, blocks?: object[] }} o
 * `data` = window.HDB_COMMUTE (null when the file is missing → the colour option is hidden with a note).
 * B8 filter: `getMax` / `setMax` = legacy S.commuteMax (kept with saved views); it applies while `active()` (the
 * Commute colour mode is on, where the chips and the legend line are visible) and a place is chosen. `blocks` =
 * D.blocks, so `keep(block)` can answer for legacy's per-block filter predicate.
 */
export function createCommute({ data, getHubs, setHubs, onChange, doc = globalThis.document, getMax = () => null, setMax = () => {}, active = () => true, blocks = [] }) {
  const available = !!(data && Array.isArray(data.hubs) && data.hubs.length && data.minutes);
  const byId = new Map(available ? data.hubs.map((h) => [h.id, h]) : []);
  const decoded = new Map();
  const arr = (id) => { if (!decoded.has(id)) decoded.set(id, decodeMinutes(data, id)); return decoded.get(id); };
  const minutesAt = (id, bi) => { const a = available ? arr(id) : null; if (!a || !Number.isInteger(bi) || bi < 0 || bi >= a.length) return null; return a[bi] === data.na ? null : a[bi]; };
  const ids = () => (available ? cleanHubs(getHubs(), byId) : []);
  const hubs = () => ids().map((id) => byId.get(id));
  const scale = commuteScale();
  let combo = null, comboKey = null;
  const combined = () => { const k = ids().join('|'); if (k !== comboKey) { comboKey = k; combo = k ? combineMinutes(ids().map(arr), data.na) : null; } return combo; };

  // ---- picker (side panel, under the colour-by radios)
  const pick = doc && doc.getElementById('commutePick');
  const radio = doc && doc.querySelector('#colorBy input[value="commute"]');
  let built = false;
  function options(blank) {
    const groups = CATS.map(([cat, label]) => { const hs = data.hubs.filter((h) => h.cat === cat); return hs.length ? `<optgroup label="${esc(t(label))}">${hs.map((h) => `<option value="${esc(h.id)}">${hubName(h)}</option>`).join('')}</optgroup>` : ''; }).join('');
    const other = data.hubs.filter((h) => !CATS.some(([c]) => c === h.cat)).map((h) => `<option value="${esc(h.id)}">${hubName(h)}</option>`).join('');
    return `<option value="">${esc(t(blank))}</option>${groups}${other}`;
  }
  function build() {
    if (!pick || built) return;
    built = true;
    if (!available) {
      if (radio) radio.closest('label').style.display = 'none'; // .radios label sets display, so `hidden` alone would not hide it
      pick.innerHTML = `<p class="hint">${t('Commute colouring is unavailable: data/commute.js is missing (run tools/build_commute.py).')}</p>`;
      pick.hidden = false;
      return;
    }
    pick.innerHTML = `<label class="f"><span>${t('Where do you travel to most days?')}</span><select id="commuteHub1">${options('— choose a place —')}</select></label>`
      + `<label class="f"><span>${t('Second worker or student (optional)')}</span><select id="commuteHub2">${options('— nobody else —')}</select></label>`
      + '<div id="commuteNotes"></div><div id="commuteFilter" class="cm-filter"></div>';
    const s1 = doc.getElementById('commuteHub1'), s2 = doc.getElementById('commuteHub2');
    const changed = () => { setHubs(cleanHubs([s1.value, s2.value], byId)); sync(); onChange(); };
    s1.addEventListener('change', changed); s2.addEventListener('change', changed);
    // filter chips + the legend's "Show all" link (the legend is re-rendered, so one delegated listener on the document)
    doc.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-commute-max]'); if (!b) return;
      setMax(cleanMax(b.dataset.commuteMax === '' ? null : +b.dataset.commuteMax)); sync(); onChange();
    });
  }
  function sync() {
    if (!built || !available) return;
    const [a = '', b = ''] = ids();
    doc.getElementById('commuteHub1').value = a;
    doc.getElementById('commuteHub2').value = a ? b : '';
    doc.getElementById('commuteHub2').disabled = !a;
    const hs = hubs();
    const notes = hs.filter((h) => h.note).map((h) => `<p class="hint"><b>${hubName(h)}:</b> ${esc(t(h.note))}</p>`).join('');
    doc.getElementById('commuteNotes').innerHTML = (hs.length > 1 ? `<p class="hint">${t('With two places, each block takes the colour of the longer trip.')}</p>` : '') + notes;
    const f = doc.getElementById('commuteFilter'); // no place chosen → no filter
    f.hidden = !hs.length; f.innerHTML = hs.length ? filterChips(max()) : '';
  }
  const max = () => cleanMax(getMax());
  const filterOn = () => available && max() != null && active() && ids().length > 0;
  let index = null; // block object → D.blocks index, built on first use
  const indexOf = (b) => { if (!index) index = new Map(blocks.map((x, i) => [x, i])); return index.get(b); };

  return {
    available,
    hubs,
    minutesAt,
    scale: () => scale,
    /** Fill colour for a block, or null (grey "no data") when there is no estimate / no hub chosen. */
    fill: (bi) => { const c = combined(); const v = c ? c[bi] : null; return v == null ? null : scale.color(v); },
    /** Minutes the block is coloured by (longer trip with two places), or null — for the zoomed-in value labels. */
    value: (bi) => { const c = combined(); return c ? c[bi] : null; },
    hover: (bi) => hoverPart(hubs(), bi, minutesAt),
    rows: () => commuteRows(hubs(), minutesAt),
    /** B8 card header line for block bi (null = no place chosen). */
    cardLine: (bi) => cardLine(hubs(), bi, minutesAt),
    /** B8: the "Only show blocks within N min" filter is applying now. */
    filterOn,
    /** B8: keep this block (D.blocks object) under the filter? Always true while the filter is off. */
    keep: (b) => { if (!filterOn()) return true; const c = combined(), bi = indexOf(b); return keepBlock(c && bi != null ? c[bi] : null, max()); },
    legend({ simple, zoomedIn, chipLabel = null }) {
      const hs = hubs();
      if (!hs.length) return `<div class="key">${t('Commute time by public transport')}</div><div class="hint">${t('Choose where you travel to (above) to colour the blocks.')}</div>`;
      return legendHtml({ scale, mode: 'commute', label: legendLabel(hs), fmt: (v) => t('{0} min', [v]), t, simple, zoomedIn, chipLabel })
        + (filterOn() ? filterNote(hs, max()) : '')
        + `<div class="hint">${t('Grey also means no estimate for that block.')}</div><div class="hint">${t(MODEL_NOTE)}</div>`;
    },
    /** Show the picker while the commute colour mode is on (the "missing data" note always shows). */
    show(on) { build(); if (!pick) return; if (available) { pick.hidden = !on; if (on) sync(); } },
  };
}
