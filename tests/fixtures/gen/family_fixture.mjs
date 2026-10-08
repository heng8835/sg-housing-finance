// Builds the Phase 7 B2 compare fixtures ("For the family" section): compare-phase7a(.txt|-fv|-nobto) with
//   - the section "FOR THE FAMILY" inserted right before "LOCATION & CONVENIENCE" (after Commute), rendered by
//     app/modules/explore/familyrows.js (the same code the app runs; data/family.js + flood.js + poi.js + policy P1 bands;
//     the private build: floodData on — data/flood.js is not in the public export, so these fixtures build only here);
//   - "Primary schools within 1 km" re-rendered there (same best-in-row value — asserted), "Primary schools within 2 km"
//     and "Nearest primary school" merged into it (dropped), "Childcare within 500 m" replaced (ECDA list loaded),
//     "Nearest MRT" moved verbatim into the section;
//   - the header "best in X of N" re-scored: the dropped rows' measures leave N and their winners lose one.
// Nothing else is touched (tests/explore/familyrows.test.js checks every other line equals the 7a fixture).
// Usage: node tests/fixtures/gen/family_fixture.mjs [in=<dir with compare-phase7a*.txt>] [out=<dir>]   (default tests/fixtures)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join } from 'node:path';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url)); // repo root (tests/fixtures/gen/ → ../../../)
const imp = (p) => import(pathToFileURL(ROOT + p).href);
const { createFamilyRows, SECTION, BEFORE_SECTION, ROW_KEYS, MERGED_SCHOOL_ROWS, OLD_CHILDCARE } = await imp('app/modules/explore/familyrows.js');
const { createPolicy } = await imp('app/core/policy.js');
const { familyData } = await imp('app/modules/explore/family.js');

export const AS_OF = new Date(2026, 9, 7);
export const JOBS = [['compare-phase7a.txt', 'compare-phase7a-family.txt'], ['compare-phase7a-fv.txt', 'compare-phase7a-family-fv.txt'], ['compare-phase7a-nobto.txt', 'compare-phase7a-family-nobto.txt']];

const g = {}; vm.createContext(g); g.window = g;
for (const f of ['data.js', 'poi.js', 'family.js', 'flood.js']) if (f !== 'flood.js' || existsSync(ROOT + 'app/data/' + f)) vm.runInContext(readFileSync(ROOT + 'app/data/' + f, 'utf8'), g);
const D = g.HDB_DATA, POI = g.HDB_POI || { schools: [] }, FAM = familyData(g.HDB_FAMILY || null, g.HDB_FLOOD || null, true);
const policy = createPolicy(JSON.parse(readFileSync(ROOT + 'app/policy/sg-policy.json', 'utf8')), AS_OF);
const seed = JSON.parse(readFileSync(ROOT + 'tests/fixtures/compare-seed.json', 'utf8')).state;
const strip = (h) => h.replace(/<small>/g, '\n').replace(/<\/small>/g, '\n').replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').split('\n').map((s) => s.trim()).filter(Boolean).join(' ');

// ---- legacy.js replicas: the P1 school list (primary first, then mixed-level with a primary section), haversine,
// within / nearest (metres) — used for the rows being removed and to check the moved measure is unchanged
const primarySchools = POI.schools.filter((s) => s.lvl === 'PRIMARY');
const primaryLikeL = (s) => /^PRIMARY|MIXED LEVEL \(P/.test(s.lvl);
POI.schools.forEach((s) => { if (primaryLikeL(s) && s.lvl !== 'PRIMARY' && !primarySchools.includes(s)) primarySchools.push(s); });
const CC = POI.childcare || [];
const haversine = (la1, lo1, la2, lo2) => { const R = 6371000, r = Math.PI / 180, dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r; const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)); };
const within = (b, pts, r) => pts.filter((p) => haversine(b.lat, b.lon, p.lat, p.lon) <= r);
const nearestL = (b, pts) => { let best = null, bd = Infinity; for (const p of pts) { const d = haversine(b.lat, b.lon, p.lat, p.lon); if (d < bd) { bd = d; best = p; } } return best ? { p: best, d: bd } : null; };

export const ms = seed.choices.map((c) => ({ c, b: D.blocks[c.bid] }));
export const family = createFamilyRows({ policy, fam: FAM, schools: () => primarySchools, flood: true });
const ecda = !!(FAM && Array.isArray(FAM.childcare) && FAM.childcare.length);
/** Old rows that leave (dump label → best-in-row value per flat, best). */
const OLD = {
  [`${MERGED_SCHOOL_ROWS[0]}i`]: { v: (m) => within(m.b, primarySchools, 2000).length, best: 'max' },
  [MERGED_SCHOOL_ROWS[1]]: { v: (m) => { const n = nearestL(m.b, primarySchools); return n ? n.d : null; }, best: 'min' },
  ...(ecda ? { [`${OLD_CHILDCARE}i`]: { v: (m) => within(m.b, CC, 500).length, best: 'max' } } : {}),
};

/** legacy renderCompare best-in-row rule → set of winning column indexes. */
function winners(vals, best) {
  const valid = vals.map((v, i) => [v, i]).filter(([v]) => v != null && !isNaN(v));
  if (valid.length < 2) return new Set();
  const bv = best === 'min' ? Math.min(...valid.map(([v]) => v)) : Math.max(...valid.map(([v]) => v));
  const w = new Set(valid.filter(([v]) => v === bv).map(([, i]) => i));
  return w.size === valid.length ? new Set() : w;
}
const key = (l) => l.split(' | ')[0];
const lineOf = (r) => (r.sec ? `${r.sec.toUpperCase()} |` : `${r.lbl ?? r.k}${r.tip ? 'i' : ''} | ` + ms.map((m) => strip(r.f(m))).join(' | '));

export function build(text) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n', L = text.split(nl);
  const find = (k) => { const i = L.findIndex((l) => key(l) === k); if (i < 0) throw new Error('no row ' + k); return i; };
  // the moved school row keeps its measure: same count within the first band as legacy's ps1 (and as the old cell)
  const oldSchool = L[find(`${ROW_KEYS.schools}i`)].split(' | ').slice(1).map((c) => parseInt(c, 10));
  const fresh = family.rows();
  const schoolRow = fresh.find((r) => r.k === ROW_KEYS.schools);
  ms.forEach((m, j) => {
    const legacy = within(m.b, primarySchools, 1000).length;
    if (schoolRow.v(m) !== legacy || legacy !== oldSchool[j]) throw new Error(`school count differs for ${m.c.name}: ${schoolRow.v(m)} / ${legacy} / ${oldSchool[j]}`);
  });
  // header: the removed measures leave
  const delta = ms.map(() => 0);
  for (const [k, o] of Object.entries(OLD)) { find(k); winners(ms.map(o.v), o.best).forEach((i) => { delta[i] -= 1; }); }
  const dn = -Object.keys(OLD).length;
  const hi = L.findIndex((l) => l.startsWith(' | 1. '));
  L[hi] = L[hi].split(' | ').map((c, j) => (j === 0 ? c : c.replace(/best in (\d+) of (\d+) measures/, (m0, w, n) => `best in ${+w + delta[j - 1]} of ${+n + dn} measures`))).join(' | ');
  // rows out (MRT kept as text — moved verbatim), section in before Location & convenience
  const mrtLine = L[find(`${ROW_KEYS.mrt}i`)];
  for (const k of [`${ROW_KEYS.schools}i`, ...Object.keys(OLD), `${ROW_KEYS.mrt}i`]) L.splice(find(k), 1);
  const lines = family.rows({ k: ROW_KEYS.mrt, mrt: true }).map((r) => (r.mrt ? mrtLine : lineOf(r)));
  const at = L.findIndex((l) => l === `${BEFORE_SECTION.toUpperCase()} |`);
  if (at < 0) throw new Error('no Location section');
  if (lines[0] !== `${SECTION.toUpperCase()} |`) throw new Error('section header');
  L.splice(at, 0, ...lines);
  return L.join(nl);
}

if (/family_fixture\.mjs$/.test(process.argv[1] || '')) { // run as a script (not imported by a test)
  const arg = (k) => (process.argv.find((x) => x.startsWith(k + '=')) || '').slice(k.length + 1) || null;
  const IN = arg('in') || join(ROOT, 'tests/fixtures'), OUT = arg('out') || join(ROOT, 'tests/fixtures');
  for (const [src, dst] of JOBS) { writeFileSync(join(OUT, dst), build(readFileSync(join(IN, src), 'utf8'))); console.log('wrote', dst); }
}
