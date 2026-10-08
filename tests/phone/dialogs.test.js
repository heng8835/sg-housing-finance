// Phone overhaul Wave 1, slice E (spec phone-overhaul.md §3.1, §3.8, §3.9, §3.11): dialogs are full-screen pages on
// phones (.phone-full) with a word "Close" and, where there is input, a sticky Next / Done above the keyboard; the
// tour moves the map sheet only for Map steps; the offer / update toast / "Back to the guide" pill sit at the bottom
// (above the tab bar), never over the top bar. Desktop markup keeps its ✕.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaults } from '../../app/core/store.js';
import { answersFrom, routeFor } from '../../app/modules/start/answers.js';
import { questionHtml, doneHtml } from '../../app/modules/start/view.js';
import { phoneSheetFor } from '../../app/modules/guide/tour.js';

const APP = new URL('../../app/', import.meta.url);
const read = (p) => readFileSync(new URL(p, APP), 'utf8');
const blank = (o = {}) => ({ ...answersFrom(defaults().household), ...o });
/** The text of every @media (max-width: 767px) { … } block in a stylesheet (comments removed). */
function phoneBlocks(css) {
  const s = css.replace(/\/\*[\s\S]*?\*\//g, ''), out = [];
  for (let i = s.indexOf('@media screen and (max-width: 767px)'); i >= 0; i = s.indexOf('@media screen and (max-width: 767px)', i + 1)) {
    let k = s.indexOf('{', i) + 1;
    for (let depth = 1; depth && k < s.length; k++) { if (s[k] === '{') depth++; else if (s[k] === '}') depth--; }
    out.push(s.slice(i, k));
  }
  return out.join('\n');
}

test('Start here: phone markup has a word "Close" and keeps Back / Skip / Next in the foot; desktop keeps the ✕', () => {
  const a = blank({ goal: 'resale', buyers: 2, ages: [30, 31], residency: ['SC', 'SC'] });
  const phone = questionHtml(1, a, { phone: true }), desk = questionHtml(1, a);
  assert.match(phone, /<button type="button" class="btn sm st-x" data-st="close">Close<\/button>/);
  assert.doesNotMatch(phone, /class="gp-x"/);
  assert.match(desk, /class="gp-x" data-st="close" aria-label="Skip for now">✕/);
  for (const html of [phone, desk]) assert.match(html, /<div class="st-foot">[\s\S]*data-st="back"[\s\S]*data-st="skip"[\s\S]*data-st="next"/);
  const route = routeFor(blank({ goal: 'retire' }), []);
  const done = doneHtml(blank({ goal: 'retire' }), null, route, { phone: true });
  assert.match(done, /data-st="done">Close</);
  assert.match(done, /from Your household or the Menu\./);
  assert.match(doneHtml(blank({ goal: 'retire' }), null, route), /from Your household or Learn\./, 'desktop copy unchanged');
});

test('every slice-E dialog is a .phone-full page; phones get "Close" (household: sticky Done)', () => {
  const src = {
    start: read('modules/start/index.js'), household: read('modules/household/index.js'), samples: read('modules/samples/index.js'),
    learn: read('modules/learn/index.js'), guide: read('modules/guide/index.js'), guides: read('modules/guides/index.js'),
  };
  assert.match(src.start, /className = 'start-dlg phone-full'/);
  assert.match(src.household, /className = 'drawer phone-full'/);
  assert.match(src.samples, /className = 'drawer phone-full'/);
  assert.match(src.learn, /className = 'sheet phone-full'/);
  assert.match(src.guide, /className = 'guide-picker phone-full'/);
  assert.match(src.guides, /className = 'sheet g-sheet phone-full'/);
  for (const [k, s] of Object.entries(src)) if (k !== 'start') assert.match(s, /isPhone\(\)/, `${k}: phone branch for the close button`);
  assert.match(src.household, /<div class="drawer-foot"><button class="btn primary" value="close">\$\{t\('Done'\)\}<\/button><\/div>/);
});

test('household money fields go through core/moneyinput (separators; the store still gets whole dollars)', () => {
  const s = read('modules/household/index.js');
  for (const path of ['buyers.${i}.income', 'buyers.${i}.cpfOa', "'cash'", "'otherDebts'", "'grantsOverride'"]) assert.ok(s.includes(`amt(${path.startsWith("'") ? path : `\`${path}\``}`), path);
  assert.match(s, /if \('money' in el\.dataset\) return parseMoney\(el\.value\)/);
  assert.match(s, /if \(Number\.isNaN\(v\)\) return;/, 'a value that cannot be read is not saved');
  assert.match(s, /bindMoneyInputs\(dlg\)/);
});

test('tour on a phone: Map-settings steps → sheet half, map steps → Map at peek, page steps leave the sheet alone', () => {
  assert.equal(phoneSheetFor({ inSheet: true, onMap: true, tab: 'explore' }), 'half');
  assert.equal(phoneSheetFor({ onMap: true, tab: 'explore' }), 'peek');
  assert.equal(phoneSheetFor({ tab: 'afford' }), null);
  assert.equal(phoneSheetFor({ tab: 'plan', found: false }), null);
  assert.equal(phoneSheetFor({ tab: 'explore', found: false }), 'half');
  assert.equal(phoneSheetFor({}), null, 'top bar / tab bar targets');
  assert.equal(phoneSheetFor({ onMap: true, tab: 'choices', found: false }), null, 'a page step whose desktop target is on the map (#drawerBar)');
  const spot = read('core/spotlight.js');
  assert.match(spot, /plan:show/, 'Plan folds open through plan:show');
  assert.match(spot, /#choicesView button\[data-v="list"\]/, 'Choices: back to the List view');
  assert.match(spot, /\.ms-area-btn/, 'Prices in view: the Area prices view');
  assert.match(read('modules/guide/tour.js'), /await locate\(step/, 'the tour and "Show me" share core/spotlight locate()');
  assert.doesNotMatch(read('modules/guide/tour.js'), /bus\?\.emit\('sheet:size', 'half'\); settle/, 'no more "half" for every page step');
});

test('phone CSS: offer, update toast and the guide pill sit above the tab bar, never at top 64 px; rem text only', () => {
  const css = Object.fromEntries(['guide', 'guides', 'offline', 'start', 'samples'].map((f) => [f, phoneBlocks(read(`styles/${f}.css`))]));
  const bottom = /bottom: calc\(56px \+ env\(safe-area-inset-bottom, 0px\) \+ 8px\)/;
  assert.match(css.guide, new RegExp(`\\.guide-offer \\{[^}]*${bottom.source}`));
  assert.match(css.offline, new RegExp(`\\.sw-toast \\{[^}]*${bottom.source}`));
  assert.match(css.guides, new RegExp(`\\.g-return \\{[^}]*${bottom.source}`));
  for (const [f, s] of Object.entries(css)) {
    assert.doesNotMatch(s, /\.(guide-offer|sw-toast|g-return) \{[^}]*top: 64px/, `${f}: nothing over the top bar`);
    assert.doesNotMatch(s, /font-size:\s*[\d.]+px/, `${f}: px font size in a phone rule`);
    for (const m of s.matchAll(/font-size:\s*([\d.]+)rem/g)) assert.ok(parseFloat(m[1]) >= 0.875, `${f}: font-size ${m[1]}rem under the 14 px floor`);
  }
  assert.match(css.start, /\.st-foot \{[^}]*position: sticky; bottom: 0/, 'Start here: sticky foot');
  assert.match(css.start, /\.st-head \{[^}]*position: sticky; top: 0/, 'Start here: sticky head');
  assert.match(css.samples, /#hhDialog \.drawer-foot \{[^}]*position: sticky; bottom: 0/, 'household: sticky Done');
});
