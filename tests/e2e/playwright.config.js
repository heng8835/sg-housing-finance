// Browser smoke test of the PUBLIC build (Autorun S5b). Own package (tests/e2e/package.json, @playwright/test pinned +
// lockfile) so app/ and the root `npm test` stay zero-dependency; files are *.spec.js so `node --test` never picks them up.
//   cd tests/e2e && npm ci && npx playwright install chromium && npx playwright test
// The web server stages the public site (tools/stage_site.py --public: btoData + floodData off) into E2E_SITE (default:
// <tmp>/sghf-e2e-site) and serves it with serve_site.py (python http.server) on 127.0.0.1:E2E_PORT (default 8791). Set
// E2E_SITE to an already staged folder plus E2E_NO_STAGE=1 to skip staging.
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const PORT = Number(process.env.E2E_PORT || 8791);
const SITE = process.env.E2E_SITE || join(tmpdir(), 'sghf-e2e-site');
const PY = process.env.E2E_PYTHON || 'python';
const q = (s) => `"${s}"`;
const stage = `${PY} ${q(join(ROOT, 'tools', 'stage_site.py'))} --public --out ${q(SITE)}`;
const serve = `${PY} ${q(join(ROOT, 'tests', 'e2e', 'serve_site.py'))} ${PORT} ${q(SITE)}`; // http.server, bigger backlog
const CI = !!process.env.CI;

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    serviceWorkers: 'block', // the offline copy would pre-cache ~16 MB in the background; tests/pwa covers sw.js
    locale: 'en-SG',
    timezoneId: 'Asia/Singapore',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    {
      name: 'phone',
      use: {
        ...devices['Pixel 7'], // Chromium mobile emulation (touch, mobile UA); size as the owner's phone checks
        viewport: { width: 375, height: 812 },
        screen: { width: 375, height: 812 },
      },
    },
  ],
  webServer: {
    command: process.env.E2E_NO_STAGE ? serve : `${stage} && ${serve}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
