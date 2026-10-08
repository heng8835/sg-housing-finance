// Explore — the school card (Phase 7b B3, hdb-data-pipeline/docs/specs/phase7b-design.md §B3 (b), owner default O3).
// Searching the map for a primary school opens this card in the block-card dock (./dock.js, phone = solo layout)
// instead of the small map popup: the HDB blocks within the first P1 band (policy p1.distance.bands_km, 1 km) that
// have sold one of the user's flat types, nearest first (or cheapest), with the median of those types in the
// calculation window, and a budget tag only when "Most you can pay" is known (S.budgetMax from Afford — the same
// within / near / over rule as the map's "Within my budget" colour). Tapping a row opens that block's card: a school
// search → a block is two taps. Plan → Primary schools is unchanged. Phones: the card is a map-sheet view stacked on the
// block card (./dock.js 'school' view; "‹ Back to …"), and "Show the 1 km ring" lowers the sheet to peek.
// Sev-1: display only — medians are the block's sales of the selected flat types in S.mFrom…S.mTo (no More filters).
// Pure parts are exported for node tests (tests/explore/schoolcard.test.js); createSchoolCard() is browser-only.
import { t } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';
import { blocksNear, schoolName } from '../../core/schools.js';

export const SCHOOL_BLOCKS_SHOWN = 8; // rows before "Show all" (UI heuristic)
export const SORTS = ['near', 'cheap'];
const kTile = (v) => (v == null ? '—' : 'S$' + (v / 1000).toFixed(0) + 'k'); // = card.js kTile (not imported: card.js imports this file)
const dist = (km) => (km < 1 ? t('{0} m', [Math.round(km * 1000)]) : t('{0} km', [km.toFixed(1)]));

/** Median of the block's sales of the selected flat types in [mFrom, mTo] → { n, price } (price null when n = 0). */
export function blockMedian(bi, { blockTx, TX, ftSet, mFrom, mTo, median }) {
  const prices = [];
  for (const i of blockTx[bi] || []) if (ftSet.has(TX.ft[i]) && TX.m[i] >= mFrom && TX.m[i] <= mTo) prices.push(TX.p[i]);
  return { n: prices.length, price: prices.length ? median(prices) : null };
}

/** The map's "Within my budget" rule: ≤ max → within, ≤ max × (1 + stretch) → near, else over. No budget / price → null. */
export function budgetTag(price, budget) {
  if (price == null || !budget || !(budget.max > 0)) return null;
  return price <= budget.max ? 'within' : price <= budget.max * (1 + budget.stretch) ? 'near' : 'over';
}

/** Nearest first; cheapest = median price ascending, blocks without sales last, ties by distance. */
export function sortRows(rows, by) {
  const r = rows.slice();
  if (by === 'cheap') return r.sort((a, b) => (a.price == null) - (b.price == null) || (a.price ?? 0) - (b.price ?? 0) || a.km - b.km);
  return r.sort((a, b) => a.km - b.km);
}

/**
 * Card model for one school (pure). x: { school ({ n, lat, lon }), bandsKm, blocks (D.blocks), blockTx, TX, ftSet,
 * mFrom, mTo, median, budget ({ max, stretch } | null) }.
 * → { name, km (first band), rows: [{ bi, km, n, price, tag }], nearest ({ bi, km } | null, only when no row) }.
 */
export function schoolModel(x) {
  const at = { lat: x.school.lat, lon: x.school.lon }, km = x.bandsKm[0];
  const near = blocksNear(at, km, { blocks: x.blocks, blockTx: x.blockTx, txFt: x.TX.ft, ftSet: x.ftSet });
  const rows = near.map((r) => { const m = blockMedian(r.bi, x); return { ...r, ...m, tag: budgetTag(m.price, x.budget) }; });
  const nn = rows.length ? null : blocksNear(at, Infinity, { blocks: x.blocks, blockTx: x.blockTx, txFt: x.TX.ft, ftSet: x.ftSet })[0];
  const nearest = nn ? { ...nn, ...blockMedian(nn.bi, x), tag: null } : null; // no budget tag outside the band
  return { name: schoolName(x.school.n), km, rows, nearest };
}

const TAGS = { within: ['good', 'within budget'], near: ['warn', 'near budget'], over: ['serious', 'over budget'] };

/** One row: the whole row is a button that opens the block's card. label(bi) → block name. */
function rowHtml(r, { label, win }) {
  const tag = r.tag ? `<span class="tag ${TAGS[r.tag][0]}">${t(TAGS[r.tag][1])}</span>` : '<span></span>';
  const line2 = r.n ? `${t('Median {0}', [kTile(r.price)])} · ${t(r.n === 1 ? '{0} sale in the last {1}' : '{0} sales in the last {1}', [r.n, win])}` : t('No sales of your flat types in the last {0}', [win]);
  return `<li><button type="button" class="sc-row" data-bi="${r.bi}"><span class="sc-name">${esc(label(r.bi))} · ${dist(r.km)}</span>${tag}<span class="bc-cap">${line2}</span></button></li>`;
}

/**
 * Card body (the title sits in the dock bar). m = schoolModel(); o: { sort, all, label(bi), win ('1 year'),
 * budgetKnown, ringOn }.
 */
export function schoolCardHtml(m, o) {
  const rows = sortRows(m.rows, o.sort), shown = o.all ? rows : rows.slice(0, SCHOOL_BLOCKS_SHOWN);
  const seg = `<div class="seg sc-sort" role="radiogroup" aria-label="${esc(t('Sort the blocks'))}">${SORTS.map((s) => { const on = s === o.sort; return `<button type="button" role="radio" data-v="${s}" class="${on ? 'on' : ''}" aria-checked="${on}" tabindex="${on ? 0 : -1}">${t(s === 'near' ? 'Nearest' : 'Cheapest')}</button>`; }).join('')}</div>`;
  const none = m.nearest ? `${t('No blocks with your flat types within {0} km.', [m.km])} ${t('Nearest: {0} · {1}.', [esc(o.label(m.nearest.bi)), dist(m.nearest.km)])}` : t('No blocks with your flat types within {0} km.', [m.km]);
  const list = rows.length
    ? `${seg}<ul class="sc-blocks">${shown.map((r) => rowHtml(r, o)).join('')}</ul>${rows.length > SCHOOL_BLOCKS_SHOWN ? `<button type="button" class="link bc-more" data-sc="all">${o.all ? t('Show fewer') : t('Show all {0} blocks', [rows.length])}</button>` : ''}`
    : `<p class="bc-cap">${none}</p>${m.nearest ? `<ul class="sc-blocks">${rowHtml(m.nearest, o)}</ul>` : ''}`;
  const hh = rows.length && !o.budgetKnown ? `<p class="bc-cap">${t('Add your household to see which are within your budget.')}</p>` : '';
  return `<div class="bc"><section class="bc-sec">${list}${hh}</section>
    <div class="bc-actions"><button type="button" class="btn sm" data-sc="ring" aria-pressed="${!!o.ringOn}">${o.ringOn ? t('Hide the ring') : t('Show the {0} km ring', [m.km])}</button>
    <p class="foot-note">${t('Tap a block to open its card. Straight-line distance; MOE measures from the home address, so check MOE\'s tool.')}</p></div></div>`;
}

/** "Blocks within 1 km with your flat types (4-room, 5-room): 23" — the dock's one-line summary. */
export const schoolExec = (m, types) => t('Blocks within {0} km with your flat types ({1}): {2}', [m.km, esc(types), `<b>${m.rows.length}</b>`]);

/** Every English string this file shows (zh staging check). */
export const schoolStrings = () => ['within budget', 'near budget', 'over budget', 'Median {0}', '{0} sale in the last {1}', '{0} sales in the last {1}',
  'No sales of your flat types in the last {0}', 'Sort the blocks', 'Nearest', 'Cheapest', 'No blocks with your flat types within {0} km.', 'Nearest: {0} · {1}.',
  'Show fewer', 'Show all {0} blocks', 'Add your household to see which are within your budget.', 'Hide the ring', 'Show the {0} km ring',
  "Tap a block to open its card. Straight-line distance; MOE measures from the home address, so check MOE's tool.", 'Blocks within {0} km with your flat types ({1}): {2}'];

// ------------------------------------------------------------------ browser
/**
 * ctx: { D, TX, blockTx, getS, median, bandsKm, schools() (legacy's P1 list), period() → { calc }, budget() → { max, stretch } | null,
 *        types() → "4-room, 5-room", bus, openBlock(bi), wireSeg, phone?() → true on phones }.
 * → { content(si) → dock content { title, exec, body, mount }, at(si) → { lat, lon, label } }
 */
export function createSchoolCard(ctx) {
  const ui = new Map(); // per school: { sort, all } — this session only
  let ring = null;      // school index whose 1 km ring is on
  const state = (si) => { if (!ui.has(si)) ui.set(si, { sort: 'near', all: false }); return ui.get(si); };

  function content(si, rerender) {
    const school = ctx.schools()[si], S = ctx.getS(), budget = ctx.budget();
    const m = schoolModel({ school, bandsKm: ctx.bandsKm, blocks: ctx.D.blocks, blockTx: ctx.blockTx, TX: ctx.TX, ftSet: new Set(S.ft), mFrom: S.mFrom, mTo: S.mTo, median: ctx.median, budget });
    const st = state(si);
    const o = { ...st, label: (bi) => ctx.D.blocks[bi].label, win: ctx.period().calc, budgetKnown: !!budget, ringOn: ring === si };
    return {
      title: m.name, exec: schoolExec(m, ctx.types()), body: schoolCardHtml(m, o),
      mount: (el) => {
        if (st.focus) { el.querySelector(st.focus)?.focus(); st.focus = null; } // re-rendered: keep the keyboard place
        ctx.wireSeg(el.querySelector('.sc-sort'), (v) => { st.sort = v; st.focus = `.sc-sort [data-v="${v}"]`; rerender(); });
        el.querySelector('.bc').addEventListener('click', (e) => {
          const row = e.target.closest('.sc-row');
          if (row) { ctx.openBlock(+row.dataset.bi); return; }
          const b = e.target.closest('[data-sc]'); if (!b) return;
          st.focus = `[data-sc="${b.dataset.sc}"]`;
          if (b.dataset.sc === 'all') { st.all = !st.all; rerender(); return; }
          ring = ring === si ? null : si;
          ctx.bus.emit('explore:rings', ring === si ? { lat: school.lat, lon: school.lon, radiiKm: [m.km], label: m.name } : null);
          rerender();
          if (ring === si && ctx.phone?.()) ctx.bus.emit('sheet:size', 'peek'); // phone: lower the sheet so the ring shows
        });
        return () => {};
      },
    };
  }
  const at = (si) => { const s = ctx.schools()[si]; return s ? { lat: s.lat, lon: s.lon, label: schoolName(s.n) } : null; };
  return { content, at };
}
