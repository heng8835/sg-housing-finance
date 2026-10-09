// Autorun Stage 5a — accessibility audit (hdb-data-pipeline/docs/specs/a11y-audit.md): the parts that can be checked
// without a browser. Colour contrast of the map ramp, the budget colours and the CSS colour tokens (WCAG 2.2 AA:
// 4.5:1 text, 3:1 non-text); no unlabeled inputs and no <img> without alt in index.html and in rendered module HTML;
// page structure (lang, skip link, one h1, a heading per page, landmarks); the pure helpers of core/a11y.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { RAMP, textOn } from '../../app/modules/explore/blocks.js';
import { comboState, arrowTarget, optionId, uiStrings as a11yStrings } from '../../app/core/a11y.js';
import { defaults } from '../../app/core/store.js';
import { formHtml as householdForm } from '../../app/modules/household/form.js';
import { formHtml as quickAddForm } from '../../app/modules/explore/quickadd.js';
import { QUESTIONS, answersFrom } from '../../app/modules/start/answers.js';
import { questionHtml } from '../../app/modules/start/view.js';
import { policy } from '../helpers.js';

const read = (p) => readFileSync(new URL(`../../app/${p}`, import.meta.url), 'utf8');

// ------------------------------------------------------------------ contrast (WCAG 2.x relative luminance)
const lum = (hex) => {
  const h = hex.length === 4 ? hex.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : hex;
  const n = parseInt(h.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const AA_TEXT = 4.5, AA_UI = 3;

/** :root custom properties of base.css that are plain hex colours. */
function tokens() {
  const css = read('styles/base.css');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')));
  const out = {};
  for (const m of root.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})\b/g)) out[m[1]] = m[2];
  return out;
}

test('contrast: every map box label reads at ≥ 4.5:1 on its ramp step (go-live D9: RAMP[1] darkened)', () => {
  for (const c of RAMP) assert.ok(contrast(c, textOn(c)) >= AA_TEXT, `${c} with ${textOn(c)}: ${contrast(c, textOn(c)).toFixed(2)}:1`);
  assert.equal(RAMP[1], '#3077c7');
  assert.ok(contrast(RAMP[1], '#ffffff') >= AA_TEXT);
  // the budget colours (Explore "Within my budget") use the same textOn rule
  const m = read('modules/explore/legacy.js').match(/BUDGET_COLORS = \{ within: '(#\w+)', near: '(#\w+)', over: '(#\w+)' \}/);
  assert.ok(m, 'BUDGET_COLORS');
  for (const c of m.slice(1)) assert.ok(contrast(c, textOn(c)) >= AA_TEXT, `${c}: ${contrast(c, textOn(c)).toFixed(2)}:1`);
});

test('contrast: text tokens ≥ 4.5:1 on the page surfaces; status inks also on their own tint; ring + input outline ≥ 3:1', () => {
  const k = tokens();
  for (const name of ['text', 'text-2', 'text-3', 'accent-ink', 'good-ink', 'warn-ink', 'serious-ink', 'critical-ink']) {
    assert.ok(k[name], `--${name}`);
    for (const bg of ['surface', 'surface-2', 'bg']) assert.ok(contrast(k[name], k[bg]) >= AA_TEXT, `--${name} on --${bg}: ${contrast(k[name], k[bg]).toFixed(2)}:1`);
  }
  for (const s of ['good', 'warn', 'serious', 'critical']) assert.ok(contrast(k[`${s}-ink`], k[`${s}-bg`]) >= AA_TEXT, `--${s}-ink on --${s}-bg`);
  assert.ok(contrast(k['accent-ink'], k['accent-soft']) >= AA_TEXT, 'blue text on the soft blue (chips, tags)');
  assert.ok(contrast('#ffffff', k['accent-ink']) >= AA_TEXT, 'white on the text blue (selected segment, primary button)');
  assert.ok(contrast(k['border-input'], k.surface) >= AA_UI, 'input outline');
  assert.ok(contrast(k.accent, k.surface) >= AA_UI, 'focus ring');
});

test('contrast: white text never sits on --accent (4.42:1) and status colours are never text — the -ink tokens are', () => {
  const files = [];
  const walk = (dir) => { for (const f of readdirSync(new URL(`../../app/${dir}`, import.meta.url))) { const p = `${dir}/${f}`; if (statSync(new URL(`../../app/${p}`, import.meta.url)).isDirectory()) walk(p); else if (/\.(css|js)$/.test(f)) files.push(p); } };
  ['styles', 'modules', 'core'].forEach(walk);
  for (const f of files) {
    const src = read(f);
    for (const m of src.matchAll(/(?<![-\w])color:\s*var\(--(good|warn|serious|critical)\)/g)) assert.fail(`${f}: text in var(--${m[1]}) — use var(--${m[1]}-ink)`);
    for (const m of src.matchAll(/[^{}]*\{[^{}]*background:\s*var\(--accent\)[^{}]*color:\s*#fff[^{}]*\}/g)) assert.fail(`${f}: white on --accent: ${m[0].trim().slice(0, 80)}`);
  }
  assert.match(read('styles/base.css'), /\.seg button\.on \{ background: var\(--accent-ink\); color: #fff; \}/);
  // the white kind badges of the search lists (Block / MRT / School / Town / Place)
  const k = tokens(), css = read('styles/base.css');
  const badges = [...css.matchAll(/\.kind\.(\w+) \{ background: (#[0-9a-fA-F]{3,6}|var\(--([\w-]+)\)); \}/g)];
  assert.ok(badges.length >= 8, 'badge rules found');
  for (const [, kind, val, tok] of badges) { const c = tok ? k[tok] : val; assert.ok(contrast('#ffffff', c) >= AA_TEXT, `.kind.${kind} ${c}: ${contrast('#ffffff', c).toFixed(2)}:1`); }
});

// ------------------------------------------------------------------ labels, alt text
/** Form controls of an HTML string without an accessible name (wrapping <label>, label[for], aria-label(ledby), title). */
function unlabeled(html) {
  const forIds = new Set([...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]));
  const bad = [];
  let inLabel = 0;
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
    const [, close, tag, attrs] = m, name = tag.toLowerCase();
    if (name === 'label') { inLabel += close ? -1 : 1; continue; }
    if (close || !['input', 'select', 'textarea'].includes(name)) continue;
    const type = (attrs.match(/\btype="([^"]+)"/) || [])[1];
    if (name === 'input' && ['hidden', 'submit', 'button', 'reset'].includes(type)) continue;
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    const named = inLabel > 0 || (id && forIds.has(id)) || /\baria-label(ledby)?="[^"]+"/.test(attrs) || /\btitle="[^"]+"/.test(attrs);
    if (!named) bad.push(`<${name}${attrs.slice(0, 80)}>`);
  }
  return bad;
}
const imgsWithoutAlt = (html) => [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]).filter((s) => !/\balt=/.test(s));

test('labels: the unlabeled-input checker catches what it should', () => {
  assert.deepEqual(unlabeled('<label>Price <input id="a"></label><label for="b">B</label><input id="b"><input aria-label="C">'), []);
  assert.equal(unlabeled('<div><input id="x" placeholder="only a placeholder"></div>').length, 1);
  assert.equal(unlabeled('<select></select><textarea></textarea><input type="hidden">').length, 2);
});

test('labels: index.html — every input / select has a name; no <img> without alt', () => {
  const html = read('index.html');
  assert.deepEqual(unlabeled(html), []);
  assert.deepEqual(imgsWithoutAlt(html), []);
});

test('labels: rendered module HTML — household form, quick add, every Start here question', () => {
  const B = (o = {}) => ({ ...defaults().household.buyers[0], ...o });
  const H = (o = {}) => ({ ...defaults().household, ...o });
  const couple = H({ buyers: [B({ age: 29, income: 4500, cpfOa: 32000 }), B({ age: 28, income: 3500, cpfOa: 21000, citizenship: 'PR', prYears3Plus: true })], cash: 40000 });
  for (const o of [{ pro: true }, { pro: false }, { pro: true, phone: true }]) assert.deepEqual(unlabeled(householdForm(couple, policy, o)), [], `household ${JSON.stringify(o)}`);
  const qa = quickAddForm({ types: [{ ft: 3, n: 3, recent: true }], ft: 3, row: { ft: 3, storey: 2, sqm: 92, price: 601000 }, label: 'Blk 0', ftCode: () => '4 ROOM', storeyOptions: '<option>1</option>', facingOptions: '<option value="">unknown</option>', phone: true });
  assert.deepEqual(unlabeled(qa), [], 'quick add');
  const a = { ...answersFrom(defaults().household), goal: 'explore', buyers: 2, ages: [30, null] };
  QUESTIONS.forEach((q, i) => {
    const html = questionHtml(i, a, { towns: ['BEDOK', 'ANG MO KIO'] });
    assert.deepEqual(unlabeled(html), [], `start: ${q}`);
    assert.deepEqual(imgsWithoutAlt(html), [], `start: ${q}`);
  });
});

test('alt text: no <img> without alt in module templates (the OneMap logo in the map credits is decorative: alt="")', () => {
  const legacy = read('modules/explore/legacy.js');
  assert.deepEqual(imgsWithoutAlt(legacy), []);
  assert.match(legacy, /om_logo\.png" alt=""/);
});

// ------------------------------------------------------------------ page structure
test('structure: lang, skip link first, one h1, a heading per page, landmarks, combobox lists', () => {
  const html = read('index.html');
  assert.match(html, /<html lang="en">/);
  assert.match(read('core/i18n.js'), /document\.documentElement\.lang = lang === 'zh' \? 'zh-Hans-SG' : 'en-SG'/, '中文 switches the page language');
  assert.match(html, /<body>\n<a class="skip-link" href="#panel" data-i18n>Skip to content<\/a>/, 'skip link is the first thing in the page');
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  for (const tab of ['explore', 'afford', 'rent', 'plan', 'choices']) {
    const at = html.indexOf(`id="tab-${tab}"`), end = html.indexOf('class="tab', at + 10);
    assert.match(html.slice(at, end < 0 ? undefined : end), /<h2 class="sr-only tab-h/, `${tab}: an h2 for screen readers`);
  }
  assert.match(html, /<header>/); assert.match(html, /<main id="mapwrap">/); assert.match(html, /<div id="panel" role="complementary">/); assert.match(html, /<nav class="tabbar"/);
  assert.match(html, /<div id="cardDock" role="region" aria-label="Block cards"/);
  assert.match(read('styles/phone.css'), /header h1 \{ position: absolute;/, 'phones keep the h1 for screen readers');
  assert.match(read('styles/phone-pages.css'), /\.tab > \.tab-h\.desk-only \{ display: none; \}/);
  assert.match(read('modules/shell/phone.js'), /panel\.setAttribute\('role', 'main'\)/, 'phone page view: the panel is the main landmark');
  const main = read('main.js');
  assert.match(main, /bindSkipLink\(document\); bindRadioArrows\(document\);/);
  for (const pair of [`['mSearch', 'mList']`, `['cAddr', 'acList']`, `['wPlace', 'wList']`]) assert.ok(main.includes(pair), pair);
});

// ------------------------------------------------------------------ core/a11y.js
test('core/a11y: combobox state and radio arrow targets', () => {
  assert.equal(optionId('mList', 3), 'mList-o3');
  assert.deepEqual(comboState('mList', [], true), { expanded: false, active: null });
  assert.deepEqual(comboState('mList', [{ i: '0', hi: false }, { i: '1', hi: true }], true), { expanded: true, active: 'mList-o1' });
  assert.deepEqual(comboState('mList', [{ i: '0', hi: true }], false), { expanded: false, active: null });
  const r = (n, off = []) => Array.from({ length: n }, (_, i) => ({ disabled: off.includes(i), hidden: false }));
  assert.equal(arrowTarget(r(3), 0, 'ArrowRight'), 1);
  assert.equal(arrowTarget(r(3), 2, 'ArrowRight'), 0, 'wraps');
  assert.equal(arrowTarget(r(3), 0, 'ArrowLeft'), 2, 'wraps back');
  assert.equal(arrowTarget(r(3), 0, 'ArrowDown'), 1);
  assert.equal(arrowTarget(r(3, [1]), 0, 'ArrowRight'), 2, 'skips a disabled one');
  assert.equal(arrowTarget(r(3), 0, 'Enter'), null);
  assert.equal(arrowTarget(r(1), 0, 'ArrowRight'), null);
});

test('中文: the a11y strings have entries', () => {
  const zh = Object.assign({}, ...['zh-guide', 'zh', 'zh-explore', 'zh-engine'].map((n) => JSON.parse(read(`i18n/${n}.json`))));
  assert.deepEqual(a11yStrings.filter((s) => !zh[s]), []);
});
