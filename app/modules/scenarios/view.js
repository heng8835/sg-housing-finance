// Scenarios card markup — pure strings (tests/scenarios/view.test.js): the saved list with its actions and the
// side-by-side compare table. Every number comes from engine/scenario.js scenarioResults(); this file only
// formats and picks the best value per row.
import { esc, money, kilo, pct } from '../../core/dom.js';
import { t, currentLang } from '../../core/i18n.js';
import { townName } from '../../core/typical.js';
import { defaultMode } from '../../engine/sellbuy.js';

export const RENT_BUY_YEARS = 10;   // compare-row horizon (UI choice: the Rent & Buy tab's default "Over 10 years")
const NAME_MAX = 60;

const VERDICT = { ok: ['good', '✓', 'Within your limits'], tight: ['warn', '!', 'Possible, but tight'], no: ['critical', '✕', 'Not affordable as it stands'], unknown: ['neutral', '?', 'Need a few more details'] };
const VERDICT_RANK = { ok: 0, tight: 1, unknown: 2, no: 3 };
const term = (id, text) => `<span data-term="${id}">${text}</span>`;
const small = (s) => (s ? `<small>${s}</small>` : '');
const round = (v) => (Number.isFinite(v) ? Math.round(v) : null);
const round3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) : null);   // ratios compared to 0.1 %

/** Short flat type for a scenario name: '4R', 'Executive', 'Multi-gen'. */
export function ftShort(ft) {
  const m = /^(\d) ROOM$/.exec(ft || '');
  if (m) return `${m[1]}R`;
  if (ft === 'EXECUTIVE') return t('Executive');
  if (ft === 'MULTI-GENERATION') return t('Multi-gen');
  return ft ? t(ft) : '';
}

// the order of a move, in short words for the "Your sale" row and the save hint (B14)
const ORDER_SHORT = { 'sell-first': 'sell first', 'buy-first': 'buy first', contra: 'sell and buy together' };

/**
 * The sale a scenario (or the current Plan) carries (7b B14): null when "I own a home now and will sell it" is not
 * ticked; price null = ticked but no sale price yet; mode = the chosen order, else the suggested one.
 * @param {{ current?:object }|null} plan  a snapshot's plan or the store's plan slice
 * @returns {{ price:number|null, mode:string }|null}
 */
export function saleOf(plan) {
  const c = plan && plan.current;
  if (!c || !c.owns) return null;
  return { price: +c.salePrice > 0 ? +c.salePrice : null, mode: c.mode || defaultMode(c.propertyType === 'private' ? 'private' : 'hdb', 'hdb') };
}

/** "S$540k · sell first" / "Not selling" / "Selling · no sale price yet". */
export function saleText(sale) {
  if (!sale) return t('Not selling');
  if (sale.price == null) return t('Selling · no sale price yet');
  return t('{0} · {1}', [kilo(sale.price), t(ORDER_SHORT[sale.mode] || sale.mode)]);
}

/**
 * Default name, e.g. 'A: Bishan 4R S$720k' — no town → a shortlisted flat's name, else just type and price; with a
 * sale (B14) ' · sell S$540k' is added and kept when the name is cut to NAME_MAX.
 */
export function defaultName(id, flat, town = null, sale = null) {
  const place = town ? townName(town) : flat.source === 'choice' ? flat.label || '' : '';
  const tail = sale && sale.price != null ? ` · ${t('sell {0}', [kilo(sale.price)])}` : '';
  return [`${id}:`, place, ftShort(flat.flatType || '4 ROOM'), kilo(flat.price)].filter(Boolean).join(' ').slice(0, NAME_MAX - tail.length) + tail;
}

/** Indices holding the best value ('min' | 'max'); none when fewer than two values or all equal. */
export function bestIdx(values, dir) {
  const nums = values.map((v, i) => [v, i]).filter(([v]) => Number.isFinite(v));
  if (nums.length < 2) return new Set();
  const vals = nums.map(([v]) => v), target = dir === 'min' ? Math.min(...vals) : Math.max(...vals);
  if (vals.every((v) => v === target)) return new Set();
  return new Set(nums.filter(([v]) => v === target).map(([, i]) => i));
}

const verdictTag = (r) => { const [tone, icon, text] = VERDICT[r.verdict] || VERDICT.unknown; return `<span class="tag ${tone}">${icon} ${t(text)}</span>`; };

function rentBuyCell(r) {
  if (!r.rentBuy) return `—${small(t('No rent figure for this flat.'))}`;
  const a = r.rentBuy.advantage;
  const head = a >= 0 ? t('Buying ahead by {0}', [money(a)]) : t('Renting ahead by {0}', [money(-a)]);
  const be = r.rentBuy.breakEvenYear != null ? t('Buying overtakes renting in year {0}.', [r.rentBuy.breakEvenYear]) : t('Buying does not overtake renting within this period.');
  return `${esc(head)}${small(esc(be))}`;
}

function cpfCell(r) {
  if (!r.cpf55) return `—${small(t('Add ages, income and CPF balances in About you.'))}`;
  const n = r.cpf55.buyers.filter((b) => b.ra != null).length;
  return `${money(r.cpf55.total)}${n > 1 ? small(esc(t('{0} buyers together', [n]))) : ''}`;
}

/**
 * Compare rows. simple = shown in Simple mode (the five key rows); val = the number compared for "best"
 * (rounded as displayed); dir = which way is better.
 */
export const ROWS = [
  // B14: the sale the scenario was saved with — read from its inputs, never "best"
  { id: 'sale', simple: true, inputs: true, label: () => t('Your sale'), dir: null, val: () => null, cell: (r, s) => esc(saleText(saleOf(s && s.plan))) },
  { id: 'price', simple: true, label: () => t('Price'), dir: 'min', val: (r) => round(r.price), cell: (r) => money(r.price) },
  { id: 'upfront', simple: true, label: () => term('upfront-cost', t('Upfront after grants')), dir: 'min', val: (r) => round(r.upfront.net),
    cell: (r) => `${money(r.upfront.net)}${small(esc(t('cash {0} · CPF + grants {1}', [money(r.upfront.cash), money(r.upfront.cpf)])))}` },
  { id: 'monthly', simple: true, label: () => term('instalment', t('Monthly instalment')), dir: 'min', val: (r) => round(r.monthly),
    cell: (r) => `${esc(t('{0}/mo', [money(r.monthly)]))}${small(t(r.loanType === 'bank' ? 'Bank loan' : 'HDB loan'))}` },
  { id: 'ratio', simple: false, label: () => `${term('msr', 'MSR')} / ${term('tdsr', 'TDSR')}`, dir: 'min', val: (r) => round3(r.msr),
    cell: (r) => (r.msr == null ? `—${small(t('add income'))}` : `MSR ${pct(r.msr)}${r.loanType === 'bank' && r.tdsr != null ? small(`TDSR ${pct(r.tdsr)}`) : ''}`) },
  { id: 'verdict', simple: true, label: () => t('Can you afford it?'), dir: 'min', val: (r) => VERDICT_RANK[r.verdict] ?? null, cell: verdictTag },
  { id: 'cost', simple: true, label: () => t('True monthly cost'), dir: 'min', val: (r) => (r.monthlyCost && !r.monthlyCost.noTax ? round(r.monthlyCost.total) : null),
    cell: (r) => (r.monthlyCost ? `${esc(t('{0}/mo', [money(r.monthlyCost.total)]))}${r.monthlyCost.noTax ? small(t('excl. property tax')) : ''}` : '—') },
  { id: 'oa', simple: false, label: () => t('CPF OA left after buying'), dir: 'max', val: (r) => round(r.oaLeft),
    cell: (r) => (r.oaLeft == null ? `—${small(t('add your CPF OA balance'))}` : money(r.oaLeft)) },
  { id: 'cpf55', simple: false, label: () => t('Retirement Account at 55 if you buy'), dir: 'max', val: (r) => round(r.cpf55 && r.cpf55.total), cell: cpfCell },
  { id: 'rentbuy', simple: false, label: () => t('Rent vs buy after {0} years', [RENT_BUY_YEARS]), dir: 'max', val: (r) => round(r.rentBuy && r.rentBuy.advantage), cell: rentBuyCell },
];

/** 'Oct 7, 2026' style date of an ISO timestamp, in the app language. */
export function savedLabel(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat(currentLang() === 'zh' ? 'zh-SG' : 'en-SG', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

/** Side-by-side table: one column per scenario; results[i] null = could not be calculated. */
export function compareHtml(list, results) {
  const head = `<tr><th scope="col"><span class="sc-corner">${t('Scenario')}</span></th>${list.map((s) => `<th scope="col">${esc(s.name)}</th>`).join('')}</tr>`;
  const rows = ROWS.map((row) => {
    const best = bestIdx(results.map((r) => (r ? row.val(r) : null)), row.dir);
    const cells = results.map((r, i) => `<td${best.has(i) ? ` class="best" title="${esc(t('Best of these scenarios'))}"` : ''}>${row.inputs ? row.cell(r, list[i]) : r ? row.cell(r) : `—${small(t('Could not be calculated'))}`}</td>`).join('');
    return `<tr${row.simple ? '' : ' class="pro-only"'}><th scope="row">${row.label()}</th>${cells}</tr>`;
  }).join('');
  return `<div class="sc-scroll" role="region" tabindex="0" aria-label="${esc(t('Scenario comparison'))}">
    <table class="mini sc-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

function itemHtml(s, editing) {
  const act = (a, label, aria, cls = 'btn sm') => `<button type="button" class="${cls}" data-act="${a}" data-i="${s.id}" aria-label="${esc(aria)}">${label}</button>`;
  if (editing === s.id) {
    return `<li class="sc-item editing"><div class="fields"><label class="f wide"><span>${t('Name')}</span><input type="text" id="scName" maxlength="${NAME_MAX}" value="${esc(s.name)}"></label></div>
      <div class="actions">${act('sc-rename-save', t('Save'), t('Save the new name'), 'btn sm primary')}${act('sc-rename-cancel', t('Cancel'), t('Keep the old name'))}</div></li>`;
  }
  const f = s.focus || {};
  const sells = s.plan && s.plan.current && s.plan.current.owns ? t('includes selling your home') : null; // Phase 7a A2
  const line = [f.label, money(f.price), sells, t('saved {0}', [savedLabel(s.savedAt)])].filter(Boolean).map(esc).join(' · ');
  return `<li class="sc-item"><span class="sc-name"><b>${esc(s.name)}</b><small>${line}</small></span>
    <span class="sc-acts">${act('sc-load', t('Load'), t('Load {0}', [s.name]))}${act('sc-rename', t('Rename'), t('Rename {0}', [s.name]))}${act('sc-delete', t('Delete'), t('Delete {0}', [s.name]))}</span></li>`;
}

/**
 * The card's body.
 * @param {{ list:object[], results:(object|null)[], canSave:boolean, why:string, editing:string|null, max:number,
 *   sale?:{ price:number|null, mode:string }|null, phone?:boolean, layout?:Function|null }} x  sale = saleOf(the current
 *   plan) → "Saves your sale too" (B14); phone = the phone wording; layout(list, results) = the compare markup
 *   (default: the table; phones with 3–4 scenarios pass cards.js cardsHtml)
 */
export function cardHtml({ list, results, canSave, why, editing, max, sale = null, phone = false, layout = null }) {
  const compare = list.length ? `${(layout || compareHtml)(list, results)}${list.length === 1 ? `<p class="hint">${t('Save another scenario to compare side by side.')}</p>` : ''}` : '';
  return `<h3>${t('Scenarios')}</h3>
    <p class="sec-sub">${t('Save this flat, household and loan as A to D and compare them side by side. Kept in this browser only.')}</p>
    <div class="actions"><button type="button" class="btn sm primary" id="scSave"${canSave ? '' : ' disabled aria-describedby="scWhy"'}>${phone ? t('Save this flat as a scenario') : t('Save current as scenario')}</button>
      <span class="sc-count">${esc(t('{0} of {1} saved', [list.length, max]))}</span></div>
    ${why ? `<p class="hint" id="scWhy">${esc(why)}</p>` : ''}
    ${sale && sale.price != null && canSave ? `<p class="hint">${esc(t('Saves your sale too ({0}, {1}).', [kilo(sale.price), t(ORDER_SHORT[sale.mode] || sale.mode)]))}</p>` : ''}
    ${list.length ? `<ul class="sc-list">${list.map((s) => itemHtml(s, editing)).join('')}</ul>${compare}` : `<p class="hint">${t('No scenarios yet. Save one, change the flat or your loan, and save another.')}</p>`}
    <p class="hint pro-only">${t('Every number is recalculated from the saved inputs with today\'s rules. Rent vs buy uses the base assumptions of the Rent & Buy tab.')}</p>`;
}
