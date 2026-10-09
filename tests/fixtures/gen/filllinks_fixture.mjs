// Builds the fill-links compare fixtures: compare-phase7b(.txt|-fv|-nobto) → compare-phase7c(.txt|-fv|-nobto).
// Changed (intended, reviewed in hdb-data-pipeline/docs/specs/fill-links-compare-diff.md): empty-state cells that wait
// for an input are fill links now (app/core/filllink.js) — the dump shows the link text ("Set the facing →").
//   - rows rendered by legacy.js (not importable in node) are rewritten here from their old placeholder;
//   - the "CPF LIFE at 65" row (cpflife.js) and the money rows (money.js) arrive re-rendered from the chain.
// Checked: tests/explore/filllinks.test.js — committed 7b vs 7c differ only in empty-state cells (no number changes).
// Usage: node tests/fixtures/gen/filllinks_fixture.mjs [in=<dir with compare-phase7b*.txt>] [out=<dir>]   (default tests/fixtures)
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join } from 'node:path';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const { FILL_TEXT } = await import(pathToFileURL(ROOT + 'app/core/filllink.js').href);

export const JOBS = [['compare-phase7b.txt', 'compare-phase7c.txt'], ['compare-phase7b-fv.txt', 'compare-phase7c-fv.txt'], ['compare-phase7b-nobto.txt', 'compare-phase7c-nobto.txt']];
/** Dump row label → [old placeholder, new link text] (legacy.js rows; the seed has no daily places / no facing on flat 3). */
export const LEGACY_CELLS = {
  Workplaces: ['add daily places in the Shortlist tab', FILL_TEXT.places],
  'Sun & heat (window facing)i': ['set "main windows face" on the flat', FILL_TEXT.facing],
  'Outlook in facing directioni': ['set facing', FILL_TEXT.facing],
  'Lease covers youngest owner to 95i': ['set age', FILL_TEXT.age],
  Listing: ['—', FILL_TEXT.url],
};

export function build(text) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  return text.split(nl).map((l) => {
    const cells = l.split(' | '), swap = LEGACY_CELLS[cells[0]];
    if (!swap) return l;
    return [cells[0], ...cells.slice(1).map((c) => (c === swap[0] ? swap[1] : c))].join(' | ');
  }).join(nl);
}

if (/filllinks_fixture\.mjs$/.test(process.argv[1] || '')) { // run as a script (not imported by a test)
  const arg = (k) => (process.argv.find((x) => x.startsWith(k + '=')) || '').slice(k.length + 1) || null;
  const IN = arg('in') || join(ROOT, 'tests/fixtures'), OUT = arg('out') || join(ROOT, 'tests/fixtures');
  for (const [src, dst] of JOBS) { writeFileSync(join(OUT, dst), build(readFileSync(join(IN, src), 'utf8'))); console.log('wrote', dst); }
}
