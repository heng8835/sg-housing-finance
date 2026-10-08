// Missing household inputs (H4): which fields a card needs that are still empty, and the inline prompt
// "Add income and age to see this. [Fill in here] [Set in household →]". Pure (no DOM); the buttons are
// wired by core/quickfill.js (bindNeeds). Paths are the household drawer's data-path values.
import { esc } from './dom.js';
import { t, currentLang } from './i18n.js';

/** Need ids → household paths ('*' = every buyer). */
export const NEEDS = { income: 'buyers.*.income', age: 'buyers.*.age', cpfOa: 'buyers.*.cpfOa', cash: 'cash' };

const WORD = { income: 'income', age: 'age', cpfOa: 'CPF OA balance', cash: 'cash savings' };
const FIELD = {
  income: { label: 'Buyer {0} income (S$ a month)', attrs: 'step="100" min="0"' },
  age: { label: 'Buyer {0} age', attrs: 'min="21" max="99"' },
  cpfOa: { label: 'Buyer {0} CPF OA balance (S$)', attrs: 'step="1000" min="0"' },
  cash: { label: 'Cash savings you can put in (S$)', attrs: 'step="1000" min="0"' },
};
const empty = (v) => v == null || v === '';

/** The field behind one path: { path, need, label, type, attrs } (null for an unknown path). */
export function describe(path) {
  const m = /^buyers\.(\d+)\.(income|age|cpfOa)$/.exec(path);
  if (m) return { path, need: m[2], label: t(FIELD[m[2]].label, [+m[1] + 1]), type: 'number', attrs: FIELD[m[2]].attrs };
  if (path === 'cash') return { path, need: 'cash', label: t(FIELD.cash.label), type: 'number', attrs: FIELD.cash.attrs };
  return null;
}

/**
 * Empty fields among `needs` (ids of NEEDS). '*' expands per buyer; CPF fields are skipped for foreigners
 * (they have no CPF). Never Pro-only fields.
 * @returns {{ path:string, need:string, label:string, type:'number', attrs:string }[]}
 */
export function missingFields(household, needs) {
  const h = household || {}, buyers = Array.isArray(h.buyers) ? h.buyers : [], out = [];
  for (const need of needs) {
    const path = NEEDS[need];
    if (!path) continue;
    if (path.startsWith('buyers.*.')) {
      const key = path.slice('buyers.*.'.length);
      buyers.forEach((b, i) => {
        if (!b || (need === 'cpfOa' && b.citizenship === 'F')) return;
        if (empty(b[key])) out.push(describe(`buyers.${i}.${key}`));
      });
    } else if (empty(h[path])) out.push(describe(path));
  }
  return out;
}

/** "income", "income and age", "income, age and cash savings" (中文: 、 and 和). */
export function needWords(list) {
  const words = [...new Set(list.map((f) => f.need))].map((n) => `<b>${esc(t(WORD[n]))}</b>`);
  if (words.length < 2) return words[0] || '';
  const sep = currentLang() === 'zh' ? '、' : ', ';
  return t('{0} and {1}', [words.slice(0, -1).join(sep), words.at(-1)]);
}

/**
 * Inline prompt HTML (empty string when nothing is missing).
 * @param {ReturnType<typeof missingFields>} list
 * @param {string} key  stable id, used to put the focus back after the tab re-renders
 * @param {{ compact?:boolean }} [opts]  compact = smaller box (e.g. in place of a KPI)
 */
export function needPrompt(list, key, { compact = false } = {}) {
  if (!list || !list.length) return '';
  return `<div class="need${compact ? ' compact' : ''}" role="note" data-need-key="${esc(key)}" data-fields="${esc(list.map((f) => f.path).join(','))}"><span class="need-ic" aria-hidden="true">ⓘ</span>
    <p>${t('Add {0} to see this.', [needWords(list)])}</p>
    <div class="need-act"><button type="button" class="btn sm" data-need="quick">${t('Fill in here')}</button>
      <button type="button" class="link" data-need="open" data-field="${esc(list[0].path)}">${t('Set in household →')}</button></div></div>`;
}
