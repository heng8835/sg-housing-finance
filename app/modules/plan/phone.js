// Plan on a phone (phone overhaul §3.7; audit P-45 to P-47): the page was up to ~6,900 px with no way to jump. On a
// phone (≤ 767 px) every Plan card becomes a fold (`details[data-fold]`, open / closed kept by core/fold.js
// keepFolds) with a one-line summary, and a row of jump chips sits on top (the only sideways scroller on the page).
// CPF & retirement and the card of the Start here goal are open; the others start closed. Desktop markup is untouched:
// index.js calls foldCards() only when the phone media query matches. Pure ordering / labels first (tests), DOM after.
import { t } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';

export const PHONE_MQ = '(max-width: 767px)';

/** The Plan cards in page order: id, jump chip label, fold summary (English keys; t() at render). */
export const CARDS = [
  { id: 'planCpf', chip: 'CPF', sub: 'Your CPF at 55 and CPF LIFE, with and without buying.' },
  { id: 'planSellBuy', chip: 'Sell & buy', sub: 'Sale proceeds, CPF refund and the next flat.' },
  { id: 'planDates', chip: 'Key dates', sub: 'Lease, MOP, Primary 1 and calendar dates.' },
  { id: 'planSeniors', chip: 'Retirement', sub: 'Stay, right-size, Lease Buyback and 2-room Flexi.' },
  { id: 'planSchools', chip: 'Schools', sub: 'Primary schools by P1 distance band.' },
  { id: 'planBto', chip: 'BTO', sub: 'Waiting time, rent while you wait and cash needed.' },
];
// Start here goal (store ui.start.goal) → the card it is about (same mapping as modules/start GOALS[].section)
export const GOAL_CARD = { btoVsResale: 'planBto', sellUpgrade: 'planSellBuy', retire: 'planCpf' };

export const foldKey = (id) => `pl-${id}`;

/** Open by default: CPF & retirement, and the card that matches the Start here goal. */
export const openByDefault = (id, goal) => id === 'planCpf' || GOAL_CARD[goal] === id;

/**
 * Jump chips for the cards present (a missing card or a Pro-only card in Simple has no chip).
 * @param {{ id:string, proOnly:boolean }[]} present  @param {boolean} simple
 */
export function jumpRowHtml(present, simple) {
  const have = new Map(present.map((p) => [p.id, p]));
  const chips = CARDS.filter((c) => have.has(c.id) && !(simple && have.get(c.id).proOnly))
    .map((c) => `<button type="button" class="chip" data-jump="${c.id}">${esc(t(c.chip))}</button>`);
  return chips.length > 1 ? `<nav class="pl-jump" aria-label="${esc(t('Plan sections'))}">${chips.join('')}</nav>` : '';
}

/** Key dates summary: "Next: 9 Jan 2091 Lease reaches 20 years" from the first date still to come ('' = none). */
function nextDate(sec) {
  const li = sec.querySelector('ul.dates > li:not(.past)');
  if (!li) return '';
  const c = li.cloneNode(true);
  c.querySelectorAll('small, br, .tag, a').forEach((x) => x.remove());
  const s = c.textContent.replace(/\s+/g, ' ').trim();
  return s ? t('Next: {0}', [s]) : '';
}

/**
 * Turn each Plan card inside root into a fold and put the jump row first. Call right after the markup is in place
 * (before keepFolds.apply()). isOpen(key, default) = keepFolds isOpen.
 * @param {Element} root  @param {{ isOpen:(k:string, d:boolean)=>boolean, goal?:string|null, simple?:boolean }} o
 */
export function foldCards(root, { isOpen, goal = null, simple = false }) {
  const present = [];
  for (const c of CARDS) {
    const sec = root.querySelector(`:scope > #${c.id}`);
    if (!sec || sec.tagName === 'DETAILS') continue;
    const h3 = sec.querySelector(':scope > h3');
    if (!h3) continue;
    present.push({ id: c.id, proOnly: sec.classList.contains('pro-only') });
    const key = foldKey(c.id);
    const d = document.createElement('details');
    d.className = `${sec.className} fold`;
    d.id = c.id;
    d.dataset.fold = key;
    d.open = isOpen(key, openByDefault(c.id, goal));
    const sub = (c.id === 'planDates' && nextDate(sec)) || t(c.sub);
    d.innerHTML = `<summary><span class="fold-t">${h3.innerHTML}</span><span class="fold-s">${esc(sub)}</span></summary><div class="fold-body"></div>`;
    h3.remove();
    const body = d.querySelector('.fold-body');
    while (sec.firstChild) body.appendChild(sec.firstChild);
    sec.replaceWith(d);
  }
  root.insertAdjacentHTML('afterbegin', jumpRowHtml(present, simple));
}

/** Open a card (a fold on phones) and scroll it to the top of the page. */
export function showCard(root, id) {
  const card = root.querySelector(`#${id}`);
  if (!card) return;
  if (card.tagName === 'DETAILS' && !card.open) card.open = true; // 'toggle' → keepFolds remembers it
  card.scrollIntoView({ block: 'start' });
}

/** Every English string here (zh coverage). */
export const phoneStrings = () => [...CARDS.flatMap((c) => [c.chip, c.sub]), 'Plan sections', 'Next: {0}', 'Age {0}', 'Basic (BRS)', 'Full (FRS)', 'Enhanced (ERS)'];
