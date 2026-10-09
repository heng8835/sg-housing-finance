// Flat-type presets (Phase 7c C11): two one-tap chips above the flat-type chips — "2–3 room" and "4 room +" — that set
// the flat-type filter to that group (a second tap on the active preset is a no-op; the single chips still fine-tune).
// Pure apart from t(); legacy.js renders them into #ftChips and applies the indexes. Same markup on phone and desktop.
import { t } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';

/** Preset id → the data.js flat-type names it selects (names not in the data are skipped). */
export const FT_PRESETS = [
  { id: 'small', label: '2–3 room', types: ['2 ROOM', '3 ROOM'] },
  { id: 'large', label: '4 room +', types: ['4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'] },
];

/** Indexes into flatTypes (data.js `flat_types`) for a preset id; [] when unknown or none in the data. */
export function presetIdx(flatTypes, id) {
  const p = FT_PRESETS.find((x) => x.id === id);
  if (!p || !Array.isArray(flatTypes)) return [];
  return flatTypes.map((f, i) => (p.types.includes(String(f).toUpperCase()) ? i : -1)).filter((i) => i >= 0);
}

/** Is exactly this preset selected (same set of indexes)? */
export function presetOn(flatTypes, selected, id) {
  const want = presetIdx(flatTypes, id), have = new Set(selected || []);
  return want.length > 0 && want.length === have.size && want.every((i) => have.has(i));
}

/** Chips markup (a group before the single flat-type chips). */
export function presetChips(flatTypes, selected) {
  const chips = FT_PRESETS.filter((p) => presetIdx(flatTypes, p.id).length).map((p) => {
    const on = presetOn(flatTypes, selected, p.id);
    return `<button type="button" class="chip ft-preset${on ? ' on' : ''}" data-ft-preset="${p.id}" aria-pressed="${on}">${esc(t(p.label))}</button>`;
  }).join('');
  return chips ? `<span class="ft-presets" role="group" aria-label="${esc(t('Quick pick'))}">${chips}</span>` : '';
}
