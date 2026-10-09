// Phone top bar (spec phone-topbar-area-household.md §3, slice S1): the household entry's three states (word, colour
// class, accessible name — EN + 中文), the desktop chip text unchanged, the bar's markup and phone.css rules (order,
// Larger cap, no Aa), and 中文 coverage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chipState, chipWord, uiStrings as chipStrings } from '../../app/modules/household/chip.js';
import { initI18n, missingStrings } from '../../app/core/i18n.js';

const APP = new URL('../../app/', import.meta.url);
const read = (p) => readFileSync(new URL(p, APP), 'utf8');
const buyer = (age, income, cpfOa = null) => ({ age, income, citizenship: 'SC', cpfOa });
const EMPTY = { buyers: [buyer(null, null)], cash: null };
const ONE = { buyers: [buyer(31, 5200, 40000)], cash: 30000 };
const TWO = { buyers: [buyer(29, 4500), buyer(30, 3500)], cash: 40000 };

async function inZh(fn) {
  globalThis.document ??= { documentElement: {} }; // initI18n sets <html lang>
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(read(u)) });
  try { await initI18n('zh'); return await fn(); } finally { await initI18n('en'); globalThis.fetch = realFetch; }
}

test('household entry: three states → state, accessible name (EN); no count or money in the phone word', () => {
  assert.deepEqual([chipState(EMPTY).state, chipState(TWO).state, chipState(TWO, { inSample: true }).state], ['unset', 'set', 'sample']);
  assert.equal(chipState(EMPTY).name, 'About you — not set yet');
  assert.equal(chipState(TWO).name, 'About you — 2 buyers, S$8,000 a month');
  assert.equal(chipState(ONE).name, 'About you — 1 buyer, S$5,200 a month');
  assert.equal(chipState(TWO, { inSample: true }).name, 'About you — sample household');
  assert.equal(chipState(EMPTY, { inSample: true }).state, 'sample', 'a sample is never "not set"');
  assert.equal(chipWord(), 'You');
  for (const name of [chipState(EMPTY).name, chipState(TWO).name]) assert.match(name, /you/i, 'label in name: the visible word is in the name');
});

test('desktop chip text is unchanged (each old text run is now its own .hh-d span)', () => {
  const strip = (h) => h.replace(/<[^>]+>/g, '');
  assert.equal(strip(chipState(TWO).html), '👪 2 buyers · S$8k/mo · 29 ▾');
  assert.equal(strip(chipState(EMPTY).html), '👪 About you — set up');
  assert.match(chipState(TWO).html, /<span class="hh-more hh-d"> · S\$8k\/mo · 29<\/span> <span class="hh-d" aria-hidden="true">▾<\/span>$/);
  assert.match(chipState(EMPTY).html, /^<span class="hh-d">👪 <\/span><b class="hh-d">About you — set up<\/b>$/);
});

test('中文: word 我的, names 我的资料 — …, nothing missing', async () => {
  await inZh(() => {
    assert.equal(chipWord(), '我的');
    assert.equal(chipState(EMPTY).name, '我的资料 — 尚未填写');
    assert.equal(chipState(TWO).name, '我的资料 — 2 位买家，每月 S$8,000');
    assert.equal(chipState(TWO, { inSample: true }).name, '我的资料 — 示例家庭');
    assert.equal(chipState(TWO).html.replace(/<[^>]+>/g, ''), '👪 2 位买家 · S$8k/月 · 29 ▾');
    assert.deepEqual(missingStrings().filter((s) => s.startsWith('About you') || s.startsWith('You')), []);
  });
  const dict = Object.assign({}, ...['zh-guide', 'zh', 'zh-explore', 'zh-engine'].map((n) => JSON.parse(read(`i18n/${n}.json`))));
  for (const s of [...chipStrings(), 'Menu', 'Text size', 'Language / 语言', 'Detail level', 'Simple', 'Pro']) {
    if (s === 'Language / 语言') continue; // bilingual on purpose
    assert.ok(dict[s], `missing 中文: ${s}`);
  }
});

test('top bar markup: no Aa; Menu = icon over the word, accessible name "Menu"; household.css linked', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /phoneAa|tsPop|>Aa</);
  const menu = html.match(/<button[^>]*id="phoneMenu"[^>]*>([\s\S]*?)<\/button>/);
  assert.ok(menu, '#phoneMenu');
  assert.match(menu[0], /aria-label="Menu" data-i18n-attr="aria-label"/);
  assert.match(menu[1], /^<svg class="tb-ic"[^>]*aria-hidden="true"[\s\S]*<\/svg><span class="tb-w" data-i18n>Menu<\/span>$/);
  assert.match(html, /href="styles\/household\.css"/);
  const chip = read('modules/household/chip.js');
  assert.match(chip, /chip\.id = 'hhChip'/, 'tours, tests and household:open openers keep #hhChip');
  assert.match(chip, /aria-haspopup', 'dialog'/);
  assert.doesNotMatch(read('modules/household/index.js'), /renderChip/);
});

test('phone.css top bar: order lang · mode · You · Menu, 44 px targets, labels stop growing at Large, header seg text size hidden', () => {
  const css = read('styles/phone.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (sel) => { const i = css.indexOf(`${sel} {`); assert.ok(i >= 0, sel); return css.slice(i, css.indexOf('}', i)); };
  const order = (sel) => +rule(sel).match(/order: (\d+)/)[1];
  assert.deepEqual(['header .lang-switch', 'header .mode-switch', '#hhChip', '#phoneMenu'].map(order), [1, 2, 3, 4]);
  assert.match(rule('#hhChip'), /margin-left: auto/);
  assert.match(rule('header .lang-switch button, header .mode-switch button'), /min-width: 44px;[\s\S]*min-height: 44px/);
  assert.match(rule('header .tb-item'), /min-width: 44px;[\s\S]*min-height: 44px/);
  assert.match(css, /header h1, header \.sub, header \.stat, header \.spacer, header \.ts-switch, #learnBtn, #guideBtn \{ display: none; \}/);
  // px at each step: Normal root 16, Large 18, Larger 20 (capped at the Large size)
  const rem = (v, root) => { const m = v.match(/^calc\(([\d.]+)rem \/ (\d+)\)$/); return m ? (+m[1] / +m[2]) * root : parseFloat(v) * root; };
  const fs = (sel) => rule(sel).match(/font-size: ([^;]+);/)[1];
  const seg = fs('header .lang-switch button, header .mode-switch button'), word = fs('header .tb-item');
  const segL = fs(':root.ts-larger header .lang-switch button, :root.ts-larger header .mode-switch button'), wordL = fs(':root.ts-larger header .tb-item');
  assert.deepEqual([rem(seg, 16), rem(seg, 18), rem(segL, 20)], [15, 16.875, 16.875]);
  assert.deepEqual([rem(word, 16), rem(word, 18), rem(wordL, 20)], [14, 15.75, 15.75]);
});
