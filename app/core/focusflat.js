// Phase 8a (mobile-revamp-ideas.md M-01, M-08), pure helpers — node-testable (tests/core/focusflat.test.js):
//  · the flat in focus bar (modules/shell/flatbar.js): which flat the answer is for, its place among your choices
//    ("Flat 2 of 3"), and the next / previous choice for ‹ ›;
//  · the "Based on your household" rows under an answer (Afford verdict, Rent or buy, Plan CPF): the household figures
//    the answer used, each a button that opens the one-field quick edit (modules/household/quickedit.js, data-qe).
// Nothing is computed for money here: the bar shows the flat's own price, the rows show the household's own figures
// (the income total is engine/household.js summarise(), the same sum every engine uses).
import { esc, money } from './dom.js';
import { t } from './i18n.js';
import { ftWord } from './typical.js';
import { flatTypeEnglish } from './flattype.js';
import { summarise } from '../engine/household.js';

// ---------------------------------------------------------------- the flat in focus bar
/**
 * What the bar says. focus = store 'focus'; tf = the flat on screen (focus with a price, else the typical flat —
 * core/typical.js effectiveFlat); choices = focus objects of your shortlisted flats (source 'choice', choiceId);
 * blockLabel = the block's address for a block hand-off (or null).
 * @returns {{ empty:true, n:number } | { empty:false, name:string, ft:string, price:string, typical:boolean, pos:number, n:number }}
 *   pos = 1-based place of the focus among the choices, 0 = not one of them.
 */
export function barModel({ focus = null, tf = null, choices = [], blockLabel = null } = {}) {
  const n = Array.isArray(choices) ? choices.length : 0;
  if (!tf || !(tf.price > 0)) return { empty: true, n };
  const pos = choicePos(focus, choices);
  const typical = !!tf.isDefault;
  const name = typical ? tf.label
    : focus && focus.source === 'choice' && focus.label ? focus.label
      : focus && focus.bid != null && blockLabel ? blockLabel
        : t('Your own figures');
  let ft = typical || !tf.flatType ? '' : ftWord(tf.flatType);
  const lc = String(name).toLowerCase(), en = String(flatTypeEnglish(tf.flatType || '')).toLowerCase();
  // "Fernvale 4-room" already says it — also in 中文, where ft is "4房式" but a choice's name stays English (P8-03)
  if (ft && (lc.includes(ft.toLowerCase()) || (en && lc.includes(en)))) ft = '';
  return { empty: false, name, ft, price: money(tf.price), typical, pos, n };
}

/** "Fernvale · 4-room · S$600,000" (the typical flat's name already says its type). */
export const barText = (m) => (m && !m.empty ? [m.name, m.ft, m.price].filter(Boolean).join(' · ') : '');

/** 1-based place of the focus among the choices (same choiceId), 0 when it is not one of them. */
export function choicePos(focus, choices = []) {
  if (!focus || focus.source !== 'choice' || focus.choiceId == null || !Array.isArray(choices)) return 0;
  return choices.findIndex((c) => c && c.choiceId === focus.choiceId) + 1;
}

/**
 * The choice ‹ (dir −1) or › (dir +1) moves to, or null at either end. From a flat that is not one of the choices,
 * › goes to the first and ‹ to the last.
 */
export function stepChoice(focus, choices = [], dir = 1) {
  const n = Array.isArray(choices) ? choices.length : 0;
  if (!n) return null;
  const pos = choicePos(focus, choices);
  if (!pos) return choices[dir > 0 ? 0 : n - 1];
  const next = pos - 1 + Math.sign(dir);
  return next >= 0 && next < n ? choices[next] : null;
}

/** The nav line: "2 of 3 in your choices" / "3 flats in your choices" / "1 flat in your choices". */
export function navText(m) {
  if (!m || !m.n) return '';
  if (m.pos) return t('{0} of {1} in your choices', [m.pos, m.n]);
  return m.n === 1 ? t('1 flat in your choices') : t('{0} flats in your choices', [m.n]);
}

/** Show ‹ › when there is somewhere to go: two or more choices, or one that is not the flat on screen. */
export const showNav = (m) => !!m && (m.n >= 2 || (m.n === 1 && !m.pos));

// ---------------------------------------------------------------- "Based on your household"
const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
const notEntered = () => t('not entered');
/** Buyers with CPF (citizens and PRs). */
const cpfBuyers = (h) => (h.buyers || []).map((b, i) => ({ b: b || {}, i })).filter(({ b }) => b.citizenship !== 'F');

/** The keys a "Based on" row can show, and the household paths its quick edit changes. */
export const QE_KEYS = ['income', 'cash', 'cpfOa', 'age'];

/**
 * The household paths one row edits (one per buyer for income / CPF OA / age; CPF OA only for buyers with CPF).
 * @returns {string[]} paths under household, e.g. ['buyers.0.income', 'buyers.1.income'] or ['cash']
 */
export function qePaths(household, key) {
  const h = household || {}, buyers = Array.isArray(h.buyers) ? h.buyers : [];
  if (key === 'cash') return ['cash'];
  if (key === 'cpfOa') return cpfBuyers(h).map(({ i }) => `buyers.${i}.cpfOa`);
  if (key === 'income' || key === 'age') return buyers.map((_, i) => `buyers.${i}.${key}`);
  return [];
}

/**
 * The rows: [{ key, label, value }] for the keys asked, in that order. A row whose figure cannot exist here (CPF for
 * a household of foreigners) is left out. value = the household's own figure, or "not entered".
 */
export function basedOnRows(household, keys = []) {
  const h = household || {}, out = [];
  for (const key of keys) {
    if (key === 'income') {
      const v = summarise(h).income;
      out.push({ key, label: t('Income'), value: v == null ? notEntered() : t('{0} a month', [money(v)]) });
    } else if (key === 'cash') {
      const v = num(h.cash);
      out.push({ key, label: t('Cash'), value: v == null ? notEntered() : money(v) });
    } else if (key === 'cpfOa') {
      const who = cpfBuyers(h);
      if (!who.length) continue;
      const vals = who.map(({ b }) => num(b.cpfOa)).filter((v) => v != null);
      out.push({ key, label: t('CPF Ordinary Account'), value: vals.length ? money(vals.reduce((s, v) => s + v, 0)) : notEntered() });
    } else if (key === 'age') {
      const ages = (h.buyers || []).map((b) => num(b && b.age));
      const known = ages.filter((v) => v != null);
      const value = !known.length ? notEntered() : ages.length === 2 && known.length === 2 ? t('{0} and {1}', [ages[0], ages[1]]) : known.join(', ');
      out.push({ key, label: ages.length > 1 ? t('Ages') : t('Age'), value });
    }
  }
  return out;
}

/**
 * The block under an answer's figures: a heading and one 44 px button per row ("Income · S$8,000 a month · Edit").
 * Buttons carry data-qe = key; modules/household/quickedit.js opens the one-field sheet for it. live = a selector, in the
 * block's parent, of the answer line the sheet repeats at its top while you type (data-live; P8-04).
 */
export function basedOnHtml(household, keys, { id = '', live = '' } = {}) {
  const rows = basedOnRows(household, keys);
  if (!rows.length) return '';
  const head = t('Based on your household');
  return `<div class="based-on"${id ? ` id="${esc(id)}"` : ''}${live ? ` data-live="${esc(live)}"` : ''} role="group" aria-label="${esc(head)}"><p class="bo-h">${esc(head)}</p>
    ${rows.map((r) => `<button type="button" class="bo-row" data-qe="${r.key}" aria-label="${esc(t('Edit {0}: {1}', [r.label, r.value]))}"><span class="bo-t">${esc(r.label)}</span><span class="bo-v">${esc(r.value)}</span><span class="bo-e" aria-hidden="true">${t('Edit')}</span></button>`).join('')}
  </div>`;
}

/** Every English string this module shows (zh coverage test). */
export const uiStrings = () => ['Your own figures', '{0} of {1} in your choices', '1 flat in your choices', '{0} flats in your choices',
  'not entered', 'Income', '{0} a month', 'Cash', 'CPF Ordinary Account', '{0} and {1}', 'Ages', 'Age', 'Based on your household', 'Edit {0}: {1}', 'Edit'];
