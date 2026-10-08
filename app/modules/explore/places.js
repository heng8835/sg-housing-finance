// My choices → Daily places: what kind of place each one is (Phase 7b B12). A place tagged "Parents' or child's home"
// lets the app decide the Proximity Housing Grant "near" per flat: it is mirrored into the store as
// household.parentsPlace = { lat, lon, name } (core/parents.js), which money.js (Compare), the brief and Afford read;
// engine/grants.js phgNear() compares each flat's straight-line distance with the policy distance.
// The daily places themselves stay where they were (legacy S.workplaces in localStorage 'hdb-comparer'); this file adds
// the "This place is" select to #workForm, the kind line on each place card and the PHG hint. legacy.js hooks:
// createPlaces(...) once; the submit handler stores kind(); renderWork() uses small(w) and calls sync().
// Privacy: places never leave the browser (no URL, no network) — same as before.
import { t } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';
import { parentsKm, parentsPlaceOf } from '../../core/parents.js';

/** Kinds (value, label) — the first is the default. */
export const PLACE_KINDS = [['work', 'Work or study'], ['parents', "Parents' or child's home"], ['care', 'Childcare or school'], ['other', 'Other']];
const KIND_SHORT = { work: 'Work or study', parents: "Parents' home", care: 'Childcare or school', other: 'Other' };
export const KIND_IDS = PLACE_KINDS.map(([v]) => v);

/** The first place tagged as the parents' home → the store shape { lat, lon, name }, else null. */
export function parentsPlace(places) {
  const p = (places || []).find((w) => w && w.kind === 'parents' && Number.isFinite(w.lat) && Number.isFinite(w.lon));
  return p ? { lat: p.lat, lon: p.lon, name: String(p.name || '') } : null;
}

const kmText = (km) => (km < 1 ? t('{0} m', [Math.round(km * 1000)]) : t('{0} km', [km.toFixed(1)]));

/**
 * Small line under a place card: "Parents' home · 1.9 km from the flat in Afford" (that distance only for the parents'
 * home and when the Afford flat has a block); other kinds "Work or study · <address>"; places saved before 7b = address.
 * @param {object} w daily place; @param {{lat:number, lon:number}|null} focusAt block of the Afford flat
 */
export function placeSmall(w, focusAt = null) {
  if (!w.kind || !KIND_SHORT[w.kind]) return esc(w.label || '');
  const kind = t(KIND_SHORT[w.kind]);
  if (w.kind === 'parents' && focusAt) {
    const km = parentsKm({ parentsPlace: w }, focusAt);
    if (km != null) return `${kind} · ${t('{0} from the flat in Afford', [kmText(km)])}`;
  }
  return `${kind} · ${esc(w.label || '')}`;
}

/** The select added to the Daily places form (after the Name field). */
export const kindSelectHtml = () => `<label class="f"><span>${t('This place is')}</span><select id="wKind">${PLACE_KINDS.map(([v, l], i) => `<option value="${v}"${i ? '' : ' selected'}>${t(l)}</option>`).join('')}</select></label>`;
export const PHG_HINT = "Tag your parents' home to check the Proximity Housing Grant per flat.";

/**
 * @param {{ store:object, places:()=>object[], focusAt?:()=>({lat:number,lon:number}|null), doc?:Document }} x
 *   places = legacy S.workplaces; focusAt = block of the Afford focus flat (for the card line)
 * → { kind(), small(w), sync() }
 */
export function createPlaces({ store, places, focusAt = () => null, doc = globalThis.document }) {
  const form = doc && doc.getElementById('workForm');
  let sel = null, hint = null;
  if (form) {
    const fields = form.querySelector('.fields'), name = fields && fields.querySelector('label');
    if (name) { name.insertAdjacentHTML('afterend', kindSelectHtml()); sel = form.querySelector('#wKind'); }
    form.insertAdjacentHTML('afterend', `<p class="hint" id="wPhgHint" hidden>${t(PHG_HINT)}</p>`);
    hint = doc.getElementById('wPhgHint');
  }
  /** Mirror the tagged place into the store (only when it changed, so the household subscribers are not woken for nothing). */
  function sync() {
    const next = parentsPlace(places()), cur = parentsPlaceOf(store.get('household'));
    if (hint) hint.hidden = !!next;
    if (JSON.stringify(next) !== JSON.stringify(cur ? { lat: cur.lat, lon: cur.lon, name: String(cur.name || '') } : null)) store.set('household.parentsPlace', next);
  }
  // "Start over" / import may replace the household: put the tag back from the daily places
  store.subscribe('household', () => { if (!!parentsPlace(places()) !== !!parentsPlaceOf(store.get('household'))) sync(); });
  return { kind: () => (sel && KIND_IDS.includes(sel.value) ? sel.value : 'work'), small: (w) => placeSmall(w, focusAt()), sync };
}
