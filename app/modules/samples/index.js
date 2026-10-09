// Sample households sandbox (Phase 6a AC 2): "Try a sample household" (Learn sheet top + household drawer) → picker
// of three made-up households → the user's own data is backed up and the sample is loaded (page reload; the store
// helpers in core/store.js do the writes at start-up) → a calm banner at the top until "Exit sample" puts the
// user's data back exactly. Edits in a sample are allowed and discarded on exit.
// Bus: listens to 'samples:open' {} (picker), 'samples:load' {id} (guides: "Try it with the Young couple sample"),
// 'samples:exit' {}. Sample ids: SAMPLE_IDS in ./data.js.
import { t } from '../../core/i18n.js';
import { flatTypeLabel } from '../../core/flattype.js';
import { esc, money } from '../../core/dom.js';
import { data } from '../../core/data.js';
import { requestSample, requestSampleExit, userSnapshot } from '../../core/store.js';
import { summarise } from '../../engine/household.js';
import { SAMPLES, sampleById } from './data.js';
import { buildSample, samplePayload } from './build.js';
import { isPhone } from '../../core/spotlight.js';

const CITIZEN = { SC: 'Singapore Citizen', PR: 'Permanent Resident', F: 'Foreigner' };

export function mountSamples({ store, policy, bus, storage = window.localStorage, reload = () => location.reload() }) {
  const active = () => store.inSample();
  const activeSample = () => { const s = active(); return s ? sampleById(s.id) : null; };

  // ---- banner (only while a sample is on)
  function mountBanner() {
    const s = activeSample(); if (!s) return;
    const el = document.createElement('div');
    el.id = 'sampleBanner'; el.className = 'sample-banner'; el.setAttribute('role', 'status');
    // desktop: the full sentence + two buttons; phones (R-01): one ≤ 48 px line "Sample: X" + [Exit] (CSS picks;
    // "Other samples" and the "not saved" line live in the Menu / household page there)
    el.innerHTML = `<p class="sb-text">${t("You're exploring a sample: {0} — changes are not saved to your own household.", [`<b>${esc(t(s.name))}</b>`])}</p>
      <span class="sb-short">${t('Sample: {0}', [esc(t(s.name))])}</span>
      <div class="sb-actions"><button type="button" class="btn sm sb-other" data-smp="open">${t('Other samples')}</button><button type="button" class="btn sm primary sb-exit-long" data-smp="exit">${t('Exit sample')}</button><button type="button" class="btn sb-exit-short" data-smp="exit" aria-label="${esc(t('Exit sample'))}">${t('Exit')}</button></div>`;
    el.addEventListener('click', onClick);
    const skip = document.querySelector('.skip-link'); // a11y 5a: "Skip to content" stays the first stop
    if (skip) skip.after(el); else document.body.prepend(el);
    document.body.classList.add('in-sample');
  }

  // ---- picker
  const dlg = document.createElement('dialog');
  dlg.id = 'smpDialog'; dlg.className = 'drawer phone-full'; dlg.setAttribute('aria-labelledby', 'smpTitle'); // phones: full-screen page (§3.9)
  document.body.appendChild(dlg);

  function facts(s) {
    const h = s.household, sum = summarise(h);
    const who = h.buyers.map((b) => t('{0}, {1}', [t(CITIZEN[b.citizenship] || b.citizenship), b.age])).join(' · ');
    const types = [...new Set(s.shortlist.map((f) => flatTypeLabel(f.flatType)))].join(', ');
    return `<ul class="smp-facts">
      <li>${esc(who)}</li>
      <li>${t('Income {0} a month · CPF OA {1} · cash {2}', [money(sum.income || 0), money(sum.cpfOa), money(sum.cash)])}</li>
      <li>${s.plan.current.owns ? t('Owns a {0} flat now', [t(s.plan.current.flatType)]) : t('First-time buyers')} · ${t('Shortlist: {0} flats ({1})', [s.shortlist.length, types])}</li>
    </ul>`;
  }

  function card(s, cur, waiting) {
    const on = cur && cur.id === s.id;
    return `<div class="section smp-card${on ? ' smp-current' : ''}">
      <h3>${esc(t(s.name))}${on ? ` <span class="tag info">${t('Exploring now')}</span>` : ''}</h3>
      <p class="sec-sub">${esc(t(s.blurb))}</p>
      ${facts(s)}
      <p class="hint">${esc(t(s.tryThis))}</p>
      <div class="actions">${on
    ? `<button type="button" class="btn sm" data-smp="exit">${t('Exit sample')}</button>`
    : `<button type="button" class="btn sm primary" data-smp="load" data-id="${esc(s.id)}"${waiting ? ' disabled' : ''}>${waiting ? t('Loading HDB data…') : t('Explore this sample')}</button>`}</div>
    </div>`;
  }

  function renderPicker() {
    const cur = active(), waiting = !data.hdb;
    dlg.innerHTML = `<div class="drawer-body">
      <div class="drawer-head"><h2 id="smpTitle">${t('Try a sample household')}</h2>${isPhone()
    ? `<button type="button" class="btn sm" data-smp="close">${t('Close')}</button>`
    : `<button type="button" class="btn sm" data-smp="close" aria-label="${esc(t('Close'))}">✕</button>`}</div>
      <p class="hint">${t('Explore every tab with a made-up household — no real person, round numbers.')} <b>${t('Your own household, shortlist and settings are kept safe')}</b> ${t('and come back exactly as they were when you exit the sample. Changes you make inside a sample are not kept.')}</p>
      ${SAMPLES.map((s) => card(s, cur, waiting)).join('')}
      <p class="hint" id="smpMsg" aria-live="polite"></p>
      <p class="foot-note">${t('Educational examples, not financial advice. Asking prices are illustrative.')}</p>
    </div>`;
  }

  function openPicker() {
    renderPicker();
    if (!dlg.open) dlg.showModal();
    if (!data.hdb) { const off = bus.on('data:ready', () => { off(); if (dlg.open) renderPicker(); }); }
  }

  // ---- load / exit
  function resolver() {
    const d = data.hdb; if (!d) return { resolve: () => null, flatTypes: [] };
    const index = new Map(d.blocks.map((b, i) => [`${b.b}|${d.streets[b.s]}`, i]));
    const resolve = (blk, street) => {
      const bid = index.get(`${blk}|${street}`); if (bid == null) return null;
      return { bid, leaseStart: leaseYear(d, bid) };
    };
    return { resolve, flatTypes: d.flat_types };
  }

  function load(id) {
    const s = sampleById(id);
    if (!s) return openPicker();
    if (!data.hdb) { openPicker(); return; } // the shortlist needs the block list; the picker waits for it
    const built = buildSample(s, { base: userSnapshot(storage), ...resolver(), asOf: new Date(), leaseTerm: policy.get('lease.term.years'), tr: t });
    try { requestSample(storage, s.id, samplePayload(built)); } catch {
      const m = dlg.querySelector('#smpMsg'); if (m) m.textContent = t('The sample could not be loaded — this browser did not let the app save it.');
      return;
    }
    reload();
  }

  function exit() { requestSampleExit(storage); reload(); }

  function onClick(e) {
    const b = e.target.closest('[data-smp]'); if (!b) return;
    const act = b.dataset.smp;
    if (act === 'close') return dlg.close();
    if (act === 'open') { b.closest('dialog')?.close(); return openPicker(); }
    if (act === 'exit') return exit();
    if (act === 'load') return load(b.dataset.id);
  }
  dlg.addEventListener('click', onClick);

  // ---- Learn sheet entry: our own card at the top of the sheet's index view (modules/learn is not edited)
  function learnCard() {
    const s = activeSample();
    return s
      ? `<p><b>${t('Exploring a sample: {0}', [esc(t(s.name))])}</b></p><p class="hint">${t('Changes are not saved to your own household.')}</p>
        <div class="actions"><button type="button" class="btn sm" data-smp="open">${t('Other samples')}</button><button type="button" class="btn sm" data-smp="exit">${t('Exit sample')}</button></div>`
      : `<p><b>${t('Try a sample household')}</b></p><p class="hint">${t('See every tab filled in for a young couple, an upgrading family or a retiree couple. Your own data is kept safe.')}</p>
        <div class="actions"><button type="button" class="btn sm" data-smp="open">${t('Choose a sample →')}</button></div>`;
  }
  function decorateSheet(sheet) {
    const body = sheet.querySelector('.drawer-body');
    if (!body || !body.querySelector('#learnIndex') || body.querySelector('.smp-learn')) return;
    const el = document.createElement('div');
    el.className = 'smp-learn'; el.innerHTML = learnCard();
    el.addEventListener('click', onClick);
    const head = body.querySelector('.drawer-head');
    if (head) head.after(el); else body.prepend(el);
  }
  const watched = new WeakSet();
  function watchSheet(sheet) {
    if (watched.has(sheet)) return;
    watched.add(sheet);
    new MutationObserver(() => decorateSheet(sheet)).observe(sheet, { childList: true });
    decorateSheet(sheet);
  }
  const findSheets = () => document.querySelectorAll('body > dialog.sheet').forEach(watchSheet);
  new MutationObserver(findSheets).observe(document.body, { childList: true });
  findSheets();
  bus.on('learn:painted', ({ root } = {}) => { if (root) decorateSheet(root); }); // same card, via the Learn event

  bus.on('samples:open', openPicker);
  bus.on('samples:load', ({ id } = {}) => load(id));
  bus.on('samples:exit', exit);
  mountBanner();
}

/** Lease start year of a block in data.js: the most common lease year of its sales, else the block's year built. */
function leaseYear(d, bid) {
  const count = new Map();
  let best = 0, year = 0;
  for (let i = 0; i < d.tx.b.length; i++) {
    if (d.tx.b[i] !== bid) continue;
    const y = d.tx.ly[i], c = (count.get(y) || 0) + 1;
    count.set(y, c);
    if (c > best) { best = c; year = y; }
  }
  return year || d.blocks[bid].yc || null;
}
