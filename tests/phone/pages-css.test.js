// Phone overhaul slice D (spec phone-overhaul.md §3.5–§3.7): styles/phone-pages.css (Afford, Rent & Buy, Plan,
// Scenarios, money fields) only adds phone rules — every rule sits in a @media (max-width: 767px) block, so ≥ 768 px
// is untouched — with rem font sizes never under .875rem (14 px at Normal) and ≥ 44 px main targets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../../app/styles/phone-pages.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rules(css) {
  const out = [];
  (function walk(s, media) {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i);
      if (open < 0) { assert.equal(s.slice(i).trim(), '', 'text outside a rule'); return; }
      let depth = 1, k = open + 1;
      for (; k < s.length && depth; k++) { if (s[k] === '{') depth++; else if (s[k] === '}') depth--; }
      const head = s.slice(i, open).trim(), body = s.slice(open + 1, k - 1);
      if (head.startsWith('@')) walk(body, [...media, head]); else out.push({ sel: head, body, media });
      i = k;
    }
  })(css, []);
  return out;
}
const all = rules(CSS);
const decls = (body, prop) => [...body.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'g'))].map((m) => m[1].trim());

test('every rule is inside @media (max-width: 767px)', () => {
  assert.ok(all.length > 20);
  const outside = all.filter((r) => !r.media.some((m) => /^@media (screen and )?\(max-width:\s*767px\)$/.test(m))).map((r) => r.sel);
  assert.deepEqual(outside, []);
});

test('font sizes: rem only, never under .875rem', () => {
  const bad = [];
  for (const r of all) {
    for (const v of decls(r.body, 'font-size')) {
      if (!/^[\d.]+rem$/.test(v)) bad.push(`${r.sel}: ${v} (not rem)`);
      else if (parseFloat(v) < 0.875) bad.push(`${r.sel}: ${v}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('main actions 48 px and full width; Scenarios Delete apart from Load / Rename; no new colours', () => {
  const main = all.find((r) => r.sel.includes('#afBudget') && r.sel.includes('#scSave'));
  assert.ok(main && parseFloat(decls(main.body, 'min-height')[0]) >= 48 && /width: 100%/.test(main.body));
  assert.ok(all.some((r) => r.sel.includes('[data-act="sc-delete"]') && /grid-column/.test(r.body)));
  assert.doesNotMatch(CSS, /#[0-9a-f]{3,6}\b|rgba?\(/i, 'tokens only');
});
