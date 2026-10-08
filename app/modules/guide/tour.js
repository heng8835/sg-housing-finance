// Coach marks for the guided tour (spec §6.3): one fullscreen modal <dialog id="coach"> in the top layer (above Leaflet
// and the panel; focus trap + Esc for free), a spotlight hole on the target and a popover with Back / Next / Skip.
// The page under it is inert — users read, then press Next. Never changes the user's data or Simple / Pro mode;
// only `ui.guide.done[useCaseId]` is written (when Done is pressed on the last step).

import { t } from '../../core/i18n.js';
import { stepsFor } from './steps.js';
import { holeRect, placePop, dockSide, isoDay } from '../../core/place.js';
import { SETTLE_MS, isPhone, isDesktop, frame, wait, query, shown, visibleRect, revealInPanel } from '../../core/spotlight.js';

export { isPhone, isDesktop }; // DOM helpers live in core/spotlight.js (shared with modules/guides)

export function createTour({ store, bus }) {
  let state = null;   // { uc, steps, i, seq, target, returnTo }
  let raf = 0;
  const dlg = document.createElement('dialog');
  dlg.id = 'coach'; dlg.className = 'coach';
  dlg.setAttribute('aria-labelledby', 'coachTitle'); dlg.setAttribute('aria-describedby', 'coachBody');
  dlg.innerHTML = `<div class="coach-hole" aria-hidden="true"></div>
    <div class="coach-pop">
      <span class="coach-arrow" aria-hidden="true"></span>
      <div class="coach-text" aria-live="polite">
        <p class="coach-count" id="coachCount"></p>
        <h2 class="coach-title" id="coachTitle"></h2>
        <p class="coach-body" id="coachBody"></p>
        <p class="coach-note" id="coachNote" hidden></p>
      </div>
      <div class="coach-foot">
        <button type="button" class="link" data-a="skip"></button>
        <span class="coach-gap"></span>
        <button type="button" class="btn sm" data-a="back"></button>
        <button type="button" class="btn sm primary" data-a="next"></button>
      </div>
    </div>`;
  document.body.append(dlg);
  const $ = (s) => dlg.querySelector(s);
  const hole = $('.coach-hole'), pop = $('.coach-pop');
  const btnSkip = $('[data-a="skip"]'), btnBack = $('[data-a="back"]'), btnNext = $('[data-a="next"]');
  btnSkip.textContent = t('Skip tour'); btnBack.textContent = t('Back');

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : null;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; layout(); }); };
  const panel = () => document.getElementById('panel');

  function layout() {
    if (!state) return;
    const vw = innerWidth, vh = innerHeight, el = state.target;
    const h = el && el.isConnected ? holeRect(visibleRect(el), vw, vh) : null;
    dlg.classList.remove('pending');
    dlg.classList.toggle('no-hole', !h);
    if (h) Object.assign(hole.style, { left: `${h.left}px`, top: `${h.top}px`, width: `${h.right - h.left}px`, height: `${h.bottom - h.top}px` });
    const phone = isPhone();
    dlg.classList.toggle('phone', phone);
    if (phone) {
      pop.style.left = pop.style.top = '';
      pop.dataset.side = `dock-${dockSide(h, vh)}`;
      return;
    }
    const p = placePop(h, pop.offsetWidth, pop.offsetHeight, vw, vh);
    pop.style.left = `${Math.round(p.left)}px`; pop.style.top = `${Math.round(p.top)}px`;
    pop.dataset.side = p.side;
    if (p.arrow != null) pop.style.setProperty('--arrow', `${Math.round(p.arrow)}px`);
  }

  function fill(step, note) {
    const { i, steps } = state, last = i === steps.length - 1;
    $('#coachCount').textContent = t('Step {0} of {1}', [i + 1, steps.length]);
    $('#coachTitle').textContent = t(step.title);
    $('#coachBody').textContent = t(note !== null && step.bodyIfMissing ? step.bodyIfMissing : step.body);
    const n = $('#coachNote'); n.hidden = !note; n.textContent = note ? t(note) : '';
    btnBack.disabled = i === 0;
    btnNext.textContent = last ? t('Done') : t('Next');
  }

  async function go(i) {
    if (!state || i < 0 || i >= state.steps.length) return;
    const seq = ++state.seq, step = state.steps[i];
    const stale = () => !state || state.seq !== seq;
    state.i = i;
    const app = document.getElementById('app');
    const wasHidden = app?.classList.contains('panel-hidden');
    if (step.tab) bus?.emit('nav:goto', { tab: step.tab }); // also un-hides the side panel
    await frame(); await frame();
    if (stale()) return;
    let el = query(step.target);
    const missing = !shown(el);
    if (missing) el = (step.fallback || []).map(query).find(shown) || null;
    let settle = step.tab && wasHidden && !app?.classList.contains('panel-hidden') ? SETTLE_MS : 0;
    const inPanel = !!(el && el.closest('#panel')) || !!step.tab;
    if (inPanel && isPhone() && panel()?.dataset.size !== 'half') { bus?.emit('sheet:size', 'half'); settle = SETTLE_MS; }
    if (settle) { await wait(settle); if (stale()) return; }
    if (el && !shown(el)) el = null; // e.g. clipped after the sheet resized
    if (el && el.closest('#panel')) revealInPanel(el);
    await frame();
    if (stale()) return;
    ro?.disconnect();
    state.target = el;
    if (el) ro?.observe(el);
    fill(step, missing ? step.ifMissing || '' : null); // '' = missing, no extra note (bodyIfMissing still applies)
    layout();
    if (dlg.classList.contains('no-anim')) requestAnimationFrame(() => requestAnimationFrame(() => dlg.classList.remove('no-anim')));
    btnNext.focus({ preventScroll: true });
  }

  const next = () => { if (!state) return; if (state.i >= state.steps.length - 1) end(true); else go(state.i + 1); };
  const back = () => { if (state && state.i > 0) go(state.i - 1); };

  function end(done) {
    if (!state) return;
    const { uc, returnTo } = state;
    state = null;
    ro?.disconnect();
    removeEventListener('resize', schedule);
    document.removeEventListener('scroll', schedule, true);
    panel()?.removeEventListener('transitionend', schedule);
    if (dlg.open) dlg.close();
    if (done) {
      const prev = store.get('ui.guide.done') || {};
      store.set('ui.guide.done', { ...prev, [uc.id]: isoDay(new Date()) });
    }
    const to = returnTo && returnTo.isConnected && shown(returnTo) ? returnTo : document.getElementById('guideBtn');
    to?.focus();
  }

  dlg.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'skip') end(false); else if (a === 'back') back(); else if (a === 'next') next();
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    else if (e.key === 'Enter' && !e.target.closest('button')) { e.preventDefault(); next(); } // buttons click natively
  });
  // Esc (cancel) closes the dialog → end without marking done (ignore a stale close from a previous run)
  dlg.addEventListener('close', () => { if (!dlg.open) end(false); });

  return {
    active: () => !!state,
    /** Start a use case; focus returns to `returnTo` (or #guideBtn) when the tour ends. */
    start(uc, returnTo = null) {
      if (state) end(false);
      const steps = stepsFor(uc, isDesktop());
      if (!steps.length) return;
      state = { uc, steps, i: 0, seq: 0, target: null, returnTo };
      addEventListener('resize', schedule);
      document.addEventListener('scroll', schedule, true);
      panel()?.addEventListener('transitionend', schedule);
      dlg.classList.add('no-anim', 'no-hole', 'pending');
      fill(steps[0], null);
      dlg.showModal();
      go(0);
    },
    end: () => end(false),
  };
}
