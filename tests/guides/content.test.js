// Guides content (app/content/guides/*.md → guides.json / guides.zh.json, tools/build_content.py): schema,
// zh parity, live keys = the whitelist in both places, targets the app creates, tour ids, rebuilt after edits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIVE } from '../../app/modules/guides/live.js';
import { USE_CASES } from '../../app/modules/guide/steps.js';
import { mergedDoc } from '../helpers.js';

const ROOT = new URL('../../', import.meta.url);
const APP = new URL('app/', ROOT);
const DIR = new URL('app/content/guides/', ROOT);
const read = (u) => readFileSync(u, 'utf8');
const mdFiles = readdirSync(DIR).filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md');
const en = JSON.parse(read(new URL('content/guides.json', APP))).guides;
const zh = JSON.parse(read(new URL('content/guides.zh.json', APP))).guides;
const terms = JSON.parse(read(new URL('content/content.json', APP))).terms;
const policyIds = new Set(mergedDoc().params.map((p) => p.id));
const TABS = ['explore', 'afford', 'rent', 'plan', 'choices'];

function jsFiles(dir) {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? jsFiles(p) : p.endsWith('.js') ? [p] : []; });
}
const appSource = [read(new URL('index.html', APP)), ...jsFiles(fileURLToPath(new URL('modules/', APP))).map((p) => readFileSync(p, 'utf8'))].join('\n');
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Same rule as tests/guide/steps.test.js: the ids / classes / attributes of a selector appear in the app's markup or code. */
function exists(sel) {
  const ids = [...sel.matchAll(/#([\w-]+)/g)].map((m) => m[1]);
  const classes = [...sel.replace(/\[[^\]]*\]/g, '').matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => m[1]);
  const attrs = [...sel.matchAll(/\[([\w-]+)="([^"]+)"\]/g)].map((m) => `${m[1]}="${m[2]}"`);
  if (!ids.length && !classes.length && !attrs.length) return false;
  return ids.every((id) => new RegExp(`id\\s*=\\s*["'\`]${reEsc(id)}["'\`]`).test(appSource))
    && classes.every((c) => new RegExp(`class(Name)?\\s*=\\s*["'\`][^"'\`]*\\b${reEsc(c)}\\b`).test(appSource))
    && attrs.every((a) => appSource.includes(a));
}

test('live-key whitelist: build_content.py LIVE_KEYS = modules/guides/live.js LIVE', () => {
  const py = read(new URL('tools/build_content.py', ROOT));
  const block = py.match(/LIVE_KEYS = \(([\s\S]*?)\n\)/)[1];
  const keys = [...block.matchAll(/"([a-z_.]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...keys].sort(), Object.keys(LIVE).sort());
});

test('every markdown guide is built, has a zh translation, and the JSON is newer than the sources', () => {
  assert.ok(mdFiles.length >= 1);
  const built = Math.min(statSync(new URL('content/guides.json', APP)).mtimeMs, statSync(new URL('content/guides.zh.json', APP)).mtimeMs);
  for (const f of mdFiles) {
    const id = f.replace(/\.md$/, '');
    assert.ok(en[id], `${id} missing from guides.json — run python tools/build_content.py`);
    assert.ok(existsSync(new URL(`zh/${f}`, DIR)), `guides/zh/${f} missing`);
    assert.ok(zh[id], `${id} missing from guides.zh.json`);
    for (const src of [new URL(f, DIR), new URL(`zh/${f}`, DIR)]) assert.ok(statSync(src).mtimeMs <= built + 1000, `${src.pathname} is newer than guides*.json — rebuild`);
  }
  assert.deepEqual(Object.keys(en).sort(), mdFiles.map((f) => f.replace(/\.md$/, '')).sort());
});

test('schema: 5–8 steps, 3–5 questions with exactly one answer and an explanation, known terms / tabs / tours', () => {
  const tours = new Set(USE_CASES.map((u) => u.id));
  for (const g of Object.values(en)) {
    assert.ok(g.title && g.summary, g.id);
    assert.ok(Number.isInteger(g.order) && g.est_minutes >= 1 && g.est_minutes <= 30, g.id);
    assert.ok(!g.use_case || tours.has(g.use_case), `${g.id}: use_case ${g.use_case}`);
    assert.ok(g.steps.length >= 5 && g.steps.length <= 8, `${g.id}: ${g.steps.length} steps`);
    for (const [i, s] of g.steps.entries()) {
      const where = `${g.id} step ${i + 1}`;
      assert.ok(s.title && s.body, where);
      if (s.tab != null) assert.ok(TABS.includes(s.tab), `${where}: tab ${s.tab}`);
      if (s.fallback != null) assert.ok(Array.isArray(s.fallback) && s.fallback.length, where);
      for (const k of s.live) assert.ok(LIVE[k], `${where}: live key ${k}`);
      for (const id of s.policy) assert.ok(policyIds.has(id) || id.startsWith('proposed.'), `${where}: policy ${id}`);
      assert.deepEqual([...new Set([...s.body.matchAll(/\{live:([a-z_.]+)\}/g)].map((m) => m[1]))].sort(), [...s.live].sort(), `${where}: live list`);
    }
    assert.ok(g.quiz.length >= 3 && g.quiz.length <= 5, `${g.id}: ${g.quiz.length} questions`);
    for (const q of g.quiz) {
      assert.ok(q.q && q.explain && q.options.length >= 2 && q.options.length <= 5, g.id);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, g.id);
      if (q.term) assert.ok(terms[q.term], `${g.id}: glossary term ${q.term}`);
    }
  }
});

test('each step target (or a fallback) is something the app creates — otherwise it carries an if_missing note', () => {
  for (const g of Object.values(en)) {
    for (const [i, s] of g.steps.entries()) {
      if (!s.target && !s.fallback) continue;
      const ok = [s.target, ...(s.fallback || [])].filter(Boolean).some(exists) || !!s.if_missing;
      assert.ok(ok, `${g.id} step ${i + 1}: nothing in the app matches ${s.target}`);
    }
  }
});

test('zh guides: same structure as English, translated text, 您 not 你', () => {
  for (const [id, g] of Object.entries(en)) {
    const z = zh[id];
    assert.equal(z.steps.length, g.steps.length, id);
    assert.equal(z.quiz.length, g.quiz.length, id);
    assert.notEqual(z.title, g.title, `${id}: title not translated`);
    for (const [i, s] of g.steps.entries()) {
      const t = z.steps[i];
      for (const k of ['target', 'fallback', 'tab']) assert.deepEqual(t[k], s[k], `${id} step ${i + 1} ${k}`);
      assert.deepEqual([...t.live].sort(), [...s.live].sort(), `${id} step ${i + 1} live`);
      assert.deepEqual([...t.policy].sort(), [...s.policy].sort(), `${id} step ${i + 1} policy`);
      assert.notEqual(t.body, s.body, `${id} step ${i + 1}: body not translated`);
      assert.match(t.body, /[\u4e00-\u9fff]/, `${id} step ${i + 1}: no Chinese text`);
    }
    for (const [k, q] of g.quiz.entries()) {
      assert.equal(z.quiz[k].answer, q.answer, `${id} question ${k + 1}`);
      assert.equal(z.quiz[k].options.length, q.options.length, `${id} question ${k + 1}`);
      assert.equal(z.quiz[k].term, q.term, `${id} question ${k + 1}`);
    }
    const text = JSON.stringify(z);
    assert.doesNotMatch(text.replace(/您/g, ''), /你/, `${id}: use 您`);
  }
});

test('no typed numbers in guide text — rule values only via {policy:…}', () => {
  for (const g of [...Object.values(en), ...Object.values(zh)]) {
    const all = [g.title, g.summary, g.intro || '', ...g.steps.flatMap((s) => [s.title, s.body, s.if_missing || '']),
      ...g.quiz.flatMap((q) => [q.q, q.explain, ...q.options])].join(' ');
    const plain = all.replace(/\{(policy|live):[^}]+\}/g, '').replace(/<span class="eg">[^<]*<\/span>/g, '').replace(/<[^>]+>/g, '');
    assert.doesNotMatch(plain, /\d/, `${g.id}: digits in the text`);
  }
});

test('every guides UI string has a 中文 entry (i18n/zh*.json), keeps its {n} placeholders, uses 您 not 你', async () => {
  const dir = fileURLToPath(new URL('modules/guides/', APP));
  const src = readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  const literals = [...src.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2].replace(/\\(['"\\])/g, '$1'));
  const { TOPICS } = await import('../../app/modules/guides/log.js');
  const { NEED_WORDS } = await import('../../app/modules/guides/live.js');
  const { DISCLAIMER } = await import('../../app/modules/guides/render.js');
  const keys = new Set([...literals, ...TOPICS.map((x) => x[1]), 'Other rules', ...Object.values(NEED_WORDS), DISCLAIMER, 'Glossary']);
  const dict = Object.assign({}, ...['zh-guide', 'zh', 'zh-explore', 'zh-engine'].map((n) => JSON.parse(read(new URL(`i18n/${n}.json`, APP)))));
  const ph = (s) => (s.match(/\{\d+\}/g) || []).sort();
  for (const k of keys) {
    if (!/[A-Za-z]/.test(k)) continue;
    assert.ok(dict[k] != null, `zh missing: ${k}`);
    assert.deepEqual(ph(dict[k]), ph(k), `placeholders in "${k}"`);
    assert.doesNotMatch(dict[k].replace(/您/g, ''), /你/, `use 您: ${k}`);
  }
});
