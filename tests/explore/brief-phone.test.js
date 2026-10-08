// Phone overhaul slice F (P-37, spec phone-overhaul.md §3.10): styles/brief.css — the phone reading view only restyles
// the on-screen preview (.brief-paper / the dialog), screen only, never the measured + printed A4 copy (#briefPrint);
// its font sizes are rem at the phone floor (14 px notes, 16 px body). The A4 guard puts back what phone.css's
// `header` rules change inside the page (they also match in print: the A4 page box is < 768 px wide).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../../app/styles/brief.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rules(css) {
  const out = [];
  (function walk(s, media) {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i);
      if (open < 0) return;
      let depth = 1, k = open + 1;
      for (; k < s.length && depth; k++) { if (s[k] === '{') depth++; else if (s[k] === '}') depth--; }
      const head = s.slice(i, open).trim(), body = s.slice(open + 1, k - 1);
      if (head.startsWith('@media')) walk(body, [...media, head]); else if (!head.startsWith('@')) out.push({ sel: head, body, media });
      i = k;
    }
  })(css, []);
  return out;
}
const all = rules(CSS);
const PHONE_SCREEN = /^@media screen and \(max-width:\s*767px\)$/, PHONE_ANY = /^@media \(max-width:\s*767px\)$/;
const sels = (r) => r.sel.split(',').map((s) => s.trim());
const decls = (body, prop) => [...body.matchAll(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'g'))].map((m) => m[1].trim());

test('phone reading view: screen only, and only the preview dialog — never #briefPrint or the bare .brief page', () => {
  const view = all.filter((r) => r.media.some((m) => PHONE_SCREEN.test(m)));
  assert.ok(view.length > 20);
  const bad = view.flatMap(sels).filter((s) => !/^(dialog\.brief-dlg|\.brief-dlg|\.brief-paper)\b/.test(s) || /#briefPrint/.test(s));
  assert.deepEqual(bad, []);
});

test('phone reading view: font sizes are rem, never under .875rem (14 px notes; body 1rem)', () => {
  const bad = [];
  for (const r of all.filter((x) => x.media.some((m) => PHONE_SCREEN.test(m)))) {
    // the mini-map's SVG text sits in a 240-unit viewBox drawn ≈ 1.43× wide: .625rem (10 units) shows at ≈ 14 px (R-09)
    if (/\.bf-map svg text$/.test(r.sel)) { assert.deepEqual(decls(r.body, 'font-size'), ['.625rem']); continue; }
    for (const v of decls(r.body, 'font-size')) {
      const n = /^([\d.]+)rem$/.exec(v);
      if (!n || parseFloat(n[1]) < 0.875) bad.push(`${r.sel}: ${v}`);
    }
  }
  assert.deepEqual(bad, []);
  const body = all.find((r) => r.sel === '.brief-paper .brief' && r.media.some((m) => PHONE_SCREEN.test(m)));
  assert.equal(decls(body.body, 'font-size')[0], '1rem');
});

test('A4 guard: phone.css top-bar rules are undone inside the page (flat name shown, desktop header box)', () => {
  const guard = all.filter((r) => r.media.length === 1 && PHONE_ANY.test(r.media[0]));
  const h1 = guard.find((r) => sels(r).includes('.brief .bf-head h1'));
  assert.ok(h1, 'guard for header h1');
  assert.deepEqual(decls(h1.body, 'display'), ['block']);
  const head = guard.find((r) => sels(r).includes('.brief .bf-head'));
  assert.deepEqual([decls(head.body, 'min-height')[0], decls(head.body, 'padding-top')[0]], ['0', '0']);
  // every guard rule targets the page itself, never the preview chrome
  assert.deepEqual(guard.flatMap(sels).filter((s) => !s.startsWith('.brief ')), []);
});

test('the A4 page rules stay outside any phone media block (desktop + print unchanged)', () => {
  const page = all.filter((r) => !r.media.length && sels(r).some((s) => s.startsWith('.brief ') || s.startsWith('.brief.')));
  assert.ok(page.length > 40);
  const atPrint = all.filter((r) => r.media.some((m) => /print/.test(m))).map((r) => r.sel);
  assert.ok(atPrint.includes('body.brief-on #briefPrint'));
});
