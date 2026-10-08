// Translation (English ↔ Simplified Chinese). English text is the key (gettext style), so untranslated
// strings simply show in English. Dictionaries: i18n/<lang>.json → { "English": "中文", ... }.
//
// t('Most you can pay')                        → exact lookup
// t('{0} to {1}', [dist, name])                → template with values
// t('Short of S$19,400 for the upfront payment') → no exact entry: numbers / money / percentages are
//   swapped for {0},{1}… ("Short of {0} for the upfront payment"), looked up, and put back. This lets
//   engine messages with live numbers be translated without changing the engines.
// Static HTML: elements with data-i18n get their text translated (data-i18n="Key" → that key); data-i18n-attr="placeholder,title"
// translates those attributes.

let dict = {};
let lang = 'en';
const missing = new Set();
const NUM = /S\$\s?\d+(?:,\d{3})*(?:\.\d+)?k?|[+-]?\d+(?:,\d{3})*(?:\.\d+)?(?:\s?%)?/g;

export const LANGS = { en: 'English', zh: '中文' };
const DICTS = ['-guide', '', '-explore', '-engine']; // tour first: it never overrides an app translation
export const currentLang = () => lang;

export async function initI18n(code) {
  lang = LANGS[code] ? code : 'en';
  document.documentElement.lang = lang === 'zh' ? 'zh-Hans-SG' : 'en-SG';
  if (lang === 'en') { dict = {}; return; }
  // one dictionary per area so translators don't collide: core/new modules, explore (map + compare), engine messages
  const parts = await Promise.all(DICTS.map((name) => fetch(`i18n/${lang}${name}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))));
  dict = Object.assign({}, ...parts);
  if (!Object.keys(dict).length) lang = 'en';
}

const fill = (s, vals) => (vals ? s.replace(/\{(\w+)\}/g, (m, k) => (vals[k] ?? m)) : s);

export function t(text, vals) {
  if (text == null || lang === 'en') return fill(String(text ?? ''), vals);
  const s = String(text);
  if (dict[s] != null) return fill(dict[s], vals);
  if (!vals) {
    const found = [];
    const tpl = s.replace(NUM, (m) => `{${found.push(m) - 1}}`);
    if (found.length && dict[tpl] != null) return fill(dict[tpl], found);
  }
  if (s.trim() && /[A-Za-z]/.test(s)) missing.add(s);
  return fill(s, vals);
}

/** Translate static markup once at start-up (English originals kept in data attributes). data-i18n="Key" uses that key
 *  instead of the text — for a short English word that needs another translation (phone tab "Afford" → 负担). */
export function applyStatic(root = document) {
  if (lang === 'en') return;
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n || el.textContent.trim()); });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const a of el.dataset.i18nAttr.split(',').map((x) => x.trim())) if (el.hasAttribute(a)) el.setAttribute(a, t(el.getAttribute(a)));
  });
}

/** Strings seen without a translation (for the translator / tests). */
export const missingStrings = () => [...missing];
globalThis.__i18nMissing = missingStrings;
