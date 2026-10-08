// Phone layout helper: the side panel becomes a bottom sheet with a handle that cycles
// peek → half → full (CSS in styles/modules.css, active below 768 px).
// bus 'sheet:size' ('peek' | 'half' | 'full', or { size }) sets the sheet height (used by the guided tour).

import { t } from '../../core/i18n.js';

const SIZES = ['peek', 'half', 'full'];
const LABEL = { peek: 'Expand panel', half: 'Expand panel to full screen', full: 'Shrink panel' };

export function mountMobileSheet({ bus } = {}) {
  const panel = document.getElementById('panel');
  if (!panel) return;
  const handle = document.createElement('button');
  handle.type = 'button'; handle.className = 'sheet-handle';
  panel.prepend(handle);
  const set = (size) => { panel.dataset.size = size; handle.setAttribute('aria-label', t(LABEL[size])); };
  handle.addEventListener('click', () => set(SIZES[(SIZES.indexOf(panel.dataset.size) + 1) % SIZES.length]));
  // tapping a tab while peeking opens the sheet to half height
  panel.querySelector('.tabs')?.addEventListener('click', () => { if (panel.dataset.size === 'peek') set('half'); });
  bus?.on('sheet:size', (d) => { const size = typeof d === 'string' ? d : d?.size; if (SIZES.includes(size)) set(size); });
  set('half');
}
