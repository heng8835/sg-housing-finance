// Service-worker rules (phase 6c, offline copy) — pure: no caches, no fetch, no DOM. A classic script so
// sw.js can importScripts() it in every browser; tests/pwa load it with node:vm. Exposes self.SWRoutes.
//
// Routes:  'network-first'  same-origin code / HTML / JSON / CSS / icons (and data on local dev hosts)
//          'data'           data/*.js — cache-first, cache named after the data version
//          'cdn'            cdnjs.cloudflare.com (Leaflet) — network-first, cached
//          'bypass'         not handled: OneMap tiles (third party), other hosts,
//                           non-GET, sw.js / sw-routes.js themselves, paths outside the app's scope
(function (root) {
  'use strict';

  const PREFIX = 'sghf-';
  const CDN_HOSTS = ['cdnjs.cloudflare.com'];
  const SELF = ['sw.js', 'sw-routes.js'];
  const DEV_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];
  const DATA_PATH = /^data\/[^/]+\.js$/;

  /** Path of url inside scope ('' = the app root), or null when outside it / unparsable. */
  function relPath(url, scope) {
    let u, s;
    try { u = new URL(url); s = new URL(scope); } catch (e) { return null; }
    if (u.origin !== s.origin || !u.pathname.startsWith(s.pathname)) return null;
    try { return decodeURIComponent(u.pathname.slice(s.pathname.length)); } catch (e) { return null; }
  }

  /** Local development host (tools/serve.py, preview): data is network-first there, so a rebuilt data file
   *  shows on a normal reload even before tools/build_sw_manifest.py has run. */
  function isDevHost(scope) {
    try { return DEV_HOSTS.includes(new URL(scope).hostname); } catch (e) { return false; }
  }

  /** Strategy for one request: { url, method } against the registration scope. */
  function routeFor(req, scope) {
    if (String(req.method || 'GET').toUpperCase() !== 'GET') return 'bypass';
    let u, s;
    try { u = new URL(req.url); s = new URL(scope); } catch (e) { return 'bypass'; }
    if (u.origin !== s.origin) return u.protocol === 'https:' && CDN_HOSTS.includes(u.hostname) ? 'cdn' : 'bypass';
    const rel = relPath(req.url, scope);
    if (rel == null || SELF.includes(rel)) return 'bypass';
    if (DATA_PATH.test(rel)) return isDevHost(scope) ? 'network-first' : 'data';
    return 'network-first';
  }

  /** Cache key: absolute URL without query or fragment; the app root ('./') is stored as index.html. */
  function keyFor(url, scope) {
    const u = new URL(url, scope);
    u.search = ''; u.hash = '';
    return relPath(u.href, scope) === '' ? new URL('index.html', scope).href : u.href;
  }

  /** Cache names for a build (VERSION / DATA_VERSION are stamped into sw.js by tools/build_sw_manifest.py). */
  function cacheNames(version, dataVersion) {
    return { shell: PREFIX + 'shell-' + version, data: PREFIX + 'data-' + dataVersion };
  }

  /** Our caches that a new worker no longer needs. Old data caches stay until the new data cache is complete,
   *  so an offline visit in between still has the last data. */
  function staleCaches(names, keep, dataComplete) {
    return names.filter((n) => n.startsWith(PREFIX) && !keep.includes(n)
      && (dataComplete || !n.startsWith(PREFIX + 'data-')));
  }

  /** Worth storing: a full OK response (cdn may be opaque); never partial content or errors. */
  function storable(res, route) {
    if (!res) return false;
    if (route === 'cdn' && res.type === 'opaque') return true;
    return res.ok === true && res.status === 200 && (res.type === 'basic' || res.type === 'cors' || res.type === 'default');
  }

  root.SWRoutes = { PREFIX, CDN_HOSTS, relPath, isDevHost, routeFor, keyFor, cacheNames, staleCaches, storable };
})(typeof self !== 'undefined' ? self : globalThis);
