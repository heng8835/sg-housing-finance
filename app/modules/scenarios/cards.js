// Scenarios on a phone (phone overhaul §3.5): with 3 or 4 saved scenarios the side-by-side table is wider than the
// screen, so each scenario becomes one card in a swipe row (scroll-snap; ‹ › and "Scenario 1 of 3" for people who
// do not swipe), the same pattern as Compare on phones. Same ROWS, same cells, same "best" marks as the table
// (view.js) — this file only lays them out. ≤ 2 scenarios keep the table (it fits). Pure strings + a small binder.
import { esc } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { ROWS, bestIdx } from './view.js';

/** Cards instead of the table from this many scenarios (phones only). */
export const CARDS_FROM = 3;

const small = (s) => `<small>${s}</small>`;

/** One card per scenario; row order = ROWS; Pro-only rows keep the pro-only class (hidden in Simple). */
export function cardsHtml(list, results) {
  const best = ROWS.map((row) => bestIdx(results.map((r) => (r ? row.val(r) : null)), row.dir));
  const cards = list.map((s, i) => {
    const r = results[i];
    const rows = ROWS.map((row, k) => {
      const cell = row.inputs ? row.cell(r, s) : r ? row.cell(r) : `—${small(t('Could not be calculated'))}`;
      const b = best[k].has(i);
      return `<div class="sc-cr${row.simple ? '' : ' pro-only'}${b ? ' best' : ''}"><dt>${row.label()}</dt><dd>${cell}${b ? ` <span class="tag good">${t('best')}</span>` : ''}</dd></div>`;
    }).join('');
    return `<li class="sc-card" data-i="${i}" aria-label="${esc(t('Scenario {0} of {1}', [i + 1, list.length]))}"><h4>${esc(s.name)}</h4><dl>${rows}</dl></li>`;
  }).join('');
  return `<div class="sc-cards" role="region" aria-label="${esc(t('Scenario comparison'))}">
    <div class="sc-cnav"><button type="button" class="btn sm" data-sc-step="-1" aria-label="${esc(t('Previous scenario'))}" disabled>‹</button>
      <span class="sc-pos" aria-live="polite">${esc(t('Scenario {0} of {1}', [1, list.length]))}</span>
      <button type="button" class="btn sm" data-sc-step="1" aria-label="${esc(t('Next scenario'))}">›</button></div>
    <ol class="sc-track">${cards}</ol></div>`;
}

/** ‹ › scroll one card; the position line follows a swipe. Delegated on the Scenarios card node (call once). */
export function bindCards(node) {
  const at = (track) => {
    const cards = [...track.children];
    const x = track.scrollLeft;
    let k = 0;
    cards.forEach((c, i) => { if (Math.abs(c.offsetLeft - track.offsetLeft - x) < Math.abs(cards[k].offsetLeft - track.offsetLeft - x)) k = i; });
    return k;
  };
  const sync = (wrap) => {
    const track = wrap.querySelector('.sc-track'), n = track.children.length, k = at(track);
    wrap.querySelector('.sc-pos').textContent = t('Scenario {0} of {1}', [k + 1, n]);
    wrap.querySelector('[data-sc-step="-1"]').disabled = k === 0;
    wrap.querySelector('[data-sc-step="1"]').disabled = k === n - 1;
  };
  node.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sc-step]');
    if (!b) return;
    const wrap = b.closest('.sc-cards'), track = wrap.querySelector('.sc-track');
    const k = Math.max(0, Math.min(track.children.length - 1, at(track) + +b.dataset.scStep));
    const card = track.children[k];
    track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setTimeout(() => sync(wrap), 400);
  });
  node.addEventListener('scroll', (e) => { const w = e.target.closest && e.target.closest('.sc-cards'); if (w && e.target.classList.contains('sc-track')) sync(w); }, true);
}

/** Every English string here (zh coverage). */
export const cardStrings = () => ['best', 'Scenario {0} of {1}', 'Previous scenario', 'Next scenario', 'Save this flat as a scenario'];
