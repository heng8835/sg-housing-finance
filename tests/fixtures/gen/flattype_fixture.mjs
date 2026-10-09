// Builds the flat-type label compare fixtures: compare-phase7c(.txt|-fv|-nobto) → compare-phase7d(.txt|-fv|-nobto).
// Changed (intended, reviewed in hdb-data-pipeline/docs/specs/flattype-labels-diff.md): HDB data codes are shown in
// sentence case through app/core/flattype.js — "4 ROOM" → "4-room", "37 TO 39" → "storey 37–39" (the Storey row, whose
// label already says it, shows the bare range "37–39"). Labels only: no number, row or best-in-row mark changes.
// Most rows are rendered by legacy.js (not importable in node), so the cells are rewritten here with the same helper;
// the future-value rationales arrive re-rendered from the chain (futurevalue-ui.js formats {ft} with it too).
// Checked: tests/core/flattype.test.js — committed 7c vs 7d differ only in these label cells.
// Usage: node tests/fixtures/gen/flattype_fixture.mjs [in=<dir with compare-phase7c*.txt>] [out=<dir>]   (default tests/fixtures)
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join } from 'node:path';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const { flatTypeLabel, storeyLabel, storeyRange } = await import(pathToFileURL(ROOT + 'app/core/flattype.js').href);

export const JOBS = [['compare-phase7c.txt', 'compare-phase7d.txt'], ['compare-phase7c-fv.txt', 'compare-phase7d-fv.txt'], ['compare-phase7c-nobto.txt', 'compare-phase7d-nobto.txt']];
const FT = /\b(\d ROOM|EXECUTIVE|MULTI-GENERATION)\b/g;
const STOREY = /\b\d+ TO \d+\b/g;
/** Every cell: flat-type codes → labels (header sub line, "Flat type", the future-value rationales, which
 *  futurevalue-ui.js now renders the same way); storey codes → "storey 37–39", except the "Storey" row → "37–39". */
export const cell = (label, c) => c.replace(FT, (m) => flatTypeLabel(m)).replace(STOREY, (m) => (label === 'Storeyi' ? storeyRange(m) : storeyLabel(m)));

export function build(text) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const out = text.split(nl).map((l) => {
    const cells = l.split(' | ');
    return cells.length > 1 ? [cells[0], ...cells.slice(1).map((c) => cell(cells[0], c))].join(' | ') : l;
  }).join(nl);
  const left = out.match(new RegExp(`${FT.source}|${STOREY.source}`));
  if (left) throw new Error(`flattype_fixture: data code left in the dump: ${left[0]}`);
  return out;
}

if (/flattype_fixture\.mjs$/.test(process.argv[1] || '')) { // run as a script (not imported by a test)
  const arg = (k) => (process.argv.find((x) => x.startsWith(k + '=')) || '').slice(k.length + 1) || null;
  const IN = arg('in') || join(ROOT, 'tests/fixtures'), OUT = arg('out') || join(ROOT, 'tests/fixtures');
  for (const [src, dst] of JOBS) { writeFileSync(join(OUT, dst), build(readFileSync(join(IN, src), 'utf8'))); console.log('wrote', dst); }
}
