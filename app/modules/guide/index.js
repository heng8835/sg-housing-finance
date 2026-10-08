// Guided tour entry points (spec §6.1–6.2): header button #guideBtn (after #learnBtn), a one-time non-modal offer
// card after the data has loaded, and the use-case picker (native modal <dialog>). The coach marks are in tour.js,
// the content in steps.js. Memory lives only in the store: ui.guide = { offered, done: { [useCaseId]: 'YYYY-MM-DD' } }.
// Reachability (H9): a "Take a tour of this tab" line at the top of each tab pane, bus 'guide:open' { useCase? }
// (Learn sheet), and on phones the header button reads "? Tour".

import { t } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';
import { USE_CASES, stepsFor } from './steps.js';
import { createTour, isDesktop } from './tour.js';

const OFFER_DELAY_MS = 800;
// the tour that explains each side-panel tab
export const TAB_TOURS = { explore: 'map', afford: 'firstResale', rent: 'renting', plan: 'retire', choices: 'shortlist' };

export function mountGuide({ store, bus, ready } = {}) {
  if (document.getElementById('guideBtn')) return;
  const tour = createTour({ store, bus });

  // ---------------------------------------------------------------- header button
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'btn sm'; btn.id = 'guideBtn';
  btn.innerHTML = `<span class="ic" aria-hidden="true">🧭</span><span class="lbl"> ${esc(t('Guide'))}</span><span class="lbl-q" aria-hidden="true">?</span><span class="lbl-s" aria-hidden="true">${esc(t('Tour'))}</span>`;
  btn.setAttribute('aria-label', t('Guide: how to use this site'));
  btn.addEventListener('click', () => openPicker(btn));
  const learn = document.getElementById('learnBtn'), chip = document.getElementById('hhChip');
  if (learn) learn.after(btn);
  else if (chip) chip.before(btn);
  else document.querySelector('header')?.append(btn);

  // ---------------------------------------------------------------- use-case picker
  const picker = document.createElement('dialog');
  picker.className = 'guide-picker'; picker.id = 'guidePicker';
  picker.setAttribute('aria-labelledby', 'guidePickerTitle');
  document.body.append(picker);
  let returnTo = null;

  function renderPicker() {
    const done = store.get('ui.guide.done') || {}, desktop = isDesktop();
    const rows = USE_CASES.map((u) => {
      const when = done[u.id];
      const meta = when
        ? `<span class="tag good" title="${esc(t('Done on {0}', [when]))}">${esc(t('✓ Done'))}</span>`
        : esc(t('{0} steps', [stepsFor(u, desktop).length]));
      return `<button type="button" class="gp-opt" data-uc="${esc(u.id)}">
        <span class="gp-text"><span class="gp-t">${esc(t(u.title))}</span><span class="gp-d">${esc(t(u.blurb))}</span></span>
        <span class="gp-meta">${meta}</span></button>`;
    }).join('');
    picker.innerHTML = `<div class="gp-inner">
      <div class="gp-head"><h2 id="guidePickerTitle">${esc(t('What would you like to do?'))}</h2>
        <button type="button" class="gp-x" data-a="close" aria-label="${esc(t('Close'))}">✕</button></div>
      <div class="gp-list">${rows}</div>
      <p class="gp-foot">${esc(t('Open this again any time from Guide at the top.'))}</p>
    </div>`;
  }

  function openPicker(opener) {
    dismissOffer();
    if (tour.active() || picker.open) return;
    returnTo = opener && opener.isConnected ? opener : (document.activeElement !== document.body ? document.activeElement : btn);
    renderPicker();
    picker.showModal();
    picker.querySelector('.gp-opt')?.focus();
  }

  picker.addEventListener('click', (e) => {
    if (e.target === picker) { picker.close(); return; } // backdrop click
    const opt = e.target.closest('[data-uc]');
    if (opt) {
      const uc = USE_CASES.find((u) => u.id === opt.dataset.uc);
      if (!uc) return;
      picker.close(); // its async 'close' event sees tour.active() and leaves focus to the tour
      tour.start(uc, returnTo);
      return;
    }
    if (e.target.closest('[data-a="close"]')) picker.close();
  });
  picker.addEventListener('close', () => {
    if (tour.active()) return;
    (returnTo && returnTo.isConnected ? returnTo : btn).focus();
  });

  // ---------------------------------------------------------------- one-time offer (non-modal, never steals focus)
  let offer = null;
  const markOffered = () => { if (!store.get('ui.guide.offered')) store.set('ui.guide.offered', true); };
  function dismissOffer() {
    if (!offer) return;
    markOffered();
    const hadFocus = offer.contains(document.activeElement);
    offer.remove(); offer = null;
    if (hadFocus) btn.focus();
  }
  function showOffer() {
    if (store.get('ui.guide.offered') || offer || picker.open || tour.active()) return;
    // first visit: "Start here" (modules/start) comes first; offer the tour once it closes (finishing it marks offered)
    if (document.querySelector('dialog#startDlg[open]')) { const off = bus?.on('start:closed', () => { off(); setTimeout(showOffer, OFFER_DELAY_MS); }); return; }
    offer = document.createElement('div');
    offer.id = 'guideOffer'; offer.className = 'guide-offer';
    offer.setAttribute('role', 'dialog'); offer.setAttribute('aria-labelledby', 'guideOfferText');
    offer.innerHTML = `<p id="guideOfferText">${esc(t('New here? Take a short tour for what you want to do.'))}</p>
      <div class="go-actions">
        <button type="button" class="btn sm primary" data-a="go">${esc(t('Show me around'))}</button>
        <button type="button" class="btn sm" data-a="later">${esc(t('Not now'))}</button>
      </div>
      <button type="button" class="go-x" data-a="later" aria-label="${esc(t('Close'))}">✕</button>`;
    offer.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'go') openPicker(btn); // dismisses the offer first
      else if (a === 'later') dismissOffer();
    });
    offer.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); dismissOffer(); } });
    (document.getElementById('app') || document.body).append(offer); // inside #app so it can follow --cover
  }
  Promise.resolve(ready).then(() => setTimeout(showOffer, OFFER_DELAY_MS));

  // ---------------------------------------------------------------- per-tab tour links + 'guide:open'
  function startTour(id, opener) {
    const uc = USE_CASES.find((u) => u.id === id);
    if (!uc || tour.active()) return;
    dismissOffer();
    if (picker.open) picker.close();
    tour.start(uc, opener && opener.isConnected ? opener : btn);
  }
  const tourLine = (id) => (store.get('ui.guide.done') || {})[id]
    ? `<span aria-hidden="true">🧭</span> ${esc(t('✓ Tour done'))} · <button type="button" class="link" data-uc="${esc(id)}">${esc(t('Take it again'))}</button>`
    : `<span aria-hidden="true">🧭</span> <button type="button" class="link" data-uc="${esc(id)}">${esc(t('Take a tour of this tab'))}</button> · <button type="button" class="link" data-a="picker">${esc(t('All tours'))}</button>`;
  // the .tab panes are static containers (modules render into child roots), so the line is inserted once
  const links = Object.entries(TAB_TOURS).map(([tab, id]) => {
    const pane = document.getElementById(`tab-${tab}`);
    if (!pane) return null;
    const p = document.createElement('p');
    p.className = 'tour-link';
    p.innerHTML = tourLine(id);
    p.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.uc) startTour(b.dataset.uc, b); else if (b.dataset.a === 'picker') openPicker(b);
    });
    pane.prepend(p);
    return [p, id];
  }).filter(Boolean);
  store.subscribe('ui.guide', () => links.forEach(([p, id]) => { if (!p.contains(document.activeElement)) p.innerHTML = tourLine(id); }));
  bus?.on('guide:open', ({ useCase } = {}) => (useCase ? startTour(useCase) : openPicker(document.activeElement)));

  return { openPicker: () => openPicker(btn), start: (id) => startTour(id, btn) };
}
