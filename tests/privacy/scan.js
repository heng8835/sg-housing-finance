// Static egress scan for tests/privacy/egress.test.js: every place in app/ (generated data/ excluded) that can send
// something off the page or print it — network APIs, navigation, console, workers, clipboard — plus every absolute
// URL host. Comments are stripped first so a mention in prose is not a call site. Not a test file itself.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_DIR = fileURLToPath(new URL('../../app/', import.meta.url));
const EXT = /\.(js|html|css|webmanifest)$/;

export const SINKS = {
  fetch: /\bfetch\s*\(/,
  fetchRef: /\bfetch\b(?!\s*\()/,
  xhr: /\bXMLHttpRequest\b/,
  beacon: /\bsendBeacon\b/,
  image: /\bnew\s+Image\s*\(/,
  websocket: /\bWebSocket\b/,
  eventsource: /\bEventSource\b/,
  importScripts: /\bimportScripts\s*\(/,
  worker: /\bnew\s+(?:Shared)?Worker\s*\(/,
  swRegister: /\.register\s*\(\s*['"`]/,
  srcAssign: /\.src\s*=(?!=)/,
  hrefAssign: /\.href\s*=(?!=)/,
  open: /\bwindow\.open\s*\(/,
  locationNav: /\blocation\.(?:assign|replace|reload)\s*\(|\blocation\s*=(?!=)/,
  history: /\bhistory\.(?:push|replace)State\s*\(/,
  postMessage: /\.postMessage\s*\(/,
  console: /\bconsole\.(?:log|info|debug|warn|error|trace|table|dir)\s*\(/,
  createEl: /createElement\(\s*['"`](?:script|img|iframe|link|form)['"`]/,
  remoteTag: /<(?:img|script|iframe|link|source|video|audio)\b[^>]*\b(?:src|href)\s*=\s*\\?["']?https?:/i,
  clipboard: /navigator\.clipboard/,
};

/** Files under app/ (posix, relative), data/ excluded. */
export function appFiles(dir = APP_DIR) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name), rel = relative(APP_DIR, p).split(sep).join('/');
      if (rel === 'data' || rel.startsWith('data/')) continue;
      if (statSync(p).isDirectory()) walk(p); else if (EXT.test(name)) out.push(rel);
    }
  };
  walk(dir);
  return out.sort();
}

// a comment opener only counts at the start of a line or after whitespace / punctuation — so 'content/*.md' or
// 'https://…' inside a string is not mistaken for one
const OPEN_BLOCK = /(^|[\s;{}(),=])\/\*/;
const LINE_COMMENT = /(^|[\s;{}(),])\/\/.*$/;

/** Source with comments blanked, line by line (line numbers kept). */
export function stripComments(text, file) {
  let s = text.replace(/\r\n/g, '\n');
  if (file.endsWith('.html')) return s.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  let inBlock = false;
  return s.split('\n').map((line) => {
    let l = line, out = '';
    for (;;) {
      if (inBlock) {
        const end = l.indexOf('*/');
        if (end < 0) return out;
        l = l.slice(end + 2); inBlock = false;
      }
      const m = OPEN_BLOCK.exec(l);
      if (!m) break;
      out += l.slice(0, m.index + m[1].length); l = l.slice(m.index + m[0].length); inBlock = true;
    }
    out += l;
    return file.endsWith('.js') ? out.replace(LINE_COMMENT, '$1') : out;
  }).join('\n');
}

/** [{ file, line, sink, text }] for every sink occurrence. */
export function findSinks(files = appFiles()) {
  const out = [];
  for (const file of files) {
    const lines = stripComments(readFileSync(join(APP_DIR, file), 'utf8'), file).split('\n');
    lines.forEach((text, i) => {
      for (const [sink, re] of Object.entries(SINKS)) {
        const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
        for (const _m of text.matchAll(g)) out.push({ file, line: i + 1, sink, text: text.trim() });
      }
    });
  }
  return out;
}

/** [{ file, line, host }] for every absolute http(s) URL in code / markup (comments stripped). */
export function findHosts(files = appFiles()) {
  const out = [];
  for (const file of files) {
    const lines = stripComments(readFileSync(join(APP_DIR, file), 'utf8'), file).split('\n');
    lines.forEach((text, i) => { for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+[a-z0-9])/gi)) out.push({ file, line: i + 1, host: m[1].toLowerCase() }); });
  }
  return out;
}
