// Compare → "What matters most to you?" (Phase 7b B1, spec phase7b-design.md B1, owner defaults O1 / O2).
// Up to MAX_TICKS ticks (store ui.priorities, this device only); the shortlisted flats are sorted by how many ticked
// rows each one is the best of — relative to the flats on the list, so no new thresholds (O1; flood = a yes / no fact)
// — then fewer serious / critical "At a glance" flags, then list order. One factual sentence per flat, built from the
// same values as the compare rows (money = Afford's planPurchase via money.js, family facts via familyrows.js, the
// commute row via commute.js). Money problems are always shown, whatever is ticked. Not advice: "You decide".
// legacy.js hooks: createPriorities(ctx) once; renderCompare() → html(ms) above the table, hint(ms) for the drawer bar,
// headerNote(i) under each column header (replaces "best in X of N" only while ticks exist — O2); brief → why(c).
// Pure parts are exported for node tests.
import { t, currentLang } from '../../core/i18n.js';
import { esc, money } from '../../core/dom.js';
import { keepFolds } from '../../core/fold.js';
import { VERDICT } from './money.js';
import { FLOOD_NEAR_M, floodOn } from './family.js';

export const MAX_TICKS = 5;
export const STORE_PATH = 'ui.priorities';
export const MISSES_SHOWN = 2;    // "But:" names at most this many ticked rows a flat is not best on
// the walking estimate of the At-a-glance MRT line (legacy verdict()): metres × 1.25 ÷ 80 m/min, at least 3 min ≤ 600 m
export const WALK_FACTOR = 1.25, WALK_M_PER_MIN = 80, WALK_SHORT_M = 600, WALK_MIN = 3;
export const COMMUTE_PREFIX = 'Public transport to ';
export const COMMUTE_BOTH = 'Longer of the two trips';

/** Ticks in display order. best: which end of the row is "best"; yesno: a fact, not relative. */
export const TICKS = [
  { id: 'price', label: 'Price vs recent sales', best: 'min' },
  { id: 'cash', label: 'Cash you must pay', best: 'min' },
  { id: 'mrt', label: 'Walk to MRT', best: 'min' },
  { id: 'commute', label: 'Commute', best: 'min' },
  { id: 'schools', label: 'Primary schools within 1 km', best: 'max' },
  { id: 'childcare', label: 'Childcare with places', best: 'max' },
  { id: 'clinic', label: 'Clinic nearby', best: 'min' },
  { id: 'flood', label: 'No flood-prone point', yesno: true },
  { id: 'lease', label: 'Lease left', best: 'max' },
  { id: 'size', label: 'Size', best: 'max' },
];
const TICK = Object.fromEntries(TICKS.map((x) => [x.id, x]));
export const TICK_IDS = TICKS.map((x) => x.id);
// ticks that need a feature switch (core/features.js): floodData off (public build) → no flood chip, a saved flood
// tick is dropped
const TICK_FEATURE = { flood: floodOn };
/** Tick ids usable with the current switches. */
export const liveTickIds = () => TICK_IDS.filter((id) => !TICK_FEATURE[id] || TICK_FEATURE[id]());

export const walkMin = (d) => (d <= WALK_SHORT_M ? Math.max(WALK_MIN, Math.round(d * WALK_FACTOR / WALK_M_PER_MIN)) : Math.round(d * WALK_FACTOR / WALK_M_PER_MIN));
const joiner = () => (currentLang() === 'zh' ? '、' : ' · ');
const list = (xs) => xs.join(joiner());
const pct0 = (x) => `${(Math.abs(x) * 100).toFixed(0)}%`;
const km1 = (km) => (km < 1 ? t('{0} m', [Math.round(km * 1000)]) : t('{0} km', [km.toFixed(1)]));

/** Saved ticks, cleaned: known ids, no repeats, at most MAX_TICKS. */
export function cleanTicks(v) {
  const out = [], ok = liveTickIds();
  for (const id of Array.isArray(v) ? v : []) if (ok.includes(id) && !out.includes(id) && out.length < MAX_TICKS) out.push(id);
  return out;
}

/**
 * Rank flats by ticks (pure). facts: [{ i, name, vals: { [tickId]: number|boolean|null }, cashShort, bad }]
 *   vals = the row value (null = no data → never met); flood: true = no flood-prone point near, false = one, null = no data;
 *   cashShort > 0 → the cash tick is never met ("lowest, and not short"); bad = serious + critical At-a-glance flags.
 * → { order: [{ ...fact, met: [ids], missed: [ids], score }], meetN: { [id]: flats meeting it }, lead: bool, tied: bool }
 */
export function rankFlats(facts, ticks) {
  const meets = {}, meetN = {};
  for (const id of ticks) {
    const tk = TICK[id], vals = facts.map((f) => f.vals[id]);
    let ok;
    if (tk.yesno) ok = vals.map((v) => v === true);
    else {
      const valid = vals.filter((v) => v != null && Number.isFinite(v));
      const best = !valid.length ? null : tk.best === 'min' ? Math.min(...valid) : Math.max(...valid);
      ok = vals.map((v) => best != null && v === best);
    }
    if (id === 'cash') ok = ok.map((x, k) => x && !(facts[k].cashShort > 0));
    meets[id] = ok; meetN[id] = ok.filter(Boolean).length;
  }
  const order = facts.map((f, k) => {
    const met = ticks.filter((id) => meets[id][k]), missed = ticks.filter((id) => !meets[id][k]);
    return { ...f, met, missed, score: met.length, k };
  }).sort((a, b) => b.score - a.score || (a.bad || 0) - (b.bad || 0) || a.k - b.k);
  const lead = order.length > 1 && order[0].score > order[1].score;
  const tied = order.length > 1 && order[0].score > 0 && order[0].score === order[1].score;
  return { order, meetN, lead, tied };
}

/** One tick as a fact for this flat (row wording). met + meetN > 1 → "(tied)". ctx: { bandKm } */
export function phrase(id, f, { met = false, meetN = 0, bandKm = 1 } = {}) {
  const v = f.vals[id], tied = met && meetN > 1 && !TICK[id].yesno ? ' ' + t('(tied)') : '';
  let s;
  switch (id) {
    case 'price': s = v == null ? t('no recent-sales benchmark') : v < 0 ? t('{0} below recent sales', [pct0(v)]) : t('{0} above recent sales', [pct0(v)]); break;
    case 'cash':
      if (v == null) s = t('cash not known');
      else if (met) s = t('lowest cash you must pay ({0})', [money(v)]);
      else s = t('not the lowest cash ({0})', [money(v)]); // a shortfall is the money tag's job (shown once)
      break;
    case 'mrt': s = v == null ? t('no MRT data') : t('{0} min walk to MRT', [walkMin(v)]); break;
    case 'commute': s = v == null ? t('no commute estimate') : t('{0} min by public transport', [v]); break;
    case 'schools': s = v == null ? t('no school data') : v === 0 ? t('no primary school within {0} km', [bandKm]) : t(v === 1 ? '{0} primary school within {1} km' : '{0} primary schools within {1} km', [v, bandKm]); break;
    case 'childcare': s = v == null ? t('no childcare data') : v === 0 ? t('no childcare centre with places within 1 km') : t(v === 1 ? '{0} childcare centre with places' : '{0} childcare centres with places', [v]); break;
    case 'clinic': s = v == null ? t('no clinic data') : t('polyclinic {0} away', [km1(v)]); break;
    case 'flood': s = v == null ? t('no flood data') : v ? t('no flood-prone point within {0} m', [FLOOD_NEAR_M]) : t('flood-prone point within {0} m', [FLOOD_NEAR_M]); break;
    case 'lease': s = v == null ? t('lease not known') : met ? t('longest lease ({0} y)', [Math.round(v)]) : t('{0} y lease left', [Math.round(v)]); break;
    case 'size': s = v == null ? t('size not known') : met ? t('biggest ({0} sqm)', [v]) : t('{0} sqm', [v]); break;
    default: s = '';
  }
  return s + tied;
}

/** Money line (DEC-016 Q1: shown whatever is ticked): cash short → critical, "no" → critical, "tight" → warn. */
export function moneyTag(mon) {
  if (!mon) return '';
  if (mon.cashShort > 0) return `<span class="tag critical">${t('Cash short {0}', [money(mon.cashShort)])}</span>`;
  const v = VERDICT[mon.status];
  if (mon.status === 'no' || mon.status === 'tight') return `<span class="tag ${v[0]}">${v[1]} ${t(v[2])}</span>`;
  return '';
}

/** The sentence for one ranked flat (HTML). r = an `order` entry, k = its rank, res = rankFlats() result. */
export function sentenceHtml(r, k, res, { bandKm = 1 } = {}) {
  const name = `<b>${r.i + 1}. ${esc(r.name)}</b>`;
  const ph = (ids, met) => ids.map((id) => phrase(id, r, { met, meetN: res.meetN[id], bandKm }));
  const parts = [];
  if (k === 0 && res.lead) parts.push(t('fits your ticks best.'));
  else if (k === 0 && res.tied) parts.push(t('tied on your ticks.'));
  const missed = ph(r.missed.slice(0, MISSES_SHOWN), false);
  if (r.met.length) {
    parts.push(t('{0}.', [list(ph(r.met, true))]));
    if (missed.length) parts.push(t('Not the best on your list: {0}.', [list(missed)])); // relative, not a flaw
  } else parts.push(t('meets none of your ticks — {0}.', [list(missed)]));
  const tag = moneyTag(r.money);
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1); // a new sentence after "." starts with a capital (EN)
  return `<li>${name}: ${parts.map((x, i) => (i ? cap(x) : x)).join(' ')}${tag ? ' ' + tag : ''}</li>`;
}

/** Chips (aria-pressed); commute only when a hub row exists (label from it); switched-off ticks left out. */
export function chipsHtml(ticks, { commuteLabel = null } = {}) {
  const live = liveTickIds();
  return `<div class="chips prio-chips" role="group" aria-label="${esc(t('What matters most to you?'))}">${TICKS.filter((x) => live.includes(x.id) && (x.id !== 'commute' || commuteLabel)).map((x) => {
    const on = ticks.includes(x.id), label = x.id === 'commute' ? commuteLabel : esc(t(x.label));
    return `<button type="button" class="chip${on ? ' on' : ''}" data-prio="${x.id}" aria-pressed="${on}">${label}</button>`;
  }).join('')}</div>`;
}

export const FOOT = 'You decide — this only sorts your flats by your ticks, using the rows below. Not financial advice.';

/**
 * The block above the compare table (pure given the facts). s: { ticks, facts, commuteLabel, overflow, foldOpen, bandKm, hubHint }
 */
export function blockHtml(s) {
  const n = s.facts.length;
  if (!n) return '';
  const ticks = s.ticks.filter((id) => id !== 'commute' || s.commuteLabel);
  const head = `<h4 class="sub">${t('What matters most to you?')} <span class="muted xs">${t('pick up to {0}', [MAX_TICKS])}</span>${ticks.length ? ` <button type="button" class="link prio-clear" data-prio-clear>${t('Clear')}</button>` : ''}</h4>`;
  const over = s.overflow ? `<p class="hint" role="status">${t('Up to {0} — untick one first.', [MAX_TICKS])}</p>` : '';
  const hub = !s.commuteLabel && s.hubHint ? `<p class="hint">${s.hubHint}</p>` : '';
  const chips = chipsHtml(ticks, { commuteLabel: s.commuteLabel });
  const picker = ticks.length
    ? `<details class="fold-inline prio-fold"${s.foldOpen ? ' open' : ''}><summary>${t('Change what matters ({0} ticked)', [ticks.length])}</summary>${chips}${over}${hub}</details>`
    : `${chips}${over}${hub}`;
  let body = '';
  if (n === 1) {
    const f = s.facts[0], facts = ticks.map((id) => phrase(id, f, { bandKm: s.bandKm })), tag = moneyTag(f.money);
    body = `<p class="hint">${t('Add another flat to sort them by your ticks.')}</p>`
      + (facts.length || tag ? `<ol class="prio-list"><li><b>${f.i + 1}. ${esc(f.name)}</b>${facts.length ? `: ${t('{0}.', [list(facts)])}` : ''}${tag ? ' ' + tag : ''}</li></ol>` : '');
  } else if (!ticks.length) {
    body = `<p class="hint">${t('Tick what matters and your flats are sorted by it.')}</p>`;
  } else {
    const res = rankFlats(s.facts, ticks);
    body = `<ol class="prio-list">${res.order.map((r, k) => sentenceHtml(r, k, res, { bandKm: s.bandKm })).join('')}</ol>`;
  }
  const foot = ticks.length && n > 1 ? `<p class="foot-note">${t(FOOT)}</p>` : '';
  if (s.phone) return phoneBlockHtml(s, ticks, { chips, over, hub, body, foot });
  return `<section class="prio" aria-label="${esc(t('Your priorities'))}">${head}${picker}${body}${foot}</section>`;
}

/** Phones (Compare cards, phone overhaul §3.4 / P-33): one fold, closed unless opened, whose summary names the picks;
 *  open, the same chips, sentences and footnote as the desktop block (no inner "Change what matters" fold). */
function phoneBlockHtml(s, ticks, p) {
  const names = ticks.map((id) => (id === 'commute' ? s.commuteLabel : esc(t(TICK[id].label))));
  // review R-15a: one line when closed ("Sort: none picked" / "Sort: Walk to MRT · …"); "pick up to 5" only when open
  const sum = ticks.length ? t('Sort: {0}', [list(names)]) : t('Sort: none picked');
  const clear = ticks.length ? `<button type="button" class="link prio-clear" data-prio-clear>${t('Clear')}</button>` : '';
  return `<details class="prio prio-phone" data-fold="prio"${s.open ? ' open' : ''} aria-label="${esc(t('Your priorities'))}">`
    + `<summary><span class="prio-t">${sum}</span><small class="prio-s">${t('pick up to {0}', [MAX_TICKS])}</small></summary>`
    + `<div class="prio-in">${p.chips}${clear}${p.over}${p.hub}${p.body}${p.foot}</div></details>`;
}

/**
 * ctx: { store, money (createMoney), family (createFamilyRows), rows: () => ROWS(), verdict(m), metrics(c), choices(),
 *        bandKm, body?, rerender?, goCommute? }
 * → { html(ms), hint(ms), headerNote(i), why(c), facts(ms), ticks() }
 */
export function createPriorities(ctx) {
  let overflow = false, foldOpen = null, last = null;
  const phoneFolds = ctx.body ? keepFolds(ctx.body) : null; // the phone fold (data-fold="prio")
  const ticks = () => cleanTicks(ctx.store.get(STORE_PATH));
  const commuteRow = (rows) => rows.find((r) => r.k === COMMUTE_BOTH && r.v) || rows.find((r) => typeof r.k === 'string' && r.k.startsWith(COMMUTE_PREFIX) && r.v) || null;
  const commuteLabel = (r) => (!r ? null : r.k === COMMUTE_BOTH ? esc(t('Commute (the longer trip)')) : esc(t('Commute to {0}', [t(r.k.slice(COMMUTE_PREFIX.length))])));

  /** Row values per flat — the same numbers the compare rows show. */
  function facts(ms, rows = ctx.rows()) {
    const cr = commuteRow(rows);
    return ms.map((m, i) => {
      const p = ctx.money.planFor(m), fam = ctx.family.facts(m.b);
      const vals = {
        price: m.premium ?? null, cash: p.chosen.funding.cashNeeded, mrt: m.mrt ? m.mrt.d : null, commute: cr ? cr.v(m) ?? null : null,
        schools: fam.schools ? fam.schools.near.length : null, childcare: fam.childcare ? fam.childcare.far : null,
        clinic: fam.poly ? fam.poly.km : null, flood: fam.flood ? !fam.flood.near : null, lease: m.leaseNow ?? null, sqm: m.c.sqm,
      };
      vals.size = vals.sqm;
      const bad = ctx.verdict(m).filter(([cls]) => cls === 'serious' || cls === 'critical').length;
      return { i, name: m.c.name, vals, cashShort: p.cashShort, money: { status: p.verdict.status, cashShort: p.cashShort }, bad };
    });
  }

  /** opts.phone: the phone fold (cmpcards.js); its open state survives re-renders (core/fold.js keepFolds, F6). */
  function html(ms, opts = {}) {
    const rows = ctx.rows(), cr = commuteRow(rows), tk = ticks();
    if (foldOpen == null) foldOpen = !tk.length;
    const f = facts(ms, rows), live = tk.filter((id) => id !== 'commute' || cr);
    last = ms.length > 1 && live.length ? { res: rankFlats(f, live), n: live.length } : null;
    const out = blockHtml({ ticks: tk, facts: f, commuteLabel: commuteLabel(cr), overflow, foldOpen, bandKm: ctx.bandKm,
      ...(opts.phone ? { phone: true, open: !!phoneFolds?.isOpen('prio', false) } : {}),
      hubHint: ctx.goCommute ? `<button type="button" class="link" data-prio-hub>${t('Set a place under Colour by → Commute to sort by travel time')}</button>` : '' });
    overflow = false;
    return out;
  }
  /** Drawer bar text while ticks exist (else null → the bar keeps "green = best in row"). */
  function hint(ms) {
    if (!last) return null;
    const top = last.res.order[0];
    return last.res.lead ? t('{0} flats · fits your ticks best: {1}', [ms.length, `${top.i + 1}. ${top.name}`]) : t('{0} flats · sorted by your ticks', [ms.length]);
  }
  /** Column header small (column i) while ticks exist, else null. */
  function headerNote(i) {
    if (!last) return null;
    const r = last.res.order.find((x) => x.i === i);
    return r ? t('meets {0} of your {1} ticks', [r.score, last.n]) : null;
  }
  /** Brief "Why this flat (your ticks)": the ticked rows this flat is best on, or null without ticks / met rows. */
  function why(c) {
    const cs = ctx.choices(), tk = ticks(), k = cs.findIndex((x) => x.id === c.id);
    if (cs.length < 2 || !tk.length || k < 0) return null;
    const rows = ctx.rows(), live = tk.filter((id) => id !== 'commute' || commuteRow(rows));
    if (!live.length) return null;
    const res = rankFlats(facts(cs.map(ctx.metrics), rows), live), r = res.order.find((x) => x.i === k);
    return r && r.met.length ? list(r.met.map((id) => phrase(id, r, { met: true, meetN: res.meetN[id], bandKm: ctx.bandKm }))) : null;
  }

  const body = ctx.body;
  if (body) {
    body.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-prio], button[data-prio-clear], button[data-prio-hub]');
      if (!b) return;
      if (b.hasAttribute('data-prio-hub')) { ctx.goCommute?.(); return; }
      if (b.hasAttribute('data-prio-clear')) { foldOpen = true; ctx.store.set(STORE_PATH, []); return; }
      const id = b.dataset.prio, cur = ticks();
      foldOpen = true;
      if (cur.includes(id)) ctx.store.set(STORE_PATH, cur.filter((x) => x !== id));
      else if (cur.length >= MAX_TICKS) { overflow = true; ctx.rerender?.(); }
      else ctx.store.set(STORE_PATH, [...cur, id]);
      body.querySelector(`button[data-prio="${id}"]`)?.focus();
    });
    body.addEventListener('toggle', (e) => { if (e.target.classList && e.target.classList.contains('prio-fold')) foldOpen = e.target.open; }, true);
  }
  return { html, hint, headerNote, why, facts, ticks };
}
