// Regenerates the compare-table characterisation chain (npm run fixtures):
//   compare-phase2.txt ─seed_rows→ compare-phase6b.txt ─fv_fixture→ compare-phase6b-fv.txt
//   compare-phase6b(-fv).txt ─cpflife_fixture→ compare-phase6d.txt, compare-phase6d-fv.txt
//   compare-phase6b.txt ─fv_fixture nobto→ (temp) compare-phase6b-fv-nobto.txt ─cpflife_fixture→ compare-phase6d-nobto.txt
//   compare-phase6d(-fv|-nobto).txt ─money_fixture→ compare-phase7a(-fv|-nobto).txt   (7a A1: money rows = Afford)
//   compare-phase7a(-fv|-nobto).txt ─family_fixture→ compare-phase7a-family(-fv|-nobto).txt   (B2: "For the family")
//   compare-phase7a-family(-fv|-nobto).txt ─phase7b_fixture→ compare-phase7b(-fv|-nobto).txt   (7b B13 premium flag; B1/B4/B12 asserted unchanged)
//   compare-phase7b(-fv|-nobto).txt ─filllinks_fixture→ compare-phase7c(-fv|-nobto).txt   (fill links: empty-state cells = link text)
// Since the fill links the 7b files are historical too (built in the temp folder; committed copies unchanged).
// Since 7b the 6b / 6d / 7a / 7a-family files are historical: the chain builds them in a temp folder as inputs and
// writes only the 7b outputs (OUTPUTS). The committed compare-phase6*.txt / compare-phase7a*.txt stay as they were.
// Usage: node tests/fixtures/gen/all.mjs [--out <dir>] [--check]
//   --out    write the 7c files there instead of tests/fixtures
//   --check  build into a temp folder and compare byte-for-byte with tests/fixtures; exit 1 on any difference
// Values depend on app/data/*.js and the dates fixed in the generators (policy as of 7 Oct 2026, data to Sep 2026).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIX = fileURLToPath(new URL('..', import.meta.url));
export const OUTPUTS = ['compare-phase7c.txt', 'compare-phase7c-fv.txt', 'compare-phase7c-nobto.txt'];

// The public build ships without the BTO scrape (DEC-015), and the chain needs it for the BTO-on files.
if (!existsSync(fileURLToPath(new URL('../../../app/data/bto.js', import.meta.url)))) {
  console.log('skipped: app/data/bto.js is not in this build (BTO data stays private) - npm test still covers the compare rows');
  process.exit(0);
}

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const oi = argv.indexOf('--out');
const tmp = mkdtempSync(join(tmpdir(), 'sghf-fixtures-'));
const out = check ? tmp : oi >= 0 ? argv[oi + 1] : FIX;
const work = tmp; // the historical 6b / 6d / 7a chain

function run(script, ...args) {
  const r = spawnSync(process.execPath, [join(HERE, script), ...args], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); throw new Error(`${script} failed`); }
}

try {
  run('seed_rows.mjs', join(work, 'compare-phase6b.txt'));
  run('fv_fixture.mjs', join(work, 'compare-phase6b-fv.txt'), `base=${join(work, 'compare-phase6b.txt')}`);
  const noBto = join(work, 'compare-phase6b-fv-nobto.txt');
  run('fv_fixture.mjs', noBto, 'nobto', `base=${join(work, 'compare-phase6b.txt')}`);
  run('cpflife_fixture.mjs', 'write', `in=${work}`, `out=${work}`, `nobto=${noBto}`);
  run('money_fixture.mjs', `in=${work}`, `out=${work}`);
  run('family_fixture.mjs', `in=${work}`, `out=${work}`); // B2: family rows come after the money rows
  run('phase7b_fixture.mjs', `in=${work}`, `out=${work}`); // 7b: B13 premium flag (B1 / B4 / B12 checked unchanged)
  run('filllinks_fixture.mjs', `in=${work}`, `out=${out}`); // fill links: empty-state cells → link text (reviewed diff)
  if (check) {
    const bad = OUTPUTS.filter((f) => !existsSync(join(FIX, f)) || !readFileSync(join(tmp, f)).equals(readFileSync(join(FIX, f))));
    for (const f of OUTPUTS) console.log(`${bad.includes(f) ? 'DIFFERS' : 'same   '} ${f}`);
    if (bad.length) process.exitCode = 1;
  } else {
    console.log(`wrote ${OUTPUTS.join(', ')} to ${out}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
