// Offline copy (phase 6c AC 10): when the page registers the worker, the size text and the Learn-sheet line
// (modules/offline/status.js), plus 中文 for every string the offline module shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { swSupport, offlineBytes, sizeText, lineFor, LINES, ownScopes, ownCaches } from '../../app/modules/offline/status.js';

const loc = (href) => { const u = new URL(href); return { protocol: u.protocol, hostname: u.hostname, search: u.search }; };

test('register only on https or a local host, never on file:, not with ?nosw=1', () => {
  assert.equal(swSupport(loc('https://heng8835.github.io/sg-housing-finance/'), true), 'ok');
  assert.equal(swSupport(loc('http://localhost:8766/'), true), 'ok');
  assert.equal(swSupport(loc('http://127.0.0.1:8767/'), true), 'ok');
  assert.equal(swSupport(loc('http://app.localhost:3000/'), true), 'ok');
  assert.equal(swSupport(loc('http://localhost:8766/?nosw=1'), true), 'nosw');
  assert.equal(swSupport(loc('https://heng8835.github.io/sg-housing-finance/?lang=zh&nosw=1'), true), 'nosw');
  assert.equal(swSupport(loc('http://192.168.1.20:8766/'), true), 'insecure');
  assert.equal(swSupport({ protocol: 'file:', hostname: '', search: '' }, true), 'file');
  assert.equal(swSupport(loc('https://heng8835.github.io/sg-housing-finance/'), false), 'unsupported');
  assert.equal(swSupport(null, true), 'file');
});

test('size of the offline copy', () => {
  assert.equal(offlineBytes({ bytes: { shell: 1573079, data: 13534875 } }), 15107954);
  assert.equal(offlineBytes({}), null);
  assert.equal(offlineBytes(null), null);
  assert.equal(sizeText(15107954), '15 MB');
  assert.equal(sizeText(1573079), '1.6 MB');
  assert.equal(sizeText(20000), '0.1 MB');
  assert.equal(sizeText(null), '');
});

test('Learn line: saved / saving / off, and when "Reset offline copy" shows', () => {
  const big = 15107954;
  assert.deepEqual(lineFor({ support: 'ok', controlled: true, registered: true, bytes: big }), { text: LINES.saved, args: ['15 MB'], reset: true });
  assert.deepEqual(lineFor({ support: 'ok', controlled: true, registered: true, bytes: null }), { text: LINES.savedNoSize, args: [], reset: true });
  assert.deepEqual(lineFor({ support: 'ok', controlled: false, registered: true, bytes: big }), { text: LINES.saving, args: ['15 MB'], reset: true });
  assert.equal(lineFor({ support: 'ok', controlled: false, registered: false, bytes: null }).text, LINES.savingNoSize);
  assert.deepEqual(lineFor({ support: 'nosw', controlled: true, registered: false, bytes: big }), { text: LINES.nosw, args: [], reset: false });
  assert.equal(lineFor({ support: 'insecure', controlled: false, registered: false, bytes: big }).reset, false);
  assert.equal(lineFor({ support: 'unsupported', controlled: false, registered: false, bytes: big }).text, LINES.unsupported);
});

test('reset touches only this app: its scope and sghf- caches (github.io origins are shared)', () => {
  const base = 'https://heng8835.github.io/sg-housing-finance/';
  assert.deepEqual(ownScopes([base, 'https://heng8835.github.io/other/', `${base}sub/`], base), [base, `${base}sub/`]);
  assert.deepEqual(ownCaches(['sghf-shell-a', 'sghf-data-b', 'workbox-precache', 'other']), ['sghf-shell-a', 'sghf-data-b']);
});

test('every offline string has 中文 (zh.json; the map-tiles note in zh-explore.json)', () => {
  const zh = JSON.parse(readFileSync(new URL('../../app/i18n/zh.json', import.meta.url), 'utf8'));
  const zhx = JSON.parse(readFileSync(new URL('../../app/i18n/zh-explore.json', import.meta.url), 'utf8'));
  const src = readFileSync(new URL('../../app/modules/offline/index.js', import.meta.url), 'utf8');
  const used = [...src.matchAll(/\bt\('((?:[^'\\]|\\.)+)'/g)].map((m) => m[1]);
  assert.ok(used.length >= 5);
  for (const s of [...used, ...Object.values(LINES)]) assert.ok(zh[s], `zh.json: ${s}`);
  assert.ok(zhx['Map tiles need a connection. Your data, filters and comparison still work offline.']);
  for (const s of Object.values(LINES).filter((x) => x.includes('{0}'))) assert.ok(zh[s].includes('{0}'), `placeholder kept: ${s}`);
});
