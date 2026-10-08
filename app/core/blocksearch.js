// Block autocomplete shared by Start here ("The home you own") and Rent & Buy ("Block (optional)") — Phase 7b B5 / B7.
// Same matching as Plan → Sell then buy (modules/plan/salerange.js) and the Explore search: street words
// abbreviated, "BLK" dropped, every typed word must start a word of "number street" (numbers exactly).
// Pure search + one small DOM binder (listbox with arrow keys, Enter, Escape, mouse). Reads data.js only.
import { esc } from './dom.js';

export const AC_MAX = 8; // suggestions shown (UI choice)

const ABBR = [['AVENUE', 'AVE'], ['STREET', 'ST'], ['ROAD', 'RD'], ['DRIVE', 'DR'], ['CRESCENT', 'CRES'], ['CLOSE', 'CL'], ['NORTH', 'NTH'], ['SOUTH', 'STH'], ['CENTRAL', 'CTRL']];
const titleCase = (s) => String(s).toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (_, a, c) => a + c.toUpperCase());

/** "123 Bishan St 12" for a data.js block. */
export const blockName = (hdb, bid) => { const b = hdb?.blocks?.[bid]; return b ? `${b.b} ${titleCase(hdb.streets[b.s])}` : ''; };
export const townTitle = (s) => titleCase(s || '');

export function normQuery(s) {
  let q = String(s || '').toUpperCase();
  for (const [a, b] of ABBR) q = q.replace(new RegExp(`\\b${a}\\b`, 'g'), b);
  return q.replace(/\bBLK\b|\bBLOCK\b/g, '').replace(/\s+/g, ' ').trim();
}
const wordHit = (str, toks) => { const words = str.split(/[^A-Z0-9]+/); return toks.every((k) => words.some((w) => (/^\d+$/.test(k) ? w === k : w.startsWith(k)))); };

/** Up to `max` block indices matching every word of q; `town` (data.js town name) narrows the search; street-first first. */
export function searchBlocks(hdb, q, { max = AC_MAX, town = null } = {}) {
  const n = normQuery(q);
  if (!hdb || !hdb.blocks || n.length < 2) return [];
  const ti = town ? hdb.towns.indexOf(town) : -1;
  const toks = n.split(' '), res = [];
  for (let i = 0; i < hdb.blocks.length && res.length < 40; i++) {
    const b = hdb.blocks[i];
    if (ti >= 0 && b.t !== ti) continue;
    const addr = `${b.b} ${hdb.streets[b.s]}`.toUpperCase();
    if (wordHit(addr, toks)) res.push({ i, first: addr.startsWith(toks[0]) ? 0 : 1 });
  }
  return res.sort((x, y) => x.first - y.first).slice(0, max).map((x) => x.i);
}

/** Markup: a text input with a listbox under it. `cls` marks the input for bindBlockSearch. */
export function blockInput({ cls, listId, value = '', placeholder = '' }) {
  return `<span class="ac"><input type="text" class="${cls}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${listId}" autocomplete="off" value="${esc(value)}" placeholder="${esc(placeholder)}"><span class="ac-list" id="${listId}" role="listbox"></span></span>`;
}

/**
 * Wire one autocomplete inside `root` (delegated, survives re-renders). getHdb() → data.js; town() → narrowing town
 * or null; onPick(bid) when a suggestion is chosen; onClear() when the input is emptied.
 */
export function bindBlockSearch(root, { cls, listId, getHdb, town = () => null, onPick, onClear = () => {} }) {
  let items = [], hi = -1;
  const input = () => root.querySelector(`.${cls}`), list = () => root.querySelector(`#${listId}`);
  function paint() {
    const box = list(), inp = input(); if (!box || !inp) return;
    const hdb = getHdb();
    box.innerHTML = items.map((bi, k) => `<span role="option" id="${listId}-${k}" data-i="${k}" aria-selected="${k === hi}" class="${k === hi ? 'hi' : ''}">${esc(blockName(hdb, bi))}<small>${esc(townTitle(hdb.towns[hdb.blocks[bi].t]))}</small></span>`).join('');
    box.classList.toggle('open', items.length > 0);
    inp.setAttribute('aria-expanded', String(items.length > 0));
    if (hi >= 0) inp.setAttribute('aria-activedescendant', `${listId}-${hi}`); else inp.removeAttribute('aria-activedescendant');
  }
  const reset = () => { items = []; hi = -1; paint(); };
  function pick(k) { const bi = items[k]; if (bi == null) return; reset(); onPick(bi); }
  root.addEventListener('input', (e) => {
    if (!e.target.classList?.contains(cls)) return;
    items = searchBlocks(getHdb(), e.target.value, { town: town() }); hi = items.length ? 0 : -1; paint();
    if (!e.target.value.trim()) onClear();
  });
  root.addEventListener('keydown', (e) => {
    if (!e.target.classList?.contains(cls) || !items.length) return;
    if (e.key === 'ArrowDown') { hi = (hi + 1) % items.length; paint(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hi = (hi - 1 + items.length) % items.length; paint(); e.preventDefault(); }
    else if (e.key === 'Enter') { pick(hi); e.preventDefault(); }
    else if (e.key === 'Escape') { reset(); e.preventDefault(); e.stopPropagation(); } // a dialog stays open
  });
  root.addEventListener('mousedown', (e) => { const d = e.target.closest?.(`#${listId} [data-i]`); if (d) { e.preventDefault(); pick(+d.dataset.i); } });
  root.addEventListener('focusout', (e) => { if (e.target.classList?.contains(cls)) setTimeout(reset, 150); });
}
