// Builds tests/fixtures/compare-phase6d.txt (+ -fv) = compare-phase6b(.txt|-fv.txt) + the CPF-11 row
// "CPF LIFE at 65 (est.)" after "Max price your income supports" (Pro mode, the seed household migrated by core/store).
// Usage: node tests/fixtures/gen/cpflife_fixture.mjs [write] [in=<dir>] [out=<dir>] [nobto=<6b-fv nobto file>]
//   — without "write" it only prints. in / out = folders of the inputs (compare-phase6b(-fv).txt) and outputs
//   (default tests/fixtures); nobto = also build compare-phase6d-nobto.txt from that
//   BTO-off future-value fixture (fv_fixture.mjs <file> nobto).
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { isAbsolute, join } from 'node:path';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url)); // repo root (tests/fixtures/gen/ → ../../../)
const imp = (p) => import(pathToFileURL(ROOT + p).href);
const { createCpfLife } = await imp('app/modules/explore/cpflife.js');
const { createStore, LEGACY_KEY } = await imp('app/core/store.js');
const { createPolicy } = await imp('app/core/policy.js');
const g = {}; vm.createContext(g); g.window = g;
vm.runInContext(readFileSync(ROOT + 'app/data/data.js', 'utf8'), g);
const D = g.HDB_DATA;
const policy = createPolicy(JSON.parse(readFileSync(ROOT + 'app/policy/sg-policy.json', 'utf8')), new Date(2026, 9, 7));
const seed = JSON.parse(readFileSync(ROOT + 'tests/fixtures/compare-seed.json', 'utf8')).state;
const mem = (o) => ({ getItem: (k) => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = v; }, removeItem: (k) => { delete o[k]; } });
const strip = (h) => h.replace(/<small>/g, '\n').replace(/<\/small>/g, '\n').replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&amp;/g, '&').split('\n').map((s) => s.trim()).filter(Boolean).join(' ');

const arg = (k) => (process.argv.find((x) => x.startsWith(k + '=')) || '').slice(k.length + 1) || null;
const IN = arg('in') || join(ROOT, 'tests/fixtures');
const base = readFileSync(join(IN, 'compare-phase6b.txt'), 'utf8');
const nl = base.includes('\r\n') ? '\r\n' : '\n';
const leaseLine = base.split(nl).find((l) => l.startsWith('Remaining lease today'));
const leases = leaseLine.split(' | ').slice(1).map((c) => parseFloat(c));
const ms = seed.choices.map((c, i) => ({ c, leaseNow: leases[i] }));

function lineFor(household) {
  const store = household ? { get: (k) => ({ household, plan: { cpf: {} } }[k]), subscribe: () => () => {} }
    : createStore({ storage: mem({ [LEGACY_KEY]: JSON.stringify({ profile: seed.profile, choices: seed.choices }) }) });
  const row = createCpfLife({ policy, store, bus: { emit() {} }, D, year: () => 2026 }).row();
  return { line: `${row.lbl}i | ` + ms.map((m) => strip(row.f(m))).join(' | '), v: row.v ? ms.map(row.v) : null };
}
const seedLine = lineFor(null);
console.log('SEED', seedLine);
// illustration only (not written): the seed couple with CPF balances
const withCpf = { ...createStore({ storage: mem({ [LEGACY_KEY]: JSON.stringify({ profile: seed.profile }) }) }).get('household') };
withCpf.buyers = [{ ...withCpf.buyers[0], cpfOa: 60000, cpfSa: 20000 }];
console.log('WITH CPF (OA 60k, SA 20k)', lineFor(withCpf));
console.log('AGE 45, 4k, OA 150k, SA 30k', lineFor({ ...withCpf, buyers: [{ age: 45, income: 4000, citizenship: 'SC', cpfOa: 150000, cpfSa: 30000 }] }));

const OUT = arg('out') || join(ROOT, 'tests/fixtures'), NOBTO = arg('nobto');
if (process.argv[2] === 'write') {
  const jobs = [['compare-phase6b.txt', 'compare-phase6d.txt'], ['compare-phase6b-fv.txt', 'compare-phase6d-fv.txt']];
  if (NOBTO) jobs.push([NOBTO, 'compare-phase6d-nobto.txt']);
  for (const [src, out] of jobs) {
    const fx = readFileSync(isAbsolute(src) ? src : join(IN, src), 'utf8');
    const L = fx.split(nl);
    const at = L.findIndex((l) => l.startsWith('Max price your income supports'));
    if (at < 0) throw new Error('no max-price row in ' + src);
    L.splice(at + 1, 0, seedLine.line);
    writeFileSync(join(OUT, out), L.join(nl));
    console.log('wrote', out, 'line', at + 2);
  }
}
