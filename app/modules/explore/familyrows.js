// Compare / Brief section "For the family" (Phase 7 B2, spec phase7-user-feedback §4.4): P1 schools by band with
// metres, childcare with places this month (ECDA), nearest polyclinic + CHAS clinics, flood-prone point nearby (PUB),
// the MRT walk, and a sources line. Facts come from the same data as the map layers (./family.js, window.HDB_FAMILY)
// and the P1 band rule shared with Plan (core/schools.js, policy p1.distance.bands_km).
// legacy.js hooks: createFamilyRows(...) once; ROWS() → insert(rows), which also MOVES / REPLACES older rows:
//   'Primary schools within 1 km' (Location)   → re-rendered here, same key, same best-in-row measure (count ≤ 1st band)
//   'Primary schools within 2 km', 'Nearest primary school' (Location) → merged into it (dropped)
//   'Childcare within 500 m' (Environment)     → replaced by 'Childcare with places now' while the ECDA list is loaded
//   'Nearest MRT' (Location)                    → moved, unchanged, as the section's "MRT walk" row
// Best in row: only the school count (unchanged). Vacancies (a monthly snapshot), clinic distance and flood points are
// facts, not scores — no `v`, so they never count toward "best in X of N" (flood: "no" is not presented as better).
// floodData off (public build, PUB's terms): the flood row stays but says "Not in this version" and names PUB's own
// list as plain text — no link (PUB's terms: links to pub.gov.sg need PUB's written permission); the sources line drops
// the PUB part. `fam` comes from family.js familyData() (family.js + flood.js merged).
import { schoolBands, p1Band } from '../../core/schools.js';
import { withinKm, nearest } from '../../core/geo.js';
import { esc } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { centreStatus, nearestFlood, sourcesFor, floodOn, FLOOD_NEAR_M, CHAS_AS_OF } from './family.js';

/** Section + row lookup keys (English, stable — SIMPLE_KEYS, ROW_TERMS, the brief); translated at render. */
export const SECTION = 'For the family';
export const BEFORE_SECTION = 'Location & convenience';
export const ROW_KEYS = {
  schools: 'Primary schools within 1 km', childcare: 'Childcare with places now', clinic: 'Nearest polyclinic / CHAS clinics',
  flood: `Flood-prone point within ${FLOOD_NEAR_M} m`, mrt: 'Nearest MRT', sources: 'Family data sources',
};
/** Older rows merged into the school row (always dropped) and the POI childcare row (dropped when ECDA data is loaded). */
export const MERGED_SCHOOL_ROWS = ['Primary schools within 2 km', 'Nearest primary school'];
export const OLD_CHILDCARE = 'Childcare within 500 m';
// UI heuristics — not policy values
export const SCHOOLS_SHOWN = 3;   // nearest schools named in the cell
export const CC_NEAR_M = 500, CC_FAR_M = 1000; // childcare rings
export const CHAS_NEAR_M = 500;   // CHAS GP clinics counted within this

const metres = (m) => (m < 1000 ? t('{0} m', [Math.round(m)]) : t('{0} km', [(m / 1000).toFixed(1)]));
const ring = (m) => (m < 1000 ? t('{0} m', [m]) : t('{0} km', [m / 1000]));
const muted = (s) => `<span class="muted">${s}</span>`;
const noData = (why) => `${muted(t('no data'))}<small>${t(why)}</small>`;
/** "Mee Toh School" → "Mee Toh", "Rivervale Primary School" → "Rivervale" (the row label already says "primary school"). */
export const shortSchool = (n) => String(n || '').replace(/(?<=[A-Za-z)])\s+(?:Primary\s+)?School$/i, '') || String(n || '');
/** A centre with a place this month: "available" or "limited" in at least one level (ECDA). */
export const hasPlace = (c) => { const s = centreStatus(c && c.vac); return s === 'available' || s === 'limited'; };
const layerOk = (fam, k) => !!fam && Array.isArray(fam[k]) && fam[k].length > 0;

/** asOf of a family source layer ('childcare', 'polyclinics', 'clinics', 'flood'), else null. */
export function sourceDate(fam, key) {
  const m = sourcesFor(fam && fam.sources, [key]).main.find((x) => x.s && x.s.asOf);
  if (m) return m.s.asOf;
  if (key === 'flood' && layerOk(fam, 'flood')) return fam.flood[0].asOf || null;
  return null;
}

/**
 * Everything the section shows for one block position (pure). null per part = that data is missing.
 * → { schools, childcare: { total, near, far, nearestOpen }, poly, chas, flood: { near, n } }
 */
export function familyFacts({ fam, schools, at, bandsKm }) {
  const out = { schools: schools && schools.length ? schoolBands(schools, at, bandsKm) : null, childcare: null, poly: null, chas: null, flood: null };
  if (layerOk(fam, 'childcare')) {
    const around = withinKm(fam.childcare, at, CC_FAR_M / 1000), open = around.filter((x) => hasPlace(x.item));
    out.childcare = { total: around.length, near: open.filter((x) => x.km * 1000 <= CC_NEAR_M).length, far: open.length, nearestOpen: nearest(fam.childcare.filter(hasPlace), at) };
  }
  if (layerOk(fam, 'polyclinics')) out.poly = nearest(fam.polyclinics, at);
  if (layerOk(fam, 'clinics')) out.chas = withinKm(fam.clinics, at, CHAS_NEAR_M / 1000).length;
  if (layerOk(fam, 'flood')) out.flood = { near: nearestFlood(fam.flood, at, FLOOD_NEAR_M), n: withinKm(fam.flood, at, FLOOD_NEAR_M / 1000).length };
  return out;
}

/** Cell HTML per row (f = familyFacts(); fam for source dates). */
export const cells = {
  schools(f, bandsKm) {
    if (!f.schools) return muted(t('poi.js missing'));
    const [b0, b1] = bandsKm, { near, second, nearest: nn } = f.schools;
    const band2 = t('{0}–{1} km band', [b0, b1]);
    const shown = near.concat(second).slice(0, SCHOOLS_SHOWN);
    const name = (x) => `${esc(shortSchool(x.item.n))} ${metres(x.km * 1000)}${p1Band(x.km, bandsKm) > 0 ? ` (${band2})` : ''}`;
    const moreNear = near.length - shown.filter((x) => x.km <= b0).length;
    let list = shown.map(name).join(' · ');
    if (moreNear > 0) list += ` · ${t('+{0} more within {1} km', [moreNear, b0])}`;
    if (!shown.length) list = nn ? t('nearest: {0} {1} — outside the P1 bands', [esc(shortSchool(nn.item.n)), metres(nn.km * 1000)]) : '';
    return `${near.length}${list ? `<small>${list}</small>` : ''}<small>${t('{0} within {1}–{2} km', [second.length, b0, b1])}</small>`;
  },
  childcare(f) {
    const c = f.childcare;
    if (!c) return noData('ECDA vacancy list not loaded');
    const head = c.far ? t('{0} within {1} · {2} within {3}', [c.near, ring(CC_NEAR_M), c.far, ring(CC_FAR_M)]) : t('None with a place within {0}', [ring(CC_FAR_M)]);
    const of = c.total ? t(c.total === 1 ? 'of {0} centre within {1}' : 'of {0} centres within {1}', [c.total, ring(CC_FAR_M)]) : t('no centres within {0}', [ring(CC_FAR_M)]);
    const n = c.nearestOpen ? t('nearest with a place: {0} {1}', [esc(c.nearestOpen.item.n), metres(c.nearestOpen.km * 1000)]) : t('no centre reports a place this month');
    return `${head}<small>${of}</small><small>${n}</small>`;
  },
  clinic(f) {
    const chas = f.chas == null ? t('CHAS clinic list not loaded')
      : t(f.chas === 1 ? '{0} CHAS clinic within {1} (list as of {2})' : '{0} CHAS clinics within {1} (list as of {2})', [f.chas, ring(CHAS_NEAR_M), CHAS_AS_OF]);
    if (!f.poly) return `${muted(t('no data'))}<small>${t('MOH polyclinic list not loaded')}</small><small>${chas}</small>`;
    return `${metres(f.poly.km * 1000)}<small>${esc(f.poly.item.n)}</small><small>${chas}</small>`;
  },
  flood(f, asOf, on = true) {
    if (!on) return t("Not in this version — see PUB's list of flood-prone areas (pub.gov.sg)");
    if (!f.flood) return noData('PUB flood-prone list not loaded');
    const src = asOf ? t('PUB list as of {0}', [esc(asOf)]) : t('PUB list');
    const { near, n } = f.flood;
    if (!near) return `${t('No')}<small>${t('none within {0}', [ring(FLOOD_NEAR_M)])} · ${src}</small>`;
    const more = n > 1 ? ` · ${t('{0} points within {1}', [n, ring(FLOOD_NEAR_M)])}` : '';
    return `${t('Yes · {0}', [t('{0} m', [near.m])])}<small>${esc(near.p.n)} · ${src}${more}</small><small>${t('approximate road / junction position — ask the seller about past floods')}</small>`;
  },
};

/** The sources line (same text for every flat): ECDA date, MOH, CHAS list year, PUB date; missing lists say so. */
export function sourcesCell(fam, flood = true) {
  const d = (k) => sourceDate(fam, k);
  const parts = [
    layerOk(fam, 'childcare') ? (d('childcare') ? t('ECDA vacancies as of {0}', [esc(d('childcare'))]) : t('ECDA vacancies')) : t('ECDA vacancies: not loaded'),
    layerOk(fam, 'polyclinics') ? t('MOH polyclinics') : t('MOH polyclinics: not loaded'),
    layerOk(fam, 'clinics') ? t('MOH CHAS clinic list as of {0}', [CHAS_AS_OF]) : t('CHAS clinics: not loaded'),
    !flood ? null : layerOk(fam, 'flood') ? (d('flood') ? t('PUB flood-prone list as of {0}', [esc(d('flood'))]) : t('PUB flood-prone list')) : t('PUB flood-prone list: not loaded'),
    t('straight-line distances'),
  ].filter(Boolean);
  return `<small>${parts.join(' · ')}</small>`;
}

/**
 * @param {{ policy:object, fam?:object|null, schools?:()=>object[], flood?:boolean }} x
 *   fam = family.js familyData() (null when data/family.js is missing); schools = legacy's P1 school list (primary +
 *   mixed); flood = the floodData switch (default: core/features.js)
 * → { rows(mrtRow?), insert(rows), facts(b), terms }
 */
export function createFamilyRows({ policy, fam = null, schools = () => [], flood = floodOn() }) {
  const bandsKm = policy.get('p1.distance.bands_km');
  const memo = new WeakMap(); // per block object (D.blocks[i]) — the data never changes while the page is open
  const facts = (b) => { if (!memo.has(b)) memo.set(b, familyFacts({ fam, schools: schools(), at: { lat: b.lat, lon: b.lon }, bandsKm })); return memo.get(b); };
  const floodAsOf = sourceDate(fam, 'flood');
  const [b0, b1] = bandsKm;
  function rows(mrt = null) {
    return [
      { sec: SECTION },
      { k: ROW_KEYS.schools, simple: true, f: (m) => cells.schools(facts(m.b), bandsKm), v: (m) => { const s = facts(m.b).schools; return s ? s.near.length : null; }, best: 'max',
        tip: t('P1 registration gives priority by home–school distance: within {0} km first, then {0}–{1} km. Straight-line distance from the block — MOE measures its own way, so check schools near a band edge with MOE. Matters most if the children are under 7.', [b0, b1]) },
      { k: ROW_KEYS.childcare, simple: true, f: (m) => cells.childcare(facts(m.b)),
        tip: t('Preschools on the ECDA list with a place in at least one level this month ("available" or "limited", as reported to ECDA); the others are full or did not report. Vacancies change every month — call the centre.') },
      { k: ROW_KEYS.clinic, simple: true, f: (m) => cells.clinic(facts(m.b)),
        tip: t('Nearest polyclinic (subsidised government primary care) and the CHAS GP clinics within {0} m of the block. The MOH CHAS list is a {1} extract — check with the clinic.', [CHAS_NEAR_M, CHAS_AS_OF]) },
      { k: ROW_KEYS.flood, lbl: t('Flood-prone point within {0} m', [FLOOD_NEAR_M]), simple: true, f: (m) => cells.flood(facts(m.b), floodAsOf, flood),
        tip: flood ? t('PUB list of flood-prone areas, placed at an approximate road or junction position — not the extent of flooding, and not a judgement on the flat. Ask the seller or neighbours about past floods.')
          : t("PUB's list of flood-prone areas is not included in this version. Check the streets near the flat on PUB's list, and ask the seller or neighbours about past floods.") },
      ...(mrt ? [mrt] : []),
      { k: ROW_KEYS.sources, lbl: t('Sources'), simple: true, f: () => sourcesCell(fam, flood) },
    ];
  }
  /** Section before "Location & convenience" (after Commute); older school / childcare rows merged, MRT row moved in. */
  function insert(r) {
    const take = (k) => { const i = r.findIndex((x) => x.k === k); return i < 0 ? null : r.splice(i, 1)[0]; };
    take(ROW_KEYS.schools); MERGED_SCHOOL_ROWS.forEach(take);
    if (layerOk(fam, 'childcare')) take(OLD_CHILDCARE); // without ECDA vacancies the POI childcare row stays
    const mrt = take(ROW_KEYS.mrt);
    const at = r.findIndex((x) => x.sec === BEFORE_SECTION);
    r.splice(at < 0 ? r.length : at, 0, ...rows(mrt));
    return r;
  }
  return { rows, insert, facts, terms: {} };
}
