// Flat type + storey range for DISPLAY (autorun S1a): HDB's data codes ('4 ROOM', 'MULTI-GENERATION', '31 TO 33') shown
// in sentence case everywhere a user reads them — map chips, area result, selects, compare, brief, block card.
// Display only: stored values, data keys, select values and share links keep the HDB codes.
//
//   flatTypeLabel('4 ROOM')            → '4-room'            (中文 4房式)
//   flatTypeLabel('MULTI-GENERATION')  → 'Multi-generation'  (中文 多代同堂式组屋)
//   flatTypeLabel('EXECUTIVE')         → 'Executive'         (中文 公寓式组屋)
//   flatTypeShort('EXECUTIVE')         → 'Exec.'             (tight tiles / tables)
//   storeyLabel('31 TO 33')            → 'storey 31–33'      (中文 楼层 31–33)
//   storeyRange('01 TO 03')            → '1–3'               (where the row / column already says "Storey")
import { t } from './i18n.js';

const ROOM = /^(\d) ROOM$/;
const STOREY = /^(\d+) TO (\d+)$/;
const NAMES = { EXECUTIVE: 'Executive', 'MULTI-GENERATION': 'Multi-generation' };
const SHORT = { EXECUTIVE: 'Exec.', 'MULTI-GENERATION': 'Multi-gen' };

/** English display name (untranslated): '4-room', 'Executive', 'Multi-generation'; unknown codes unchanged. */
export function flatTypeEnglish(code) {
  const s = String(code ?? '');
  const m = ROOM.exec(s);
  return m ? `${m[1]}-room` : NAMES[s] || s;
}
/** Flat type for display (translated). */
export const flatTypeLabel = (code) => t(flatTypeEnglish(code));
/** Short flat type for tight tiles: '4-room', 'Exec.', 'Multi-gen' (translated). */
export const flatTypeShort = (code) => t(SHORT[code] || flatTypeEnglish(code));
/** '31 TO 33' → '31–33', '01 TO 03' → '1–3'; anything else unchanged. */
export function storeyRange(code) {
  const m = STOREY.exec(String(code ?? ''));
  return m ? `${+m[1]}–${+m[2]}` : String(code ?? '');
}
/** '31 TO 33' → 'storey 31–33' (translated); anything else unchanged. */
export function storeyLabel(code) {
  const m = STOREY.exec(String(code ?? ''));
  return m ? t('storey {0}–{1}', [+m[1], +m[2]]) : String(code ?? '');
}
/** English keys this helper looks up (i18n completeness test). */
export const FLATTYPE_STRINGS = ['1-room', '2-room', '3-room', '4-room', '5-room', 'Executive', 'Multi-generation', 'Exec.', 'Multi-gen',
  'storey {0}–{1}'];
