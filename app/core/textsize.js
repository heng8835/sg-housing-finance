// Text size (Phase 7 B10, DEC-016 Q5): Normal / Large / Larger, stored in sghf:v2 ui.textSize and applied as classes
// on <html> — styles/textsize.css sets --fs-base (14 → 16 → 18 px; every app font size is in rem) and raises tap
// targets to ≥ 44 px in Large and Larger. Offered (header switch, Learn sheet on phones, "You're set" in Start here),
// never switched on without a tap. Pure helpers + one browser binding; modules read and write the store only.
import { t } from './i18n.js';
import { esc } from './dom.js';

export const TEXT_SIZES = ['normal', 'large', 'larger'];
export const DEFAULT_TEXT_SIZE = 'normal';
/** Accessible names (the buttons show "A" in three sizes). */
export const TEXT_SIZE_LABELS = { normal: 'Normal text', large: 'Large text', larger: 'Larger text' };
/** Short words, for "Bigger text?" on the You're set screen. */
export const TEXT_SIZE_WORDS = { normal: 'Normal', large: 'Large', larger: 'Larger' };

/** Anything unknown (old saves, hand-edited storage) reads as Normal. */
export const textSizeOf = (v) => (TEXT_SIZES.includes(v) ? v : DEFAULT_TEXT_SIZE);

/** Root classes for a size: ts-large / ts-larger, plus ts-big for both (the ≥ 44 px tap-target rules). */
export function textSizeClasses(size) {
  const s = textSizeOf(size);
  return { 'ts-large': s === 'large', 'ts-larger': s === 'larger', 'ts-big': s !== 'normal' };
}

/** Put the classes on an element (default <html>); returns the size applied. */
export function applyTextSize(size, root = globalThis.document?.documentElement) {
  const s = textSizeOf(size);
  if (!root) return s;
  for (const [cls, on] of Object.entries(textSizeClasses(s))) root.classList.toggle(cls, on);
  root.dataset.textSize = s;
  return s;
}

/** Apply now and on every change of ui.textSize (main.js, right after the store exists). Returns the unsubscribe. */
export function bindTextSize(store, root = globalThis.document?.documentElement) {
  let last = applyTextSize(store.get('ui.textSize'), root);
  return store.subscribe('ui', () => {
    const s = textSizeOf(store.get('ui.textSize'));
    if (s !== last) last = applyTextSize(s, root);
  });
}

/**
 * The switch: three "A" buttons in growing sizes, aria-pressed, one group label. Native buttons, so Tab / Enter /
 * Space work; data-ts carries the size. cls = extra class on the group (header / learn placement).
 */
export function textSizeSwitch(current, { cls = '' } = {}) {
  const s = textSizeOf(current);
  const btn = (v, i) => `<button type="button" data-ts="${v}" aria-pressed="${v === s}" class="ts-${i}${v === s ? ' on' : ''}" title="${esc(t(TEXT_SIZE_LABELS[v]))}" aria-label="${esc(t(TEXT_SIZE_LABELS[v]))}"><span aria-hidden="true">A</span></button>`;
  return `<div class="seg ts-switch${cls ? ' ' + cls : ''}" role="group" aria-label="${esc(t('Text size'))}">${TEXT_SIZES.map(btn).join('')}</div>`;
}

/** Every English string this module shows (zh coverage test). */
export const uiStrings = () => [...Object.values(TEXT_SIZE_LABELS), ...Object.values(TEXT_SIZE_WORDS), 'Text size'];
