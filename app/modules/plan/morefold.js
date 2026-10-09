// Plan — "essentials first" (Phase 8 M-16, mobile-revamp-ideas.md §3): the few fields a first answer needs stay in
// view, the answer comes right under them, and the fields that only refine it sit in one fold titled with a count and
// what is used while they are blank ("Make it more accurate (6)"). Same fields, same store paths, same engine: only
// which fields show first changes (Sev-1: no number moves). Pure (node tests: tests/plan/essentials.test.js).
import { t } from '../../core/i18n.js';
import { esc } from '../../core/dom.js';

/** Count the non-empty field chunks (each one HTML string). */
export const countFields = (items) => items.filter((x) => x && String(x).trim()).length;

/**
 * The fold: `<details class="fold p8-more" data-fold="key">` with "Make it more accurate (N)" and a sub line.
 * items = field HTML strings ('' skipped); extra = HTML after the fields (a hint); fold = ctx.fold (keepFolds attr).
 * '' when there is nothing to put in it.
 */
export function moreFold({ key, items, sub = '', extra = '', fold = () => '', title = 'Make it more accurate ({0})' }) {
  const list = items.filter((x) => x && String(x).trim());
  if (!list.length) return '';
  return `<details class="fold p8-more" data-fold="${esc(key)}"${fold(key, false)}><summary><span class="fold-t">${t(title, [list.length])}</span>`
    + `${sub ? `<span class="fold-s">${esc(sub)}</span>` : ''}</summary><div class="fold-body"><div class="fields">${list.join('')}</div>${extra}</div></details>`;
}

/** A plain fold (no field grid) with the same look: e.g. "Order and timeline". */
export function plainFold({ key, title, sub = '', body, fold = () => '' }) {
  return `<details class="fold p8-more" data-fold="${esc(key)}"${fold(key, false)}><summary><span class="fold-t">${esc(title)}</span>`
    + `${sub ? `<span class="fold-s">${esc(sub)}</span>` : ''}</summary><div class="fold-body">${body}</div></details>`;
}

/** Every English string here (zh coverage). */
export const moreFoldStrings = () => ['Make it more accurate ({0})'];
