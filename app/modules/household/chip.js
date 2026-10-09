// Household entry in the header, id="hhChip" (phone top-bar spec phone-topbar-area-household.md §3.4; moved out of
// household/index.js). Desktop (≥ 768 px) unchanged: "👪 2 buyers · S$8k/mo · 29 ▾" — each piece is its own .hh-d span,
// the same flex items the old bare text runs made. Phones: an outline person icon over the word "You" / "我的"
// (styles/phone.css shows .hh-tb and hides .hh-d). No count, money or badge on the phone bar; the status is in the
// accessible name ("About you — 2 buyers, S$8,000 a month"), set on phones only so the desktop chip keeps the name of
// its visible text. Nothing set → word and icon in --accent-ink (.unset). The click (open the page) stays in index.js.
import { summarise } from '../../engine/household.js';
import { esc, money, kilo } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { PHONE_MAX } from '../../core/place.js';

/** "You" has another translation elsewhere (您): the top-bar word uses its own key, English shown as "You". */
const WORD_KEY = 'You (top bar)';
export const chipWord = () => { const s = t(WORD_KEY); return s === WORD_KEY ? 'You' : s; };

const NAME = {
  unset: 'About you — not set yet',
  sample: 'About you — sample household',
  one: 'About you — {0} buyer, {1} a month',
  many: 'About you — {0} buyers, {1} a month',
};

/** Pure: the entry's state for a household → { state: 'unset' | 'set' | 'sample', name (accessible name), html (desktop chip) }. */
export function chipState(household, { inSample = false } = {}) {
  const s = summarise(household || {}), n = s.buyers.length;
  const unset = s.income == null;
  const state = inSample ? 'sample' : unset ? 'unset' : 'set';
  const name = state === 'sample' ? t(NAME.sample) : state === 'unset' ? t(NAME.unset) : t(n === 1 ? NAME.one : NAME.many, [n, money(s.income)]);
  const html = unset
    ? `<span class="hh-d">👪 </span><b class="hh-d">${esc(t('About you — set up'))}</b>`
    : `<span class="hh-d">👪 ${esc(t(n === 1 ? '{0} buyer' : '{0} buyers', [n]))}</span><span class="hh-more hh-d"> · ${esc(t('{0}/mo', [kilo(s.income)]))}${s.youngestAge ? ` · ${s.youngestAge}` : ''}</span> <span class="hh-d" aria-hidden="true">▾</span>`;
  return { state, name, html };
}

const ICON = '<svg class="tb-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20c.8-3.6 3.8-5.6 7.5-5.6s6.7 2 7.5 5.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

/** Build #hhChip after the header spacer, keep it in step with the household; returns the button. */
export function mountChip({ store }) {
  const chip = document.createElement('button');
  chip.id = 'hhChip'; chip.className = 'hh-chip tb-item'; chip.type = 'button';
  chip.setAttribute('aria-haspopup', 'dialog');
  document.querySelector('header .spacer').after(chip);
  const mq = matchMedia(`(max-width: ${PHONE_MAX}px)`);
  let st = null;
  const label = () => { if (mq.matches) chip.setAttribute('aria-label', st.name); else chip.removeAttribute('aria-label'); };
  function render() {
    st = chipState(store.get('household'), { inSample: !!store.inSample?.() });
    chip.innerHTML = `${st.html}<span class="hh-tb" hidden>${ICON}<span class="tb-w">${esc(chipWord())}</span></span>`;
    chip.classList.toggle('unset', st.state === 'unset');
    chip.title = t('Your household — used by every calculation. Stays in this browser.');
    label();
  }
  mq.addEventListener?.('change', label);
  addEventListener('resize', label); // fallback where a resize comes without a media-query 'change'
  store.subscribe('household', render);
  render();
  return chip;
}

/** Every English string this module shows (zh coverage test). */
export const uiStrings = () => [WORD_KEY, ...Object.values(NAME), 'About you — set up', '{0} buyer', '{0} buyers', '{0}/mo',
  'Your household — used by every calculation. Stays in this browser.'];
