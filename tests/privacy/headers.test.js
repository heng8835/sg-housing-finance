// Security headers for static hosting (go-live §2.6): GitHub Pages cannot set response headers, so index.html carries
// a Content-Security-Policy + referrer policy as <meta>, and Leaflet from cdnjs is pinned with Subresource Integrity.
// The import map is an inline script: the CSP allows it by its sha256 — this test recomputes the hash, so editing the
// import map without updating the CSP fails here (and the app would not start in the browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// the HTML parser turns CRLF into LF before scripts are hashed, so hash the LF form
const HTML = readFileSync(new URL('../../app/index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const HEAD = HTML.slice(0, HTML.indexOf('</head>'));
const meta = (re) => (HTML.match(re) || [])[1];
const CSP = meta(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
const directives = Object.fromEntries((CSP || '').split(';').map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]));

test('CSP meta exists, comes before anything that loads, and locks scripts down', () => {
  assert.ok(CSP, 'Content-Security-Policy meta');
  const at = HEAD.indexOf('http-equiv="Content-Security-Policy"');
  for (const tag of ['<link', '<script', '<style']) {
    const first = HTML.indexOf(tag);
    assert.ok(first < 0 || at < first, `CSP before the first ${tag}`);
  }
  assert.deepEqual(directives['default-src'], ["'self'"]);
  assert.deepEqual(directives['object-src'], ["'none'"]);
  assert.deepEqual(directives['base-uri'], ["'self'"]);
  assert.deepEqual(directives['form-action'], ["'self'"]);
  assert.deepEqual(directives['worker-src'], ["'self'"]);
  for (const bad of ["'unsafe-inline'", "'unsafe-eval'", 'data:', 'blob:', '*', 'https:']) assert.ok(!directives['script-src'].includes(bad), `script-src without ${bad}`);
  assert.deepEqual(directives['connect-src'], ["'self'"], 'requests: this site only (the Daily places search is local)');
  assert.ok(directives['img-src'].includes('https://www.onemap.gov.sg'), 'OneMap tiles + logo (images only)');
  assert.ok(directives['img-src'].includes('https://cdnjs.cloudflare.com'), 'Leaflet CSS images');
  assert.ok(directives['script-src'].includes('https://cdnjs.cloudflare.com'), 'Leaflet JS');
  assert.ok(directives['style-src'].includes('https://cdnjs.cloudflare.com'), 'Leaflet CSS');
});

test('the CSP hash matches the inline import map exactly', () => {
  const scripts = [...HTML.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  const inline = scripts.filter(([, attrs]) => !/\bsrc=/.test(attrs));
  assert.equal(inline.length, 1, 'the import map is the only inline script');
  assert.match(inline[0][1], /type="importmap"/);
  const hash = `'sha256-${createHash('sha256').update(inline[0][2], 'utf8').digest('base64')}'`;
  assert.ok(directives['script-src'].includes(hash), `script-src must list ${hash} (edit the CSP meta in app/index.html)`);
});

test('no inline event handlers or javascript: URLs (they would need unsafe-inline)', () => {
  assert.deepEqual(HTML.match(/<[^>]+\son[a-z]+\s*=/gi) || [], []);
  assert.ok(!/javascript:/i.test(HTML));
});

test('every cross-origin script / stylesheet has SRI (sha384) + crossorigin=anonymous', () => {
  const tags = [...HTML.matchAll(/<(script|link)\b[^>]*(?:src|href)="(https?:[^"]+)"[^>]*>/g)].map((m) => m[0]);
  assert.equal(tags.length, 2, 'Leaflet JS + CSS');
  for (const tag of tags) {
    assert.match(tag, /integrity="sha384-[A-Za-z0-9+/]{64}"/, tag);
    assert.match(tag, /crossorigin="anonymous"/, tag);
    assert.match(tag, /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/1\.9\.4\//, 'version-pinned URL (the hash is for this exact file)');
  }
});

test('referrer policy: other sites see at most the origin, never the path', () => {
  assert.ok(['no-referrer', 'strict-origin', 'same-origin'].includes(meta(/<meta name="referrer" content="([^"]+)">/)));
});
