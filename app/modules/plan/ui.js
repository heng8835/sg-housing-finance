// Small view helpers shared by the Plan tab sections. Inputs carry data-p (store path) and data-k
// (kind: num | pct | date | bool | text); index.js turns a change into store.set(path, value).
import { esc } from '../../core/dom.js';
import { t, currentLang } from '../../core/i18n.js';
import { moneyInput, parseMoney } from '../../core/moneyinput.js';

export const field = (label, inner, cls = '') => `<label class="f${cls ? ` ${cls}` : ''}"><span>${label}</span>${inner}</label>`;
export const numIn = (path, val, attrs = '') => `<input type="number" inputmode="decimal" data-p="${path}" data-k="num" value="${val ?? ''}" ${attrs}>`;
/** Whole S$ with thousands separators (core/moneyinput.js; Q10) — the store still gets a plain number. */
export const moneyIn = (path, val, placeholder = '') => moneyInput({ value: val ?? null, placeholder, attrs: `data-p="${path}" data-k="money"` });
export const pctIn = (path, val, placeholder) => `<input type="number" inputmode="decimal" step="0.5" data-p="${path}" data-k="pct" value="${val == null ? '' : +(val * 100).toFixed(2)}" placeholder="${placeholder}">`;
export const dateIn = (path, val) => `<input type="date" data-p="${path}" data-k="date" value="${val ?? ''}">`;
/** translate=false for names (e.g. BTO projects) that must not go through t(). */
export const selIn = (path, opts, cur, kind = 'text', translate = true) => `<select data-p="${path}" data-k="${kind}">${opts.map(([v, l]) => `<option value="${esc(String(v))}"${String(v) === String(cur ?? '') ? ' selected' : ''}>${esc(translate ? t(l) : l)}</option>`).join('')}</select>`;

/** Tag for rules that are not read on an official page (same look as the Rent tab). */
export const badge = (status) => (status && status !== 'VERIFIED' ? ` <span class="tag ${status === 'ASSUMPTION' ? 'neutral' : 'warn'}" title="${esc(t('How sure we are about this rule'))}">${esc(t(status.toLowerCase()))}</span>` : '');

/** "Notes and assumptions" — closed inline fold (state kept by core/fold.js via ctx.fold). */
export const notesFold = (notes, key, fold) => (notes.length
  ? `<details class="fold-inline" data-fold="${key}"${fold(key, false)}><summary>${t('Notes and assumptions')}</summary><ul class="notes">${notes.map((n) => `<li>${esc(t(n))}</li>`).join('')}</ul></details>` : '');

/** Today as an ISO date (local calendar day). Modules may read the clock; engines may not. */
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "15 Mar 2029" / "2029年3月15日". */
export function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(currentLang() === 'zh' ? 'zh-SG' : 'en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Parse an input's value by kind; '' → null; undefined = not a valid value (leave the store as it is). */
export function readInput(el) {
  const v = el.value;
  switch (el.dataset.k) {
    case 'num': return v === '' ? null : +v;
    case 'money': { const n = parseMoney(v); return Number.isNaN(n) ? undefined : n; }
    case 'pct': return v === '' ? null : +v / 100;
    case 'bool': return v === '' ? null : v === 'true';
    case 'date': return v || null;
    case 'check': return el.checked;
    default: return v === '' ? null : v;
  }
}
