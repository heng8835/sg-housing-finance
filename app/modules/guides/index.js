// Guides (spec phase 6a AC 1, 3, 4): a Guides list at the top of the Learn sheet (filled into Learn's
// [data-slot="guides"] on bus 'learn:painted'), a guide reader in its own side sheet (step n of N, Back / Next,
// "Show me in the app" → the real control, live numbers for the current household, sources), a self-check quiz
// with instant feedback and "Learn more" (bus 'learn:open'), and the policy-change log. Content:
// content/guides.json (+ guides.<lang>.json), built by tools/build_content.py. Completion memory only in the
// store: ui.guides = { [guideId]: { done: 'YYYY-MM-DD', score, of } } (localStorage, never sent anywhere).
import { t, currentLang } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';
import { isoDay } from '../../core/place.js';
import { effectiveFlat } from '../../core/typical.js';
import { parentsKmFor } from '../../core/parents.js';
import { resolveLive, fieldFor } from './live.js';
import { saleInput } from '../../engine/salefunds.js';
import { listHtml, stepHtml, quizHtml } from './render.js';
import { logHtml } from './log.js';
import { createShowMe } from './showme.js';
import { isPhone } from '../../core/spotlight.js';

/** Guides for a language (falls back to English when the translation file is missing). */
export async function loadGuides(lang, fetchFn = fetch) {
  const get = async (f) => { try { const r = await fetchFn(f); return r.ok ? (await r.json()).guides || {} : {}; } catch { return {}; } };
  let g = lang === 'en' ? {} : await get(`content/guides.${lang}.json`);
  if (!Object.keys(g).length) g = await get('content/guides.json');
  return Object.values(g).sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id));
}

/** Store value after a finished quiz. */
export const markDone = (prev, id, score, of, day) => ({ ...(prev || {}), [id]: { done: day, score, of } });

export async function mountGuides({ store, policy, bus }) {
  const guides = await loadGuides(currentLang());
  if (!guides.length) return null;
  const byId = Object.fromEntries(guides.map((g) => [g.id, g]));
  const pos = {};          // last step per guide (this visit only)
  let view = null;         // { kind: 'step' | 'quiz' | 'log', id?, i?, answers?, status? }
  const done = () => store.get('ui.guides') || {};

  const sheet = document.createElement('dialog');
  sheet.className = 'sheet g-sheet phone-full'; sheet.id = 'guideSheet'; // phones: full-screen page (§3.9)
  sheet.setAttribute('aria-labelledby', 'gSheetTitle');
  document.body.append(sheet);
  const showMe = createShowMe({ bus, onBack: () => open(view) });

  // ---------------------------------------------------------------- Guides list inside the Learn sheet
  bus.on('learn:painted', ({ root }) => {
    const slot = root && root.querySelector('[data-slot="guides"]');
    if (!slot) return;
    slot.innerHTML = listHtml(guides, done());
    slot.addEventListener('click', (e) => {
      const g = e.target.closest('[data-guide-open]');
      if (g) { bus.emit('learn:close'); open({ kind: 'step', id: g.dataset.guideOpen, i: pos[g.dataset.guideOpen] || 0 }); return; }
      if (e.target.closest('[data-guide-log]')) { bus.emit('learn:close'); open({ kind: 'log', status: null }); }
    });
  });
  bus.on('guides:open', ({ id = null } = {}) => open(id && byId[id] ? { kind: 'step', id, i: 0 } : { kind: 'log', status: null }));

  // ---------------------------------------------------------------- views
  function liveFor(g, i) {
    let flat = null;
    try { flat = effectiveFlat(store, undefined, { prefer: store.get('plan.current.owns') ? 'largest' : null }); } catch { /* map data not loaded yet */ }
    const household = store.get('household');
    return resolveLive(g.steps[i].live || [], { household, flat, policy, sale: saleInput(store.get('plan'), new Date().getFullYear()), parentsKm: flat ? parentsKmFor(household, flat) : null });
  }

  function body() {
    if (view.kind === 'log') return logHtml(policy, { today: isoDay(new Date()), status: view.status, simple: store.get('ui.mode') !== 'pro' }); // 7c C9
    const simple = store.get('ui.mode') !== 'pro';
    const g = byId[view.id];
    if (view.kind === 'quiz') return quizHtml(g, view.answers || [], { policy, tourTitle: g.use_case || null });
    return stepHtml(g, view.i, { policy, live: liveFor(g, view.i), simple });
  }

  function render({ keepScroll = false } = {}) {
    const old = sheet.querySelector('.drawer-body'), top = keepScroll && old ? old.scrollTop : 0;
    const title = view.kind === 'log' ? esc(t('Rules and recent changes')) : byId[view.id].title;
    sheet.innerHTML = `<div class="drawer-body"><div class="drawer-head">
        <button type="button" class="link g-back" data-g-learn>${esc(t('← Learn'))}</button>
        <h2 id="gSheetTitle">${title}</h2>
        ${isPhone() ? `<button type="button" class="btn sm" data-close>${esc(t('Close'))}</button>`
    : `<button type="button" class="btn sm" data-close aria-label="${esc(t('Close'))}">✕</button>`}</div>
      ${body()}</div>`;
    sheet.querySelector('.drawer-body').scrollTop = top;
    bus.emit('learn:decorate', { root: sheet });
  }

  function open(v) {
    if (!v || (v.kind !== 'log' && !byId[v.id])) return;
    view = v;
    if (v.kind === 'step') pos[v.id] = v.i;
    render();
    if (!sheet.open) sheet.showModal();
    focusMain();
  }

  function focusMain() {
    const f = sheet.querySelector('[data-guide-step]:not([disabled]).primary, [data-guide-quiz], .g-opt:not([disabled]), [data-pl-status].on') || sheet.querySelector('[data-close]');
    f?.focus({ preventScroll: true });
  }

  function answer(k, j) {
    const g = byId[view.id], answers = (view.answers || []).slice();
    if (answers[k] != null) return;
    answers[k] = j;
    view = { ...view, answers };
    const n = g.quiz.length;
    if (answers.filter((a) => a != null).length === n) {
      const score = g.quiz.filter((q, x) => answers[x] === q.answer).length;
      store.set('ui.guides', markDone(done(), g.id, score, n, isoDay(new Date())));
    }
    render({ keepScroll: true });
    const next = sheet.querySelector('.g-opt:not([disabled])');
    (next || sheet.querySelector('.g-score') || sheet.querySelector('[data-guide-list]'))?.focus?.({ preventScroll: true });
    sheet.querySelectorAll('.g-fb')[k]?.scrollIntoView({ block: 'nearest' });
  }

  sheet.addEventListener('click', (e) => {
    const el = e.target.closest('button, a');
    if (!el || el.tagName === 'A') return;
    const d = el.dataset;
    if ('close' in d) return sheet.close();
    if ('gLearn' in d || 'guideList' in d) { sheet.close(); return bus.emit('learn:open', { id: null }); }
    if (d.guideStep != null) return open({ kind: 'step', id: view.id, i: +d.guideStep });
    if ('guideQuiz' in d) return open({ kind: 'quiz', id: view.id, answers: view.answers || [] });
    if (d.guideAnswer) { const [k, j] = d.guideAnswer.split(':').map(Number); return answer(k, j); }
    if ('guideRetry' in d) return open({ kind: 'quiz', id: view.id, answers: [] });
    if (d.guideTerm) return bus.emit('learn:open', { id: d.guideTerm }); // Learn sheet opens on top; ✕ comes back here
    if ('guideTour' in d) { sheet.close(); return bus.emit('guide:open', { useCase: byId[view.id].use_case }); }
    if ('guideShow' in d) { sheet.close(); return showMe.show(byId[view.id].steps[view.i]); }
    if (d.guideNeed === 'flat') { sheet.close(); bus.emit('nav:goto', { tab: 'afford' }); return showMe.pill(); }
    if (d.guideNeed) return bus.emit('household:open', { field: fieldFor(d.guideNeed, store.get('household')) });
    if (d.plStatus != null) { view = { ...view, status: d.plStatus || null }; render({ keepScroll: true }); return sheet.querySelector('[data-pl-status].on')?.focus(); }
  });

  // live numbers follow the household drawer / Afford while a step is open
  const refresh = () => { if (sheet.open && view && view.kind === 'step') render({ keepScroll: true }); };
  store.subscribe('household', refresh);
  store.subscribe('focus', refresh);
  store.subscribe('plan.current', refresh); // the home being sold changes the live numbers (A2)

  return { open: (id) => open({ kind: 'step', id, i: 0 }), openLog: () => open({ kind: 'log', status: null }), guides };
}
