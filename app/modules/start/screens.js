// Start here — the goal-specific screens (Phase 7b B5) and the extras on the shared ones: "Add a child" on the who
// screen, the income split for two buyers, "No income from work". Pure string builders (node-testable); calm WP-A
// classes only (.fields › label.f, .seg-field, .seg, .chips, .f-help, .hint, .link). Wired in index.js.
import { t } from '../../core/i18n.js';
import { flatTypeLabel } from '../../core/flattype.js';
import { esc, money } from '../../core/dom.js';
import { blockInput, blockName } from '../../core/blocksearch.js';
import { CHILD_GOALS, SPLITS, HOME_FLAT_TYPES } from './answers.js';

export const BLOCK_CLS = 'st-block';
export const BLOCK_LIST = 'stBlockList';

const segBtn = (attr, v, on, label) => `<button type="button" role="radio" aria-checked="${on}" data-${attr}="${v}" class="${on ? 'on' : ''}">${esc(t(label))}</button>`;
const segField = (label, id, attr, items, cur, help = '') => `<div class="seg-field"><span class="f-label" id="${id}">${esc(t(label))}</span>
  <div class="seg" role="radiogroup" aria-labelledby="${id}">${items.map(([v, l]) => segBtn(attr, v, v === cur, l)).join('')}</div>${help ? `<p class="f-help">${help}</p>` : ''}</div>`;
const numField = (label, attr, value, extra = '', cls = '') => `<label class="f${cls ? ` ${cls}` : ''}"><span>${esc(label)}</span><input type="number" inputmode="numeric" min="0" ${attr} value="${value ?? ''}" ${extra}></label>`;
const buyerLabel = (n, i, one, two) => (n === 1 ? t(one) : t(two, [i + 1]));

/** "＋ Add a child (for Primary 1 dates)" → a date field (buy / BTO / sell goals; O6). */
export function childPart(a) {
  if (!CHILD_GOALS.includes(a.goal)) return '';
  if (!a.childOpen && !a.child) return `<p class="st-extra"><button type="button" class="link" data-st="child">${esc(t('＋ Add a child (for Primary 1 dates)'))}</button></p>`;
  return `<div class="fields st-fields"><label class="f"><span>${esc(t("Child's date of birth"))}</span><input type="date" data-child value="${esc(a.child || '')}"></label></div>
    <p class="f-help">${esc(t('Used for the Primary 1 registration dates in Plan → Key dates.'))}</p>`;
}

const SPLIT_LABELS = { even: 'Evenly', one: 'One of us works', each: 'Type each' };
const SPLIT_HELP = { even: 'We split it evenly between the two of you — change it in Your household.', one: 'All of it counts for Buyer 1. Change it in Your household.', each: '' };

/** Two buyers: how the income is split. With "Type each" the two incomes replace the bands. */
export function splitPart(a) {
  if (a.buyers !== 2 || a.noWork) return '';
  const cur = SPLITS.includes(a.split) ? a.split : 'even';
  const each = cur === 'each' ? `<div class="fields st-fields">${[0, 1].map((i) => numField(t('Buyer {0} income (S$ a month)', [i + 1]), `step="100" data-each="${i}"`, a.each?.[i])).join('')}</div>` : '';
  const help = SPLIT_HELP[cur] ? esc(t(SPLIT_HELP[cur])) : '';
  return `${segField('Split between you', 'stSplitLbl', 'split', SPLITS.map((s) => [s, SPLIT_LABELS[s]]), cur, help)}${each}`;
}

const PARENT_ITEMS = [['none', 'No'], ['near', 'Near them'], ['with', 'With them']];

/** Savings (rough): CPF OA for all buyers, cash, parents nearby (Proximity Housing Grant). */
function savings(a) {
  const n = a.buyers === 2 ? 2 : 1;
  const oa = a.cpfOa ?? a.oaSaved;
  return `<div class="fields st-fields">
      ${numField(n === 2 ? t('CPF Ordinary Account (both of you, S$)') : t('CPF Ordinary Account (S$)'), 'step="1000" data-oa', oa)}
      ${numField(t('Cash savings (S$)'), 'step="1000" data-cash', a.cash)}
    </div>
    ${segField('Will you live with or near your parents (or child)?', 'stParLbl', 'parents', PARENT_ITEMS, a.parents, esc(t('Near = within the distance HDB sets for the Proximity Housing Grant. Not sure? Pick No and change it later.')))}`;
}

const HOME_ITEMS = [['hdb', 'HDB flat'], ['private', 'Private property']];

/** The home you own: HDB / private, then (HDB) the block and flat type. hdb = data.js (block names). */
function home(a, hdb) {
  const h = a.home || {};
  let more = '';
  if (h.type === 'hdb') {
    const name = h.block && h.block.label ? h.block.label : h.block ? blockName(hdb, h.block.bid) : '';
    more = `<div class="fields st-fields">
        <label class="f wide"><span>${esc(t('Your block (optional)'))}</span>${blockInput({ cls: BLOCK_CLS, listId: BLOCK_LIST, value: name, placeholder: t('Search block or street') })}</label>
        <label class="f"><span>${esc(t('Flat type'))}</span><select data-home-ft><option value="">—</option>${HOME_FLAT_TYPES.map((x) => `<option value="${x}"${x === h.flatType ? ' selected' : ''}>${esc(flatTypeLabel(x))}</option>`).join('')}</select></label>
      </div>
      ${a.goal === 'sellUpgrade' ? `<p class="f-help">${esc(t('You own an HDB flat, so you count as second-timers. Change it in Your household.'))}</p>` : ''}`;
  } else if (h.type === 'private') {
    more = `<p class="hint">${esc(t('Private property: the sale is worked out in Plan → Sell then buy.'))}</p>`;
  }
  return `${segField('What do you own now?', 'stHomeLbl', 'home-type', HOME_ITEMS, h.type)}${more}`;
}

const RENT_ITEMS = [['whole', 'Whole flat'], ['room', 'Room']];

/** Your rent now: whole flat / room + the amount (shared with Rent & Buy and Plan, B7). A room rent is the user's figure. */
function rentNow(a) {
  const r = a.rent || {};
  const room = r.type === 'room';
  return `${segField('What are you renting?', 'stRentLbl', 'rent-type', RENT_ITEMS, room ? 'room' : 'whole')}
    <div class="fields st-fields">${numField(t('Rent (S$ a month)'), 'step="50" data-rent-amount', r.amount, '', 'wide')}</div>
    ${room ? `<p class="f-help">${esc(t("Your figure — there's no public data on room rents."))}</p>` : ''}`;
}

/** Where you travel most days: one or two commute places (same list as Colour by → Commute). hubs = [{ id, name }]. */
function travel(a, hubs) {
  if (!hubs.length) return `<p class="hint">${esc(t('The list of places appears once the map data has loaded.'))}</p>`;
  const sel = (k) => `<select data-hub="${k}"><option value="">—</option>${hubs.map((h) => `<option value="${esc(h.id)}"${a.hubs?.[k] === h.id ? ' selected' : ''}>${esc(t(h.name))}</option>`).join('')}</select>`;
  return `<div class="fields st-fields">
      <label class="f wide"><span>${esc(t('Place'))}</span>${sel(0)}</label>
      <label class="f wide"><span>${esc(t('Second place (optional)'))}</span>${sel(1)}</label>
    </div>`;
}

/** CPF and cash (rough): Retirement Account per buyer, the CPF LIFE payout for a buyer at the payout age, cash. */
function cpfCash(a, payoutAge) {
  const n = a.buyers === 2 ? 2 : 1;
  const rows = Array.from({ length: n }, (_, i) => {
    if ((a.residency || [])[i] === 'F') return '';
    const ra = numField(buyerLabel(n, i, 'Retirement Account (S$)', 'Buyer {0}: Retirement Account (S$)'), `step="1000" data-ra="${i}"`, a.ra?.[i]);
    const age = a.ages?.[i];
    const life = payoutAge != null && age != null && +age >= payoutAge
      ? numField(buyerLabel(n, i, 'Already receiving CPF LIFE? Monthly payout (S$)', 'Buyer {0}: CPF LIFE payout now (S$ a month)'), `step="10" data-life="${i}"`, a.life?.[i]) : '';
    return ra + life;
  }).join('');
  return `<div class="fields st-fields">${rows}${numField(t('Cash savings (S$)'), 'step="1000" data-cash', a.cash)}</div>`;
}

/** Body of a goal-specific screen; '' for the shared ones (view.js). opts = { hdb, hubs, payoutAge }. */
export function goalScreen(q, a, { hdb = null, hubs = [], payoutAge = null } = {}) {
  switch (q) {
    case 'savings': return savings(a);
    case 'home': return home(a, hdb);
    case 'rentNow': return rentNow(a);
    case 'travel': return travel(a, hubs);
    case 'cpfCash': return cpfCash(a, payoutAge);
    default: return '';
  }
}

/** Retire: "No income from work" next to the income bands. */
export const noWorkChip = (a) => (a.goal === 'retire'
  ? `<button type="button" class="chip${a.noWork ? ' on' : ''}" aria-pressed="${!!a.noWork}" data-nowork>${esc(t('No income from work'))}</button>` : '');

/** "You're set" extra lines for the goal-specific answers. */
export function goalLines(a) {
  const out = [];
  if (a.goal === 'sellUpgrade' && a.home && a.home.type === 'hdb') out.push(t('Second-timers — you own an HDB flat; change it in Your household.'));
  if (a.goal === 'rent' && a.rent && a.rent.amount != null) {
    out.push(a.rent.type === 'room' ? t('Your room rent: {0} a month (your figure).', [money(a.rent.amount)]) : t('Your rent now: {0} a month.', [money(a.rent.amount)]));
  }
  return out;
}

/** Every English string these screens show (zh coverage test). */
export const screenStrings = () => [
  '＋ Add a child (for Primary 1 dates)', "Child's date of birth", 'Used for the Primary 1 registration dates in Plan → Key dates.',
  ...Object.values(SPLIT_LABELS), ...Object.values(SPLIT_HELP).filter(Boolean), 'Buyer {0} income (S$ a month)', 'Split between you',
  ...PARENT_ITEMS.map(([, l]) => l), 'CPF Ordinary Account (both of you, S$)', 'CPF Ordinary Account (S$)', 'Cash savings (S$)',
  'Will you live with or near your parents (or child)?', 'Near = within the distance HDB sets for the Proximity Housing Grant. Not sure? Pick No and change it later.',
  ...HOME_ITEMS.map(([, l]) => l), 'What do you own now?', 'Your block (optional)', 'Search block or street', 'Flat type',
  'You own an HDB flat, so you count as second-timers. Change it in Your household.', 'Private property: the sale is worked out in Plan → Sell then buy.',
  ...RENT_ITEMS.map(([, l]) => l), 'What are you renting?', 'Rent (S$ a month)', "Your figure — there's no public data on room rents.",
  'The list of places appears once the map data has loaded.', 'Place', 'Second place (optional)',
  'Retirement Account (S$)', 'Buyer {0}: Retirement Account (S$)', 'Already receiving CPF LIFE? Monthly payout (S$)', 'Buyer {0}: CPF LIFE payout now (S$ a month)',
  'No income from work', 'Second-timers — you own an HDB flat; change it in Your household.', 'Your room rent: {0} a month (your figure).', 'Your rent now: {0} a month.',
];
