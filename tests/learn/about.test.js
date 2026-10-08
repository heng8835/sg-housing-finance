// Phase 7b About / Sources view (O15) + persistent disclaimer line (O14): the view lists every source with its
// licence, the version and data month, privacy text that matches the egress allow-list, and works in 中文;
// the disclaimer line is on every tab (panel footer on desktop, end of each tab on phones) and opens About.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aboutHtml, sourcesTable, discLineHtml, dataMonths, monthText, SOURCES, LICENCES, ABOUT_ID, ISSUES_URL } from '../../app/modules/learn/about.js';
import { appVersion } from '../../app/core/version.js';
import { fillPolicy, fillPolicyTables, ruleTable } from '../../app/core/policyfmt.js';
import { initI18n, missingStrings } from '../../app/core/i18n.js';
import { policy } from '../helpers.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const HDB = { months: ['2017-01', '2026-09'] };
const RENTS = { months: ['2021-01', '2026-08'] };
const META = { version: '2026.10', reviewed: '2026-10-07', reviewDue: '2027-01-01' };

test('About lists every source with its licence, the rules date, the version and the data month', () => {
  const html = aboutHtml({ policy: META, hdb: HDB, rents: RENTS, version: 'abc1234', btoOn: true });
  assert.equal((html.match(/<tr>/g) || []).length, SOURCES.length + 1, 'one row per source + the header');
  for (const s of SOURCES) { assert.ok(html.includes(s.data.replace('&', '&amp;')), s.data); assert.ok(LICENCES[s.licence], s.licence); }
  for (const name of Object.values(LICENCES)) assert.ok(html.includes(name), name);
  assert.ok(html.includes(`App abc1234 · data up to ${monthText('2026-09')}`), 'version + resale data month');
  assert.match(html, /Rules as of 2026-10-07 · next review 2027-01-01 · rules version 2026\.10\./);
  assert.ok(sourcesTable({ months: dataMonths({ hdb: HDB, rents: RENTS }), reviewed: META.reviewed }).includes(`<td>${monthText('2026-08')}</td>`), 'rents have their own month');
  assert.match(html, /not affiliated with HDB, CPF Board, IRAS, MAS or any government agency/);
  assert.match(html, /not financial advice/);
  assert.ok(html.includes(`href="${ISSUES_URL}"`));
  assert.match(html, /Never paste your income, CPF or savings\./);
  assert.doesNotMatch(html, /Not in this version/, 'private build: BTO data is in');
  assert.match(aboutHtml({ btoOn: false }), /BTO project details are not included in this version\./);
  for (const a of html.match(/<a\b[^>]*>/g)) assert.match(a, /target="_blank" rel="noopener"/);
  assert.match(aboutHtml({}), /App dev · data up to —/, 'no data yet: a dash, never a crash');
  assert.match(monthText('2026-09', 'en'), /^Sep\w* 2026$/);
  assert.equal(monthText('bad'), 'bad');
});

test('privacy text matches the egress allow-list: only map tiles (OneMap) and the map library leave', () => {
  const html = aboutHtml({ policy: META });
  assert.match(html, /Nothing leaves it except map tiles from OneMap\. No analytics, no accounts\./);
  assert.doesNotMatch(html, /address search/i, 'the place search is local since OneMap search needs a token');
  // every host the page actually requests (not link-only hosts) is named in the About text
  const block = read('tests/privacy/egress.test.js').match(/export const HOSTS = \{([\s\S]*?)\n\};/)[1];
  const HOSTS = Object.fromEntries([...block.matchAll(/'([^']+)': '([^']*)'/g)].map((m) => [m[1], m[2]]));
  const requested = Object.entries(HOSTS).filter(([, why]) => !/navigation on (tap|click) only|not a request/.test(why)).map(([h]) => h);
  assert.deepEqual(requested.sort(), ['cdnjs.cloudflare.com', 'www.onemap.gov.sg']);
  assert.ok(html.includes('cdnjs.cloudflare.com') && html.includes('OneMap'));
  assert.ok(/data-about-forget/.test(html) && /data-about-rules/.test(html) && /data-learn=""/.test(html), 'forget / rules / back links');
});

test('sources follow DATA_LICENCES.md (licence names and publishers)', () => {
  const md = read('DATA_LICENCES.md');
  for (const name of Object.values(LICENCES).filter((n) => !/^Facts/.test(n))) assert.ok(md.includes(name), `${name} in DATA_LICENCES.md`);
  for (const pub of ['HDB', 'LTA', 'URA', 'MOE', 'ECDA', 'MOH', 'NEA', 'NParks', 'OneMap', 'OpenStreetMap', 'PUB', 'Leaflet']) {
    assert.ok(md.includes(pub), pub);
    assert.ok(SOURCES.some((s) => `${s.data} ${s.from}`.includes(pub)), `About names ${pub}`);
  }
});

test('version: "dev" in the repo; stage_site.py stamps the SHA into the deployed copy', () => {
  assert.equal(appVersion(), 'dev');
  assert.match(read('app/config.js'), /^export const BUILD_SHA = 'dev';$/m);
  assert.match(read('tools/stage_site.py'), /stamp_sha\(out \/ "config\.js"/);
});

test('disclaimer line: panel footer + the end of every tab + the Compare drawer, each opening About', () => {
  const html = read('app/index.html');
  const tabs = [...html.matchAll(/<div class="tab[^"]*" id="tab-(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(tabs, ['explore', 'afford', 'rent', 'plan', 'choices']);
  tabs.forEach((id, i) => {
    const start = html.indexOf(`id="tab-${id}"`);
    const end = i + 1 < tabs.length ? html.indexOf(`id="tab-${tabs[i + 1]}"`) : html.indexOf('</aside>');
    const part = html.slice(start, end);
    const line = part.lastIndexOf('class="disc-line inline tab-end"');
    assert.ok(line > 0, `${id}: disclaimer line`);
    assert.doesNotMatch(part.slice(line), /class="section/, `${id}: the line is the last thing in the tab`);
  });
  const footer = html.slice(html.lastIndexOf('</div>', html.indexOf('</aside>')), html.indexOf('</aside>'));
  assert.match(footer, /<p class="disc-line" id="discLine"><span data-i18n>Educational estimates, not financial advice<\/span> · <button type="button" class="link" data-about data-i18n>About<\/button><\/p>/);
  assert.match(html, /id="cmpBody"><\/div>\s*<p class="disc-line inline cmp-disc">/);
  assert.equal((html.match(/data-about data-i18n>About</g) || []).length, 7, '5 tabs + footer + Compare drawer');
  const css = read('app/styles/modules.css');
  assert.match(css, /\.disc-line\.tab-end, \.disc-line\.learn-disc \{ display: none; \}/, 'desktop: footer only');
  assert.match(css, /@media \(max-width: 767px\) \{\s*#discLine \{ display: none; \}\s*\.disc-line\.tab-end, \.disc-line\.learn-disc \{ display: block; \}/, 'phone: end of each tab');
  const learn = read('app/modules/learn/index.js');
  assert.match(learn, /closest\('\[data-about\]'\)\) openSheet\(ABOUT_ID\)/, 'any [data-about] opens the About view');
  assert.match(learn, /About this app, sources and privacy →/, 'Learn index entry');
  assert.equal(ABOUT_ID, 'about');
  assert.match(discLineHtml('inline learn-disc'), /^<p class="disc-line inline learn-disc">Educational estimates, not financial advice · <button type="button" class="link" data-about>About<\/button><\/p>$/);
});

test('rule tables: a {policy:id} alone in its paragraph renders the BRS / FRS table from policy', () => {
  const p = policy.meta('cpf.retirement_sums');
  const tb = ruleTable(p);
  assert.ok(tb && tb.cols.includes('brs') && tb.cols.includes('frs'));
  const html = fillPolicy('<p>Sums:</p><p>{policy:cpf.retirement_sums}</p>', policy);
  assert.match(html, /<table class="mini rule-table"/);
  assert.match(html, /<th>BRS<\/th><th>FRS<\/th>/);
  const year = tb.rows[tb.rows.length - 1];
  assert.ok(html.includes(`<td>${year}</td><td>S$${p.value[year].brs.toLocaleString('en-SG')}</td>`), 'values from policy, formatted by unit');
  assert.match(fillPolicy('<p>amounts: {policy:cpf.retirement_sums}.</p>', policy), /\(see the rules table\)/, 'inline stays text');
  assert.equal(fillPolicyTables('<p>{policy:ratio.msr.cap}</p>', policy), '<p>{policy:ratio.msr.cap}</p>', 'numbers are not tables');
  const guide = JSON.parse(read('app/content/guides.json')).guides['retirement-housing'];
  assert.ok(guide.steps[1].body.includes('<p>{policy:cpf.retirement_sums}</p>'), 'retirement guide step 2 prints the table');
  const zh = JSON.parse(read('app/content/guides.zh.json')).guides['retirement-housing'];
  assert.ok(zh.steps[1].body.includes('<p>{policy:cpf.retirement_sums}</p>'), '中文 step 2 too');
});

test('中文: About, the disclaimer line and the rule table header are translated', async () => {
  globalThis.document ??= { documentElement: {} };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => ({ ok: true, json: async () => JSON.parse(read(`app/${u}`)) });
  try {
    await initI18n('zh');
    const before = new Set(missingStrings());
    const html = aboutHtml({ policy: META, hdb: HDB, rents: RENTS, version: 'abc1234', btoOn: false }) + discLineHtml() + fillPolicy('<p>{policy:cpf.retirement_sums}</p>', policy);
    const fresh = missingStrings().filter((s) => !before.has(s));
    assert.deepEqual(fresh, [], 'every About string has a 中文 entry');
    assert.match(html, /教育用途的估算，并非理财建议 · <button type="button" class="link" data-about>关于<\/button>/);
    assert.match(html, /应用版本 abc1234 · 数据截至 2026/);
    assert.match(html, /<th>年份<\/th>/);
    const zhe = JSON.parse(read('app/i18n/zh-explore.json'));
    assert.equal(zhe['Educational estimates, not financial advice'], '教育用途的估算，并非理财建议');
    assert.equal(zhe.About, '关于');
  } finally {
    await initI18n('en');
    globalThis.fetch = realFetch;
  }
});

test('rules date (go-live D1 = c): "Rules as of" before review_due, a warning after it; About repeats the warning', async () => {
  const { rulesStatus } = await import('../../app/modules/learn/about.js');
  const meta = { reviewed: '2026-10-07', reviewDue: '2026-12-31', version: '2026.10.1' };
  const fresh = rulesStatus(meta, '2026-10-08');
  assert.deepEqual(fresh, { overdue: false, text: 'Rules as of 2026-10-07' });
  assert.equal(rulesStatus(meta, '2026-12-31').overdue, false, 'the due date itself is still fine');
  const late = rulesStatus(meta, '2027-01-02');
  assert.equal(late.overdue, true);
  assert.match(late.text, /due for review/);
  assert.match(discLineHtml('inline', fresh), /Rules as of 2026-10-07<\/span> · <button[^>]*data-about/);
  assert.match(discLineHtml('inline', late), /class="tag warn"/);
  assert.doesNotMatch(aboutHtml({ policy: meta, hdb: HDB, rents: RENTS, today: '2026-10-08' }), /tag warn/);
  assert.match(aboutHtml({ policy: meta, hdb: HDB, rents: RENTS, today: '2027-01-02' }), /tag warn">Rules last checked 2026-10-07/);
  const zh = JSON.parse(read('app/i18n/zh.json'));
  for (const k of ['Rules as of {0}', 'Rules last checked {0} — due for review, some figures may be out of date']) assert.ok(zh[k], k);
});

test('donation link (DEC-019): hidden while DONATE_URL is empty, https only, shown in About when set', async () => {
  const { donateUrl } = await import('../../app/core/version.js');
  assert.equal(donateUrl(), '', 'repo default is empty');
  assert.equal(donateUrl('http://example.test'), '', 'https only');
  assert.equal(donateUrl('https://ko-fi.com/someone'), 'https://ko-fi.com/someone');
  assert.doesNotMatch(aboutHtml({ hdb: HDB, rents: RENTS }), /Support this project/);
  assert.match(aboutHtml({ hdb: HDB, rents: RENTS, donate: 'https://ko-fi.com/someone' }), /<h3>Support this project<\/h3>.*href="https:\/\/ko-fi\.com\/someone"/s);
});
