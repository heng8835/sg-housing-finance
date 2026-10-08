// Plan tab — primary schools by MOE's P1 distance bands (within 1 km, 1–2 km) around the focus block,
// with rings drawn on the map (bus 'explore:rings', handled by the explore module).
import { data } from '../../core/data.js';
import { primaryLike, schoolBands } from '../../core/schools.js'; // shared with the Compare "For the family" rows
import { esc } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { badge } from './ui.js';

const ACRONYMS = new Set(['CHIJ', 'ACS', 'SJI', 'MGS', 'SJC']);
const titleCase = (s) => String(s).toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a, c) => a + c.toUpperCase())
  .replace(/\b[A-Za-z]+\b/g, (w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w));
const metres = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

/** The focus block's position and the P1 bands, or null when there is no block to measure from. */
export function ringsFor(f, policy) {
  const b = f && f.bid != null ? data.block(f.bid) : null;
  return b ? { lat: b.lat, lon: b.lon, radiiKm: policy.get('p1.distance.bands_km'), label: f.label || '' } : null;
}

/** @param {{ f:object|null, policy:object, ringsOn:boolean }} ctx */
export function schoolsSection({ f, policy, ringsOn }) {
  const head = `<div class="section" id="planSchools"><h3>${t('Primary schools nearby (P1 priority)')}</h3>`;
  const r = ringsFor(f, policy);
  if (!r) return `${head}<p class="hint">${data.hdb ? t('Pick a block on the map (Afford this →) to list the primary schools around it.') : t('Loading map data…')}</p>${data.hdb ? `<div class="actions"><button type="button" class="link" data-act="pick-map">${t('Pick on the map →')}</button></div>` : ''}</div>`;
  const [near, far] = r.radiiKm;
  const schools = (data.poi?.schools || []).filter(primaryLike);
  const { near: inNear, second: inFar } = schoolBands(schools, r, r.radiiKm);
  const list = (rows) => (rows.length ? `<ul class="dates">${rows.map((x) => `<li><b>${esc(titleCase(x.item.n))}</b> · ${metres(x.km)}</li>`).join('')}</ul>` : `<p class="hint">${t('None')}</p>`);
  const meta = policy.meta('p1.distance.bands_km');
  return `${head}
    <p class="hint">${t('Around {0}. Straight-line distance from the block — MOE measures home–school distance its own way, so check schools near a band edge with MOE.', [esc(r.label || t('this flat'))])}${badge(meta.status)}</p>
    <div class="actions"><button type="button" class="btn sm" data-act="rings">${ringsOn ? t('Hide the rings') : t('Show {0} km / {1} km rings on the map', [near, far])}</button></div>
    <h4 class="sub">${t('Within {0} km', [near])} (${inNear.length})</h4>${list(inNear)}
    <h4 class="sub">${t('Between {0} and {1} km', [near, far])} (${inFar.length})</h4>${list(inFar)}
    <p class="hint"><a href="${esc(meta.source_url)}" target="_blank" rel="noopener">${t('How distance affects P1 priority (MOE)')} ↗</a></p>
  </div>`;
}
