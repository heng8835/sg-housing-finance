// Money fields with thousands separators (phone overhaul §3.5, owner default Q10 — phone and desktop): a text field
// with inputmode="numeric" that shows "600,000" while you type, and on phones a fixed "S$" inside the box
// (styles/phone-pages.css .money-in). The engines still get plain whole-dollar numbers: parseMoney("S$ 600,000") →
// 600000. Pure helpers first (tests/core/moneyinput.test.js); the DOM binder at the end touches only the root it is
// given. No number shown anywhere is computed here — this file only reads and writes what the user types.

/** Longest whole-dollar amount accepted (S$ 999 billion; keeps every value a safe integer). */
export const MONEY_MAX_DIGITS = 12;

// full-width digits and punctuation from a Chinese IME → ASCII ("６０００００" → "600000", "，" → ",")
const ascii = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48))
  .replace(/，/g, ',').replace(/．/g, '.').replace(/＄/g, '$').replace(/－/g, '-');
const SPACES = /[\s   ]/g;
const group = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * What the user typed or pasted → whole dollars. '' / spaces → null; anything that is not a whole, non-negative
 * amount → NaN (negative, decimals other than ".00", letters, too long). Accepts "S$", "$" or "SGD" in front,
 * commas and spaces anywhere between digits ("600 000", "6,00,000"), full-width digits.
 * @param {string|number|null|undefined} s
 * @returns {number|null}  NaN = not valid
 */
export function parseMoney(s) {
  if (s == null) return null;
  if (typeof s === 'number') return Number.isSafeInteger(s) && s >= 0 ? s : NaN;
  let x = ascii(String(s)).replace(SPACES, '');
  if (x === '') return null;
  x = x.replace(/^(?:S\$|SGD|\$)/i, '');
  if (x === '') return NaN;
  x = x.replace(/,/g, '').replace(/\.0{1,2}$/, ''); // "600,000.00" is whole dollars
  if (!/^\d+$/.test(x)) return NaN;
  x = x.replace(/^0+(?=\d)/, '');
  if (x.length > MONEY_MAX_DIGITS) return NaN;
  return Number(x);
}

/** A stored value → the field's text: 600000 → "600,000"; null / '' → ''. A non-number string is returned as it is. */
export function formatMoney(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    const neg = v < 0 ? '-' : '';
    const [int, frac] = String(Math.abs(v)).split('.');
    return /e/i.test(int) ? String(v) : `${neg}${group(int)}${frac ? `.${frac}` : ''}`; // a stored decimal is shown, not rounded
  }
  const n = parseMoney(v);
  return Number.isFinite(n) ? group(String(n)) : String(v);
}

/**
 * Re-format while typing without moving the caret off the digit it was next to.
 * Text with a '.', '-' or a letter is left exactly as typed (parseMoney says NaN; the field shows it as invalid).
 * @param {string} text  the field's value after the keystroke / paste
 * @param {number} caret  selectionStart after the keystroke
 * @returns {{ text:string, caret:number }}
 */
export function formatTyping(text, caret = String(text ?? '').length) {
  const raw = ascii(String(text ?? ''));
  const body = raw.replace(SPACES, '').replace(/^(?:S\$|SGD|\$)/i, '');
  if (/[^\d,]/.test(body)) return { text: String(text ?? ''), caret };
  const before = (raw.slice(0, Math.max(0, caret)).match(/\d/g) || []).length;
  const all = raw.replace(/\D/g, '');
  const lead = all.length - all.replace(/^0+(?=\d)/, '').length; // "007" → "7"
  const digits = all.slice(lead).slice(0, MONEY_MAX_DIGITS);
  const out = group(digits);
  let want = Math.min(Math.max(0, before - lead), digits.length), pos = 0;
  if (want > 0) { for (let seen = 0; pos < out.length; pos++) if (/\d/.test(out[pos]) && ++seen === want) { pos++; break; } }
  return { text: out, caret: pos };
}

/**
 * Backspace / Delete next to a separator removes the digit beyond it (otherwise the comma would come straight back).
 * Returns null when the key is not next to a separator (let the browser handle it).
 * @param {string} text  @param {number} caret  @param {'back'|'forward'} dir
 * @returns {{ text:string, caret:number }|null}
 */
export function deleteAcrossComma(text, caret, dir) {
  const s = String(text ?? '');
  if (dir === 'back' && caret >= 2 && s[caret - 1] === ',') return formatTyping(s.slice(0, caret - 2) + s.slice(caret - 1), caret - 2);
  if (dir === 'forward' && s[caret] === ',' && caret + 1 < s.length) return formatTyping(s.slice(0, caret + 1) + s.slice(caret + 2), caret);
  return null;
}

const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The field: `<span class="money-in"><input type="text" inputmode="numeric" data-money …></span>`.
 * @param {{ value?:number|null, placeholder?:string, attrs?:string }} x
 *   attrs = the field's own raw attributes, written as in markup (`id="afPrice"`, `data-p="plan.current.salePrice"
 *   data-k="money"`) so tours and tests still find the id in the module source; value is formatted here.
 */
export function moneyInput({ value = null, placeholder = '', attrs = '' } = {}) {
  return `<span class="money-in"><input type="text" inputmode="numeric" autocomplete="off" spellcheck="false" data-money value="${attr(formatMoney(value))}"${placeholder ? ` placeholder="${attr(placeholder)}"` : ''}${attrs ? ` ${attrs}` : ''}></span>`;
}

/** The value of a money field: number, null (empty) or NaN (not valid). */
export const moneyValue = (input) => parseMoney(input && input.value);

/**
 * Live separators + caret for every `input[data-money]` inside root (delegated, so re-rendered markup needs no
 * re-binding). Marks a field aria-invalid while it cannot be read; the owner's own 'change' listener reads
 * moneyValue() and ignores NaN. Call once per root.
 * @param {Element} root
 */
export function bindMoneyInputs(root) {
  const isMoney = (x) => x && x.matches && x.matches('input[data-money]');
  const put = (x, r) => {
    if (r.text !== x.value) x.value = r.text;
    try { x.setSelectionRange(r.caret, r.caret); } catch { /* not focused */ }
  };
  root.addEventListener('beforeinput', (e) => {
    const x = e.target;
    if (!isMoney(x) || x.selectionStart !== x.selectionEnd) return;
    const dir = e.inputType === 'deleteContentBackward' ? 'back' : e.inputType === 'deleteContentForward' ? 'forward' : null;
    const r = dir && deleteAcrossComma(x.value, x.selectionStart, dir);
    if (!r) return;
    e.preventDefault();
    put(x, r);
    x.dispatchEvent(new Event('input', { bubbles: true }));
  });
  root.addEventListener('input', (e) => {
    const x = e.target;
    if (!isMoney(x) || e.isComposing) return;
    put(x, formatTyping(x.value, x.selectionStart ?? x.value.length));
    const bad = Number.isNaN(parseMoney(x.value));
    if (bad) x.setAttribute('aria-invalid', 'true'); else x.removeAttribute('aria-invalid');
  });
}
