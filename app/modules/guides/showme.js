// "Show me in the app" for a guide step: open the step's tab, spotlight the real control (same targeting,
// fallbacks and placement as the guided tour — core/spotlight.js + core/place.js, reusing the tour's .coach styles),
// with "Back to the guide" and "Try it myself". Try it leaves a small "↩ Back to the guide" button at the bottom.
import { t } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';
import { holeRect, placePop, dockSide } from '../../core/place.js';
import { locate, visibleRect, isPhone } from '../../core/spotlight.js';

const FOCUSABLE = 'input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])';

export function createShowMe({ bus, onBack }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'coach g-coach'; dlg.id = 'guideCoach';
  dlg.setAttribute('aria-labelledby', 'gCoachTitle'); dlg.setAttribute('aria-describedby', 'gCoachBody');
  dlg.innerHTML = `<div class="coach-hole" aria-hidden="true"></div>
    <div class="coach-pop"><span class="coach-arrow" aria-hidden="true"></span>
      <div class="coach-text" aria-live="polite">
        <p class="coach-count">${esc(t('Show me'))}</p>
        <h2 class="coach-title" id="gCoachTitle"></h2>
        <p class="coach-body" id="gCoachBody"></p>
        <p class="coach-note" hidden></p>
      </div>
      <div class="coach-foot">
        <button type="button" class="link" data-a="try">${esc(t('Try it myself'))}</button>
        <span class="coach-gap"></span>
        <button type="button" class="btn sm primary" data-a="back">${esc(t('Back to the guide'))}</button>
      </div></div>`;
  document.body.append(dlg);
  const hole = dlg.querySelector('.coach-hole'), pop = dlg.querySelector('.coach-pop');
  let target = null, seq = 0, raf = 0, pill = null;

  function layout() {
    if (!dlg.open) return;
    const vw = innerWidth, vh = innerHeight;
    const h = target && target.isConnected ? holeRect(visibleRect(target), vw, vh) : null;
    dlg.classList.remove('pending');
    dlg.classList.toggle('no-hole', !h);
    if (h) Object.assign(hole.style, { left: `${h.left}px`, top: `${h.top}px`, width: `${h.right - h.left}px`, height: `${h.bottom - h.top}px` });
    const phone = isPhone();
    dlg.classList.toggle('phone', phone);
    if (phone) { pop.style.left = pop.style.top = ''; pop.dataset.side = `dock-${dockSide(h, vh)}`; return; }
    const p = placePop(h, pop.offsetWidth, pop.offsetHeight, vw, vh);
    pop.style.left = `${Math.round(p.left)}px`; pop.style.top = `${Math.round(p.top)}px`;
    pop.dataset.side = p.side;
    if (p.arrow != null) pop.style.setProperty('--arrow', `${Math.round(p.arrow)}px`);
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; layout(); }); };

  function stop() {
    removeEventListener('resize', schedule);
    document.removeEventListener('scroll', schedule, true);
    if (dlg.open) dlg.close();
  }
  function removePill() { pill?.remove(); pill = null; }
  function showPill() {
    removePill();
    pill = document.createElement('div');
    pill.className = 'g-return'; pill.setAttribute('role', 'region'); pill.setAttribute('aria-label', t('Guide'));
    pill.innerHTML = `<button type="button" class="btn sm primary" data-a="back">${esc(t('↩ Back to the guide'))}</button><button type="button" class="g-return-x" data-a="x" aria-label="${esc(t('Close'))}">✕</button>`;
    pill.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'back') { removePill(); onBack(); } else if (a === 'x') removePill();
    });
    (document.getElementById('app') || document.body).append(pill);
  }

  dlg.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'back') { stop(); onBack(); }
    else if (a === 'try') {
      const el = target; stop(); showPill();
      const f = el && (el.matches(FOCUSABLE) ? el : el.querySelector(FOCUSABLE));
      f?.focus({ preventScroll: false });
    }
  });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); stop(); onBack(); }); // Esc = back to the guide

  return {
    /** Spotlight a step's control. `step` = { title (HTML), target, fallback, tab, if_missing (HTML) }. */
    async show(step) {
      removePill();
      const my = ++seq;
      dlg.querySelector('.coach-title').innerHTML = step.title;
      dlg.querySelector('.coach-body').textContent = t('This is where it happens in the app. Try it yourself, or go back to the guide.');
      dlg.classList.add('no-anim', 'no-hole', 'pending');
      if (!dlg.open) dlg.showModal();
      addEventListener('resize', schedule);
      document.addEventListener('scroll', schedule, true);
      // the modal coach makes the page inert, but nav:goto + layout still work underneath
      const r = await locate(step, { bus, stale: () => my !== seq || !dlg.open });
      if (!r) return;
      target = r.el;
      const note = dlg.querySelector('.coach-note');
      // if_missing is built (escaped) guide HTML; the generic note is for when nothing at all could be found
      const noteHtml = !r.missing ? '' : step.if_missing
        || (r.el ? '' : esc(t('This part is not on screen right now — it may need Pro mode, a flat in Afford, or the map data to finish loading.')));
      note.hidden = !noteHtml;
      note.innerHTML = noteHtml;
      layout();
      requestAnimationFrame(() => requestAnimationFrame(() => dlg.classList.remove('no-anim')));
      dlg.querySelector('[data-a="back"]').focus({ preventScroll: true });
    },
    /** Only the "↩ Back to the guide" button (e.g. after sending the user to Afford for a price). */
    pill: showPill,
    dismiss() { removePill(); stop(); },
  };
}
