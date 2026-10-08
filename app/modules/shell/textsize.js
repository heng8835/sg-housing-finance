// Text size switch (Phase 7 B10, DEC-016 Q5): "A A A" in the header next to EN / 中文 (tablet and desktop); on phones
// the header is full, so the same switch sits at the top of the Learn sheet (📘). Both write ui.textSize; the classes
// on <html> come from core/textsize.js bindTextSize (main.js). Never changes the size without a tap.
import { textSizeOf, textSizeSwitch } from '../../core/textsize.js';

export function mountTextSize({ store, bus = null }) {
  const current = () => textSizeOf(store.get('ui.textSize'));
  const host = document.createElement('div');
  host.className = 'ts-host';
  host.innerHTML = textSizeSwitch(current(), { cls: 'ts-header' });
  const seg = host.firstElementChild;
  document.querySelector('.lang-switch')?.before(seg) ?? document.querySelector('header .spacer')?.after(seg);

  const sync = (root) => root.querySelectorAll('button[data-ts]').forEach((b) => {
    const on = b.dataset.ts === current();
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  });
  const onClick = (e) => { const b = e.target.closest('button[data-ts]'); if (b) store.set('ui.textSize', b.dataset.ts); };
  seg.addEventListener('click', onClick);

  // phones: a "Text size" row under the Learn index heading (CSS shows it below 768 px only)
  let learnRow = null;
  bus?.on('learn:painted', ({ root, id } = {}) => {
    if (!root || id || root.querySelector('.ts-learn')) return;
    const anchor = root.querySelector('.drawer-head'); if (!anchor) return;
    learnRow = document.createElement('div');
    learnRow.className = 'ts-learn';
    learnRow.innerHTML = `<span class="f-label" id="tsLearnLbl"></span>${textSizeSwitch(current())}`;
    learnRow.querySelector('#tsLearnLbl').textContent = seg.getAttribute('aria-label');
    learnRow.querySelector('.ts-switch').setAttribute('aria-labelledby', 'tsLearnLbl');
    learnRow.addEventListener('click', onClick);
    anchor.after(learnRow);
  });

  store.subscribe('ui', () => { sync(seg); if (learnRow?.isConnected) sync(learnRow); });
  return seg;
}
