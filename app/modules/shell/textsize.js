// Text size switch (Phase 7 B10, DEC-016 Q5): "A A A" in the header next to EN / 中文 (tablet and desktop). On phones
// the header shows the household chip, Aa and Menu instead (phone overhaul §2.2): the same switch opens from Aa and
// sits in the Menu sheet (shell/menu.js). All write ui.textSize; the classes on <html> come from core/textsize.js
// bindTextSize (main.js). Never changes the size without a tap.
import { textSizeOf, textSizeSwitch } from '../../core/textsize.js';

/** A bound switch element (not placed): taps write ui.textSize, the pressed state follows the store. */
export function textSizeEl({ store, cls = '' }) {
  const current = () => textSizeOf(store.get('ui.textSize'));
  const host = document.createElement('div');
  host.innerHTML = textSizeSwitch(current(), { cls });
  const seg = host.firstElementChild;
  seg.addEventListener('click', (e) => { const b = e.target.closest('button[data-ts]'); if (b) store.set('ui.textSize', b.dataset.ts); });
  store.subscribe('ui', () => seg.querySelectorAll('button[data-ts]').forEach((b) => {
    const on = b.dataset.ts === current();
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  }));
  return seg;
}

export function mountTextSize({ store }) {
  const seg = textSizeEl({ store, cls: 'ts-header' });
  document.querySelector('.lang-switch')?.before(seg) ?? document.querySelector('header .spacer')?.after(seg);
  return seg;
}
