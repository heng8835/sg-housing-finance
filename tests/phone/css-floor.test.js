// Phone overhaul (spec phone-overhaul.md §2.4, §2.5, §7): styles/phone.css only adds phone rules — every rule sits in
// a @media (max-width: 767px) block so ≥ 768 px is untouched — with no px font size, nothing under .875rem (14 px at
// Normal), root sizes 16 / 18 / 20 px, and ≥ 44 px min-height for every interactive selector in the target list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../../app/styles/phone.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Flat list of { sel, body, media: [enclosing @-rule preludes] } (small brace parser; no strings with braces here). */
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
  assert.ok(all.length > 50);
  const outside = all.filter((r) => !r.media.some((m) => /^@media (screen and )?\(max-width:\s*767px\)$/.test(m))).map((r) => r.sel);
  assert.deepEqual(outside, []);
});

test('root sizes: 16 / 18 / 20 px for Normal / Large / Larger (the only px font tokens)', () => {
  const root = (sel) => decls(all.find((r) => r.sel === sel)?.body || '', '--fs-base')[0];
  assert.equal(root(':root'), '16px');
  assert.equal(root(':root.ts-large'), '18px');
  assert.equal(root(':root.ts-larger'), '20px');
});

test('font sizes: rem only, never under .875rem (14 px at Normal); vw only behind a .875rem floor', () => {
  const bad = [];
  for (const r of all) {
    for (const v of decls(r.body, 'font-size')) {
      if (/px/.test(v)) { bad.push(`${r.sel}: ${v} (px)`); continue; }
      if (/vw/.test(v) && !/^max\(\s*\.875rem/.test(v)) bad.push(`${r.sel}: ${v} (vw without floor)`);
      for (const m of v.matchAll(/([\d.]+)r?em/g)) if (parseFloat(m[1]) < 0.875) bad.push(`${r.sel}: ${v}`);
      if (!/rem|em|inherit/.test(v)) bad.push(`${r.sel}: ${v} (not rem)`);
    }
  }
  assert.deepEqual(bad, []);
});

test('targets: every interactive selector in the list has a min-height ≥ 44 px rule', () => {
  const tall = new Set();
  for (const r of all) {
    const mh = decls(r.body, 'min-height').map((v) => parseFloat(v)).filter((n) => /px/.test(r.body));
    if (!mh.some((n) => n >= 44)) continue;
    for (const s of r.sel.split(/,(?![^(]*\))/)) tall.add(s.trim().replace(/:(?:not|where)\((?:[^()]|\([^()]*\))*\)/g, ''));
  }
  for (const want of ['button', '.btn', 'summary', 'select', 'input', '[role="tab"]', '[role="option"]', 'label.check', '.radios label', '.chip', '.seg button'])
    assert.ok(tall.has(want), `no ≥ 44 px min-height for ${want}`);
  const main = all.find((r) => r.sel.split(',').map((x) => x.trim()).includes('.btn.primary'));
  assert.ok(main && parseFloat(decls(main.body, 'min-height')[0]) >= 48, 'main actions 48 px');
});

test('the sheet never covers the tab bar, and the Compare drawer is off on phones', () => {
  const sheet = all.find((r) => r.sel === '#mapSheet');
  assert.match(sheet.body, /position: absolute/); assert.match(sheet.body, /bottom: 0/); // inside #mapwrap, above row 3 (tab bar)
  assert.ok(all.some((r) => r.sel.includes('#drawer') && /display: none/.test(r.body)));
  assert.ok(all.some((r) => r.sel === 'nav.tabbar' && /grid-row: 3/.test(r.body)));
});
