// Quick-fill popover (H4): the missing household inputs right where a card needs them. One store write
// (household) on Save; everything stays in this browser. bindNeeds() wires the prompts from core/missing.js:
// "Fill in here" → this popover, "Set in household →" → bus 'household:open' { field } (drawer focuses it).
import { describe } from './missing.js';
import { esc } from './dom.js';
import { t } from './i18n.js';

const PHONE = '(max-width: 767px)';
const EDGE = 12, GAP = 6, MIN_BELOW = 220, WIDTH = 280;
let open = null; // the one open popover: { el, close }

/** Household with `values` ({ 'buyers.0.income': 5000, cash: 20000 }) set — a new object, input untouched. */
export function mergeValues(household, values) {
  const h = JSON.parse(JSON.stringify(household || {}));
  for (const [path, v] of Object.entries(values)) {
    const keys = path.split('.');
    let o = h;
    for (let i = 0; i < keys.length - 1; i++) { const k = keys[i]; if (o[k] == null) o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {}; o = o[k]; }
    o[keys.at(-1)] = v;
  }
  return h;
}

/** Popover position under the anchor (above when there is too little room below), kept 12 px from the edges. */
export function placeQuickFill(r, w, h, vw, vh) {
  const left = Math.max(EDGE, Math.min(r.left, vw - w - EDGE));
  const below = vh - r.bottom - GAP;
  const top = below < MIN_BELOW && r.top - GAP - h >= EDGE ? r.top - GAP - h : Math.min(r.bottom + GAP, Math.max(EDGE, vh - h - EDGE));
  return { left, top };
}

/**
 * Open the popover for `fields` (paths or describe() objects) next to `anchor`.
 * @param {{ anchor:HTMLElement, fields:(string|object)[], store:object, onClose?:(saved:boolean)=>void }} x
 */
export function openQuickFill({ anchor, fields, store, onClose = () => {} }) {
  if (open) open.close(false);
  const list = fields.map((f) => (typeof f === 'string' ? describe(f) : f)).filter(Boolean);
  if (!list.length) return;
  const el = document.createElement('div');
  el.className = 'qf'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', 'qfT'); el.setAttribute('aria-modal', 'false');
  el.innerHTML = `<form class="qf-form" novalidate><h4 id="qfT">${t('Add the missing details')}</h4>
    <div class="fields">${list.map((f, i) => `<label class="f wide"><span>${esc(f.label)}</span><input type="number" inputmode="numeric" name="qf${i}" data-qf="${esc(f.path)}" ${f.attrs || ''}></label>`).join('')}</div>
    <div class="actions"><button type="submit" class="btn sm primary">${t('Save')}</button><button type="button" class="btn sm" data-qf-cancel>${t('Cancel')}</button></div>
    <p class="qf-foot">${t('Stays in this browser.')}</p></form>`;
  document.body.append(el);
  const phone = typeof matchMedia === 'function' && matchMedia(PHONE).matches;
  if (!phone) {
    const p = placeQuickFill(anchor.getBoundingClientRect(), WIDTH, el.offsetHeight, innerWidth, innerHeight);
    el.style.left = `${p.left}px`; el.style.top = `${p.top}px`;
  }

  const away = (e) => { if (!el.contains(e.target) && e.target !== anchor) close(false); };
  function close(saved) {
    if (!open || open.el !== el) return;
    open = null;
    el.remove();
    document.removeEventListener('pointerdown', away, true);
    onClose(saved);
  }
  el.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = {};
    el.querySelectorAll('[data-qf]').forEach((i) => { if (i.value !== '' && Number.isFinite(+i.value)) values[i.dataset.qf] = +i.value; });
    if (Object.keys(values).length) store.set('household', mergeValues(store.get('household'), values));
    close(Object.keys(values).length > 0);
  });
  el.addEventListener('click', (e) => { if (e.target.closest('[data-qf-cancel]')) close(false); });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); return; }
    if (e.key !== 'Tab') return;
    const f = [...el.querySelectorAll('input, button')];
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1).focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  });
  setTimeout(() => document.addEventListener('pointerdown', away, true), 0);
  open = { el, close };
  el.querySelector('input')?.focus();
}

/**
 * Wire the need prompts inside `root` (delegated, survives re-renders). After a quick-fill the tab has
 * re-rendered: focus goes to the prompt with the same data-need-key, else its section heading.
 */
export function bindNeeds(root, { store, bus }) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-need]');
    if (!b || !root.contains(b)) return;
    const box = b.closest('.need');
    if (b.dataset.need === 'open') { bus.emit('household:open', { field: b.dataset.field }); return; }
    const key = box?.dataset.needKey, sectionId = box?.closest('.section')?.id;
    openQuickFill({
      anchor: b, store, fields: (box?.dataset.fields || '').split(',').filter(Boolean),
      onClose: () => {
        const again = key && root.querySelector(`[data-need-key="${CSS.escape(key)}"] button`);
        if (again) { again.focus(); return; }
        const head = sectionId && root.querySelector(`#${CSS.escape(sectionId)} h3`);
        if (head) { head.setAttribute('tabindex', '-1'); head.focus(); }
      },
    });
  });
}
