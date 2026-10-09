// Browser smoke test of the PUBLIC build (Autorun S5b), desktop 1280×800 + phone 375×812 (playwright.config.js).
// Every test runs under one guard (fixture `guard`, automatic): no console errors / page errors / CSP violations, only
// allowed hosts (this site, cdnjs for Leaflet, OneMap tiles — stubbed here with a 1×1 PNG, so CI never reaches OneMap;
// any other host is aborted and fails the test), and the privacy marker household (income 9137 / cash 151337) never in
// a request URL or body. Fixed data: the staged data/*.js and tests/fixtures/compare-seed.json (3 flats).
import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const SEED = JSON.parse(readFileSync(new URL('../fixtures/compare-seed.json', import.meta.url), 'utf8')).state;
export const MARK = { income: 9137, cash: 151337 };
const MARK_NUMS = new Set([String(MARK.income), String(MARK.cash)]);
const CDN = 'cdnjs.cloudflare.com';
const ONEMAP = 'www.onemap.gov.sg';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const TABS = ['afford', 'rent', 'plan', 'choices', 'explore'];

const decode = (s) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } };
/** Marker numbers in a text: whole digit runs only ("9,137" counts, a tile number that merely contains 9137 does not). */
export const markersIn = (text) => {
  const all = `${text}\n${decode(text)}`;
  return [...new Set((all.match(/\d[\d,]*\d|\d/g) || []).map((n) => n.replace(/,/g, '')).filter((n) => MARK_NUMS.has(n)))];
};

const test = base.extend({
  seeded: [false, { option: true }],
  guard: [async ({ page, context, baseURL, seeded }, use, testInfo) => {
    const own = new URL(baseURL).host;
    const log = { hosts: new Set(), blocked: [], leaks: [], errors: [] };
    // everything that is not this site: OneMap stubbed, cdnjs passed through, the rest aborted (and reported)
    await context.route((url) => url.host !== own, (route) => {
      const u = new URL(route.request().url());
      if (u.hostname === ONEMAP) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      if (u.hostname === CDN) return route.continue();
      log.blocked.push(u.href);
      return route.abort('blockedbyclient');
    });
    context.on('request', (r) => {
      const u = new URL(r.url());
      if (/^https?:$/.test(u.protocol)) log.hosts.add(u.host);
      const leaks = markersIn(`${r.url()}\n${r.postData() || ''}`);
      if (leaks.length) log.leaks.push(`${r.method()} ${r.url()} -> ${leaks.join(', ')}`);
    });
    page.on('websocket', (ws) => log.blocked.push(`websocket ${ws.url()}`));
    page.on('console', (m) => { if (m.type() === 'error') log.errors.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => log.errors.push(`pageerror: ${e.message}`));
    await context.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI || '(inline)'}`);
      });
    });
    if (seeded) {
      // the compare characterisation seed (3 flats) with the marker household as its v1.8 profile (migrated into the store)
      const state = { ...SEED, profile: { ...SEED.profile, income: MARK.income, cash: MARK.cash } };
      await context.addInitScript((raw) => {
        if (!localStorage.getItem('hdb-comparer') && !localStorage.getItem('sghf:v2')) localStorage.setItem('hdb-comparer', raw);
      }, JSON.stringify(state));
    }
    await use(log);
    const report = { errors: log.errors, blocked: log.blocked, leaks: log.leaks, hosts: [...log.hosts] };
    await testInfo.attach('guard.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
    expect.soft(log.errors, 'console errors / page errors / CSP violations').toEqual([]);
    expect.soft(log.blocked, 'requests to hosts outside the allow-list').toEqual([]);
    expect.soft([...log.hosts].filter((h) => ![own, CDN, ONEMAP].includes(h)), 'hosts').toEqual([]);
    expect.soft(log.leaks, 'marker household values in a request').toEqual([]);
  }, { auto: true }],
});

const isPhone = (testInfo) => testInfo.project.name === 'phone';

const OFFER = '#guideOffer'; // the one-time "New here? Take a short tour" card (modules/guide), 800 ms after ready
const notNow = (page) => page.evaluate((sel) => document.querySelector(`${sel} [data-a="later"]`)?.click(), OFFER);

/**
 * Open the app, wait for the map (boot overlay removed) and settle the first-visit popups in a fixed order:
 * firstRun: "Start here" opens by itself (no stored data) and is skipped with Esc; then the tour offer → "Not now".
 * keepStart: leave "Start here" open (its own test). A safety-net handler answers a late tour offer with "Not now".
 */
async function openApp(page, { firstRun = false, keepStart = false } = {}) {
  const safetyNet = () => page.addLocatorHandler(page.locator(OFFER), () => notNow(page), { noWaitAfter: true });
  await page.goto('./');
  await waitBoot(page);
  if (keepStart) return safetyNet();
  if (firstRun) {
    await expect(page.locator('#startDlg')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#startDlg')).toBeHidden();
  }
  await expect(page.locator(OFFER)).toBeVisible();
  await notNow(page);
  await expect(page.locator(OFFER)).toHaveCount(0);
  await safetyNet();
}
/** Map shown (boot overlay gone) and every late data file in (main.js marks 'data:all' right before 'data:ready'). */
async function waitBoot(page) {
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 30_000 });
  await page.waitForFunction(() => performance.getEntriesByName('data:all').length > 0, null, { timeout: 30_000 });
}
/** Click something that reloads the page, then wait for the app again. */
async function clickAndReload(page, locator) {
  const loaded = page.waitForEvent('load');
  await locator.click();
  await loaded;
  await waitBoot(page);
}
async function showTab(page, id) {
  await page.locator(`#tabbtn-${id}`).click();
  await expect(page.locator(`#tabbtn-${id}`)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`#tab-${id}`)).toHaveClass(/\bactive\b/);
}
/** Compare view: desktop = the drawer table, phone = My choices → Compare cards. */
async function openCompare(page, phone) {
  if (phone) {
    await showTab(page, 'choices');
    await page.locator('#choicesView [data-v="compare"]').click();
  } else {
    await page.locator('#drawerToggle').click();
    await expect(page.locator('#drawerToggle')).toHaveAttribute('aria-expanded', 'true');
  }
}
const rootPx = (page) => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));

test('loads clean and every tab switches', async ({ page }) => {
  await openApp(page, { firstRun: true });
  await expect(page.locator('#tabbtn-explore')).toHaveAttribute('aria-selected', 'true');
  for (const id of TABS) await showTab(page, id);
});

test('Start here opens and a sample household loads', async ({ page }) => {
  await openApp(page, { keepStart: true });
  const start = page.locator('#startDlg');
  await expect(start).toBeVisible();
  await start.getByRole('button', { name: 'Try a sample household instead' }).click();
  const picker = page.locator('#smpDialog');
  await expect(picker).toBeVisible();
  const load = picker.locator('[data-smp="load"]').first();
  await expect(load).toBeEnabled({ timeout: 30_000 }); // "Loading HDB data…" until the data is in
  await clickAndReload(page, load);
  await expect(page.locator('#sampleBanner')).toBeVisible();
  await expect(page.locator('#choiceCount')).not.toHaveText('0');
});

test('a block search opens the block card and Add to my choices works', async ({ page }, testInfo) => {
  await openApp(page, { firstRun: true });
  await page.locator('#mSearch').fill('406 Ang Mo Kio Ave 10');
  const hit = page.locator('#mList [data-i]').filter({ hasText: '406 Ang Mo Kio Ave 10' }).first();
  await hit.click();
  // phone: the card lives in the map sheet; desktop: the card dock over the map
  const card = page.locator(isPhone(testInfo) ? '#mapSheet' : '#cardDock');
  await expect(card).toBeVisible();
  await expect(card).toContainText('406 Ang Mo Kio Ave 10');
  await card.locator('[data-act="add"]').first().click();
  const quick = page.locator('.qa-add').first();
  await expect(quick).toBeVisible();
  await quick.click();
  await expect(page.locator('#choiceCount')).toHaveText('1');
});

test.describe('with the compare seed + marker household', () => {
  test.use({ seeded: true });

  test('Compare shows the 3 flats (cards on phone, table on desktop) and a Brief opens', async ({ page }, testInfo) => {
    const phone = isPhone(testInfo);
    await openApp(page);
    await expect(page.locator('#choiceCount')).toHaveText('3');
    await openCompare(page, phone);
    if (phone) {
      await expect(page.locator('#tab-choices .cc-card')).toHaveCount(3);
      await expect(page.locator('#cmpBody table')).toBeHidden();
      await page.locator('#tab-choices .cc-card').first().getByRole('button', { name: 'Brief' }).click();
    } else {
      await expect(page.locator('#cmpBody table.cmp')).toBeVisible();
      await expect(page.locator('#cmpBody .br-open')).toHaveCount(3);
      await page.locator('#cmpBody .br-open').first().click();
    }
    await expect(page.locator('dialog.brief-dlg')).toBeVisible();
  });

  test('About you opens with the household and a fill link focuses its field', async ({ page }, testInfo) => {
    await openApp(page);
    await page.locator('#hhChip').click();
    const hh = page.locator('#hhDialog');
    await expect(hh).toBeVisible();
    // the marker household is really in the app (so the request checks of the guard mean something)
    await expect.poll(async () => (await page.locator('#hh-buyers-0-income').inputValue()).replace(/\D/g, '')).toBe(String(MARK.income));
    await page.keyboard.press('Escape');
    await expect(hh).toBeHidden();
    await openCompare(page, isPhone(testInfo));
    let scope = page.locator('#cmpBody');
    if (isPhone(testInfo)) { // phone: the first card's "All rows" fold holds every row the desktop table has
      scope = page.locator('#tab-choices .cc-card').first();
      await scope.locator('summary', { hasText: 'All rows' }).click();
    }
    const link = scope.locator('.fill-link[data-fill="household"][data-field]:visible').first();
    const field = await link.getAttribute('data-field');
    await link.click();
    await expect(hh).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const a = document.activeElement;
      return a && document.querySelector('#hhDialog').contains(a) ? (a.closest('[data-path]') || a).dataset.path ?? null : null;
    })).toBe(field);
  });

  test('no horizontal scroll at 360 px', async ({ page }, testInfo) => {
    test.skip(!isPhone(testInfo), 'phone layout only');
    await page.setViewportSize({ width: 360, height: 780 });
    await openApp(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    for (const id of TABS) {
      await showTab(page, id);
      await expect.poll(overflow, { message: `horizontal scroll on ${id}` }).toBeLessThanOrEqual(0);
    }
    await openCompare(page, true);
    await expect(page.locator('#tab-choices .cc-card').first()).toBeVisible();
    await expect.poll(overflow, { message: 'horizontal scroll on Compare cards' }).toBeLessThanOrEqual(0);
  });
});

test('text size (Menu on phone, header on desktop) changes the root font', async ({ page }, testInfo) => {
  await openApp(page, { firstRun: true });
  const before = await rootPx(page);
  if (isPhone(testInfo)) {
    await page.locator('#phoneMenu').click();
    await expect(page.locator('#menuDlg')).toBeVisible();
    await page.locator('#menuDlg .ts-switch [data-ts="larger"]').click();
  } else {
    await page.locator('header .ts-switch [data-ts="larger"]').click();
  }
  await expect(page.locator('html')).toHaveClass(/\bts-larger\b/);
  await expect.poll(() => rootPx(page)).toBeGreaterThan(before);
});

test('中文: every string of the visited views is translated', async ({ page }, testInfo) => {
  await openApp(page, { firstRun: true });
  await clickAndReload(page, page.locator('header .lang-switch [data-v="zh"]'));
  await expect(page.locator('header .lang-switch [data-v="zh"]')).toHaveClass(/\bon\b/);
  for (const id of TABS) await showTab(page, id);
  await page.locator('#hhChip').click();
  await expect(page.locator('#hhDialog')).toBeVisible();
  await page.keyboard.press('Escape');
  if (isPhone(testInfo)) {
    await page.locator('#phoneMenu').click();
    await expect(page.locator('#menuDlg')).toBeVisible();
    await page.keyboard.press('Escape');
  }
  expect(await page.evaluate(() => window.__i18nMissing())).toEqual([]);
});
