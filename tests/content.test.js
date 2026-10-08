// Glossary content stays honest: every rule number is a {policy:id} placeholder that resolves,
// related terms exist, and content.json was rebuilt after the markdown changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { mergedDoc } from './helpers.js';

const DIR = new URL('../app/content/glossary/', import.meta.url);
const OUT = new URL('../app/content/content.json', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.md'));
const ids = new Set(mergedDoc().params.map((p) => p.id));
const parse = (f) => {
  const text = readFileSync(new URL(f, DIR), 'utf8');
  const [, front, body] = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  const meta = Object.fromEntries(front.split('\n').filter(Boolean).map((l) => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  return { meta, body };
};

test('at least 40 glossary terms', () => assert.ok(files.length >= 40));

test('every {policy:id} placeholder resolves (or is explicitly proposed)', () => {
  for (const f of files) {
    const { meta, body } = parse(f);
    for (const [, id] of `${meta.short} ${body}`.matchAll(/\{policy:([a-z0-9_.-]+)\}/gi)) {
      assert.ok(ids.has(id) || id.startsWith('proposed.'), `${f}: unknown policy id ${id}`);
    }
  }
});

test('short definitions carry no hard-coded numbers', () => {
  for (const f of files) {
    const plain = parse(f).meta.short.replace(/\{policy:[^}]+\}/g, '').replace(/`[^`]*`/g, '');
    assert.doesNotMatch(plain, /\d/, `${f}: put numbers in {policy:…} placeholders`);
  }
});

test('related ids point at existing terms', () => {
  const have = new Set(files.map((f) => f.replace(/\.md$/, '')));
  for (const f of files) {
    const rel = parse(f).meta.related.replace(/[[\]]/g, '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const r of rel) assert.ok(have.has(r), `${f}: related ${r} missing`);
  }
});

test('content.json is rebuilt after glossary edits (python tools/build_content.py)', () => {
  const built = statSync(OUT).mtimeMs;
  const terms = JSON.parse(readFileSync(OUT, 'utf8')).terms;
  assert.equal(Object.keys(terms).length, files.length);
  for (const f of files) assert.ok(statSync(new URL(f, DIR)).mtimeMs <= built + 1000, `${f} is newer than content.json`);
});
