// How a rule value from policy/sg-policy.json is shown to people (Learn glossary, guides, policy-change log).
// Pure apart from t(): ratios / rates → "30%", S$ → "S$16,000", other numbers → "25"; tables are not numbers.
import { esc, money } from './dom.js';
import { t } from './i18n.js';

/** Display text of a numeric rule value by its unit, or null when the value is not a number. */
export function ruleText(p) {
  const v = p && p.value, unit = String((p && p.unit) || '');
  if (typeof v !== 'number') return null;
  const cash = /S\$|SGD/.test(unit);
  if (/ratio|rate|fraction/i.test(unit) && !cash) return `${+(v * 100).toFixed(2)}%`;
  if (cash) return Number.isInteger(v) ? money(v) : `S$${v}`; // tariffs like S$0.2859 per kWh keep their decimals
  return v.toLocaleString('en-SG');
}

/**
 * Replace {policy:id} placeholders in HTML with the bold, dated value (title = status · from date).
 * Unknown / proposed / table values → "(see source)" / "(see the rules table)", never a thrown error.
 */
export function fillPolicy(htmlText, policy) {
  return fillPolicyTables(htmlText, policy).replace(/\{policy:([a-z0-9_.-]+)\}/gi, (_, id) => {
    if (id.startsWith('proposed.')) return `<i>${t('(see source)')}</i>`;
    let p; try { p = policy.meta(id); } catch { return `<i>${t('(see source)')}</i>`; }
    const shown = ruleText(p);
    if (shown == null) return `<i>${t('(see the rules table)')}</i>`;
    return `<b title="${esc(t('{0} · from {1}', [t(p.status.toLowerCase()), p.effective_from]))}">${shown}</b>`;
  });
}

/** A rule whose value is a table { row: { column: number } } (e.g. cpf.retirement_sums by year) → { rows, cols }, else null. */
export function ruleTable(p) {
  const v = p && p.value;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const rows = Object.keys(v);
  if (!rows.length || !rows.every((r) => v[r] && typeof v[r] === 'object' && !Array.isArray(v[r]))) return null;
  const cols = [...new Set(rows.flatMap((r) => Object.keys(v[r])))];
  return cols.length && rows.every((r) => cols.every((c) => v[r][c] == null || typeof v[r][c] === 'number')) ? { rows, cols } : null;
}

/**
 * Phase 7b (B15): a {policy:id} placeholder that is alone in its paragraph and whose value is a table becomes a small
 * table (cells formatted by the rule's unit, columns upper-cased: brs → BRS). Inline table placeholders keep the
 * "(see the rules table)" text of fillPolicy.
 */
export function fillPolicyTables(htmlText, policy) {
  return String(htmlText || '').replace(/<p>\s*\{policy:([a-z0-9_.-]+)\}\s*<\/p>/gi, (m, id) => {
    let p; try { p = policy.meta(id); } catch { return m; }
    const tb = ruleTable(p);
    if (!tb) return m;
    const cell = (v) => (v == null ? '—' : ruleText({ value: v, unit: p.unit }) ?? String(v));
    const years = tb.rows.every((r) => /^\d{4}$/.test(r));
    return `<table class="mini rule-table" title="${esc(t('{0} · from {1}', [t(p.status.toLowerCase()), p.effective_from]))}"><thead><tr><th>${years ? esc(t('Year')) : ''}</th>${tb.cols.map((c) => `<th>${esc(c.toUpperCase())}</th>`).join('')}</tr></thead><tbody>${
      tb.rows.map((r) => `<tr><td>${esc(r)}</td>${tb.cols.map((c) => `<td>${cell(p.value[r][c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  });
}

/** Policy ids used by {policy:id} placeholders in a text, in order, without duplicates. */
export const policyIdsIn = (text) => [...new Set([...String(text || '').matchAll(/\{policy:([a-z0-9_.-]+)\}/gi)].map((m) => m[1]))];

/** Short host for a source link: 'https://www.hdb.gov.sg/x' → 'hdb.gov.sg'. */
export const sourceHost = (url) => String(url || '').replace(/^https?:..(www\.)?/, '').split('/')[0];
