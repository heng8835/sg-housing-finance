// Offline copy (phase 6c AC 10): the web app manifest, the service-worker file list (app/sw-manifest.json,
// built by tools/build_sw_manifest.py) and the builder itself (run on a temporary app folder).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DATA_FILES } from '../../app/core/data-loader.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const APP = join(ROOT, 'app');
const TOOL = join(ROOT, 'tools', 'build_sw_manifest.py');
const read = (p) => readFileSync(join(APP, p), 'utf8');
const swManifest = () => JSON.parse(read('sw-manifest.json'));

const PYTHON = ['python3', 'python'].find((cmd) => {
  try { return spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0; } catch { return false; }
});
const runTool = (args) => spawnSync(PYTHON, [TOOL, ...args], { encoding: 'utf8' });

test('manifest.webmanifest: installable, relative to the app folder (GitHub Pages sub-path), icons on disk', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.name, 'SG Housing & Finance');
  assert.ok(m.short_name && m.short_name.length <= 12);
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.equal(m.display, 'standalone');
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/i);
  assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
  const css = read('styles/base.css');
  assert.ok(css.includes(`--bg: ${m.background_color};`), 'background_color = the --bg token');
  assert.ok(css.includes(`--surface: ${m.theme_color};`), 'theme_color = the --surface token (white header)');
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any'));
  assert.ok(m.icons.some((i) => i.sizes === '192x192'));
  for (const i of m.icons) {
    assert.ok(!i.src.startsWith('/') && !/^https?:/.test(i.src), `relative icon url ${i.src}`);
    assert.ok(existsSync(join(APP, i.src)), `${i.src} exists`);
  }
  const png = readFileSync(join(APP, 'icons/icon-512.png'));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 512); // IHDR width
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<link rel="stylesheet" href="styles\/offline\.css">/);
  assert.match(html, /<link rel="icon" href="icons\/icon\.svg"/);
});

test('sw-manifest.json: valid, every precache path exists, no data / sw / docs in the shell list', () => {
  const m = swManifest();
  assert.match(m.version, /^[0-9a-f]{12}$/);
  assert.match(m.data_version, /^[0-9a-f]{12}$/);
  assert.ok(Array.isArray(m.shell) && Array.isArray(m.data) && Array.isArray(m.cdn));
  for (const p of [...m.shell, ...m.data]) {
    assert.ok(!p.startsWith('/') && !p.includes('..') && !/^https?:/.test(p), `relative path ${p}`);
    assert.ok(existsSync(join(APP, p)), `precache path ${p} exists — re-run python tools/build_sw_manifest.py`);
  }
  assert.equal(new Set(m.shell).size, m.shell.length, 'no duplicates');
  assert.deepEqual(m.shell.filter((p) => p.startsWith('data/')), [], 'app/data never in the shell list');
  for (const p of m.shell) {
    assert.ok(!/\.md$|CLAUDE|README|Dockerfile|^policy\/fragments\//.test(p), `not shipped offline: ${p}`);
    assert.ok(!['sw.js', 'sw-routes.js', 'sw-manifest.json'].includes(p), `${p} is fetched by the browser itself`);
  }
  for (const p of ['index.html', 'main.js', 'manifest.webmanifest', 'policy/sg-policy.json', 'core/i18n.js',
    'core/data-loader.js', 'modules/offline/index.js', 'styles/base.css', 'styles/offline.css', 'i18n/zh.json',
    'content/content.json', 'icons/icon-192.png']) assert.ok(m.shell.includes(p), `shell has ${p}`);
  assert.deepEqual(m.data, DATA_FILES.filter((f) => existsSync(join(APP, f))), 'data = DATA_FILES present on disk');
  assert.ok(m.data.every((p) => /^data\/[^/]+\.js$/.test(p)));
  assert.ok(m.cdn.length >= 2 && m.cdn.every((u) => u.startsWith('https://cdnjs.cloudflare.com/')), 'Leaflet from cdnjs only');
  assert.ok(!JSON.stringify(m).includes('onemap'), 'OneMap is never precached');
  assert.ok(m.bytes.data > m.bytes.shell && m.bytes.shell > 0);
  // the worker carries the same version (browsers only update a worker whose bytes changed)
  const sw = read('sw.js');
  assert.ok(sw.includes(`const VERSION = '${m.version}';`), 'sw.js stamped with the manifest version');
  assert.ok(sw.includes(`const DATA_VERSION = '${m.data_version}';`), 'sw.js stamped with the data version');
});

test('sw.js uses relative URLs only (works under /sg-housing-finance/)', () => {
  const sw = read('sw.js');
  assert.doesNotMatch(sw, /['"`]\/(?!\/)[^'"`]*['"`]/, 'no root-absolute URL strings');
  assert.match(sw, /importScripts\('sw-routes\.js'\)/);
  const code = sw.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(code, /onemap/i, 'no OneMap handling in the worker code (bypassed by sw-routes.js)');
});

test('sw-manifest.json is up to date with app/ (strict only with SW_MANIFEST_STRICT=1, e.g. before deploy)', (t) => {
  if (!PYTHON) return t.skip('python not found');
  const r = runTool(['--check']);
  if (r.status !== 0 && process.env.SW_MANIFEST_STRICT !== '1') {
    return t.skip('stale — run: python tools/build_sw_manifest.py (required before deploy)');
  }
  assert.equal(r.status, 0, r.stderr);
});

test('builder: deterministic, version follows the code, data_version follows the data, --check spots stale', (t) => {
  if (!PYTHON) return t.skip('python not found');
  const dir = mkdtempSync(join(tmpdir(), 'sghf-sw-'));
  const put = (p, text) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), text); };
  try {
    put('index.html', '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">\n'
      + '<link rel="stylesheet" href="styles/a.css">\n<script type="importmap">\n{ "imports": { "@core/": "./core/" } }\n</script>\n'
      + '<script type="module" src="main.js"></script>\n');
    put('main.js', "import { x } from '@core/x.js';\nimport('@core/gone.js');\n");
    put('core/x.js', 'export const x = 1;\n');
    put('core/data-loader.js', "export const DATA_FILES = ['data/data.js', 'data/missing.js'];\n");
    put('styles/a.css', 'body{}\n');
    put('manifest.webmanifest', '{}\n');
    put('policy/sg-policy.json', '{}\n');
    put('policy/fragments/topic.json', '{}\n');
    put('README.md', '# docs\n');
    put('data/data.js', 'window.HDB_DATA = {};\n');
    copyFileSync(join(APP, 'sw.js'), join(dir, 'sw.js'));
    copyFileSync(join(APP, 'sw-routes.js'), join(dir, 'sw-routes.js'));
    const build = () => { const r = runTool(['--app', dir]); assert.equal(r.status, 0, r.stderr); return r; };
    const man = () => JSON.parse(readFileSync(join(dir, 'sw-manifest.json'), 'utf8'));

    const first = build();
    assert.match(first.stderr, /core\/gone\.js: missing/, 'warns about an import that is not on disk');
    const m1 = man();
    assert.deepEqual(m1.shell, ['core/data-loader.js', 'core/x.js', 'index.html', 'main.js', 'manifest.webmanifest', 'policy/sg-policy.json', 'styles/a.css']);
    assert.deepEqual(m1.data, ['data/data.js']);
    assert.deepEqual(m1.cdn, ['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css']);
    assert.ok(readFileSync(join(dir, 'sw.js'), 'utf8').includes(`const VERSION = '${m1.version}';`));
    const bytes1 = readFileSync(join(dir, 'sw-manifest.json'), 'utf8');
    build();
    assert.equal(readFileSync(join(dir, 'sw-manifest.json'), 'utf8'), bytes1, 'same files → same output (no timestamps)');
    assert.equal(runTool(['--app', dir, '--check']).status, 0);

    put('core/x.js', 'export const x = 2;\n');
    assert.equal(runTool(['--app', dir, '--check']).status, 1, '--check fails on a changed file');
    build();
    const m2 = man();
    assert.notEqual(m2.version, m1.version, 'code change → new version');
    assert.equal(m2.data_version, m1.data_version, 'data unchanged → same data version');

    put('core/x.js', 'export const x = 2;\r\n');
    build();
    assert.equal(man().version, m2.version, 'CRLF vs LF does not change the version (Windows vs CI)');

    put('data/data.js', 'window.HDB_DATA = { v: 2 };\n');
    build();
    const m3 = man();
    assert.notEqual(m3.data_version, m2.data_version, 'data change → new data version');
    assert.equal(m3.version, m2.version, 'data change alone keeps the code version');
    assert.ok(readFileSync(join(dir, 'sw.js'), 'utf8').includes(`const DATA_VERSION = '${m3.data_version}';`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
