// Map settings on phones, Phase 8 wave 8c (hdb-data-pipeline/docs/specs/mobile-revamp-ideas.md §3 M-03, M-04):
//   · M-03 "What else to show": the layers sit in 5 groups (./mapsheet.js LAYER_GROUPS); each group is ONE 56 px row —
//     a checkbox for the whole group, its name, a second line in words ("2 of 3 on", never an icon) — and [Choose],
//     which opens the group's own rows under it. Layer state is unchanged: the rows keep their `data-l` inputs (saved
//     views, tours, family.js), the group checkbox has no `data-l` and never reaches legacy's #layers listener.
//   · M-04 "Which flats": one summary line under the heading ("4-room, 5-room · ≤ S$700k · lease ≥ 70 y · 1 more
//     filter"), the quick chips first, the two-thumb year slider in an "Exact years" fold and the 10 min / max fields in
//     an "Exact numbers" fold (`<details data-fold>`, F6). Everything moves back at ≥ 768 px (desktop never changes).
// Pure helpers are exported for tests (tests/explore/mapsettings.test.js).
import { t } from '../../core/i18n.js';

/** A group's second line: 'All on' · 'Off' · '{0} of {1} on' (mixed state in words, M-03). */
export function groupLine(on, of, tr = t) {
  if (!of) return '';
  if (on >= of) return tr('All on');
  if (!on) return tr('Off');
  return tr('{0} of {1} on', [on, of]);
}

/** What a group checkbox does: all on → all off; anything less → all on. → { key: bool } for the members. */
export function groupToggle(keys, layers = {}) {
  const all = keys.length > 0 && keys.every((k) => !!layers[k]);
  return Object.fromEntries(keys.map((k) => [k, !all]));
}

/** Short money for the summary line: S$700k, S$1.2M (display only — the filter value itself is unchanged). */
export const shortMoney = (v) => (v >= 1e6 ? `S$${+(v / 1e6).toFixed(2)}M` : `S$${Math.round(v / 1000)}k`);

/** One worded part per active "More filters" row, in the panel's order (price, lease, area, storey, built). */
export function filterParts(f = {}, tr = t) {
  const has = (v) => v != null && v !== '';
  const span = (lo, hi, both, min, max) => (has(lo) && has(hi) ? tr(both, [lo, hi]) : has(hi) ? tr(max, [hi]) : has(lo) ? tr(min, [lo]) : null);
  const m = (v) => (has(v) ? shortMoney(+v) : v);
  return [
    span(m(f.pmin), m(f.pmax), '{0}–{1}', '≥ {0}', '≤ {0}'),
    span(f.lmin, f.lmax, 'lease {0}–{1} y', 'lease ≥ {0} y', 'lease ≤ {0} y'),
    span(f.amin, f.amax, '{0}–{1} sqm', '≥ {0} sqm', '≤ {0} sqm'),
    span(f.smin, f.smax, 'storey {0}–{1}', 'storey ≥ {0}', 'storey ≤ {0}'),
    span(f.ymin, f.ymax, 'built {0}–{1}', 'built from {0}', 'built up to {0}'),
  ].filter(Boolean);
}

/** The filters as at most `max` worded parts + "1 more filter" / "{0} more filters" (no count badge, M-04). */
export function filterWords(f, tr = t, max = 2) {
  const p = filterParts(f, tr);
  if (p.length <= max) return p;
  const more = p.length - max;
  return [...p.slice(0, max), more === 1 ? tr('1 more filter') : tr('{0} more filters', [more])];
}

/**
 * "Which flats" summary (M-04): flat types · filters · towns when not all. types = display names, allTypes = every
 * type picked, filt = S.filt, towns = [picked, of].
 */
export function flatsLine({ types = [], allTypes = false, filt = {}, towns = null, tr = t, maxTypes = 2 }) {
  const parts = [allTypes ? tr('All flat types') : !types.length ? tr('No flat types picked') : types.length > maxTypes ? tr('{0} flat types', [types.length]) : types.join(', ')];
  parts.push(...filterWords(filt, tr));
  if (towns && towns[0] !== towns[1]) parts.push(tr('{0} of {1} towns', towns));
  return parts.join(' · ');
}

// ------------------------------------------------------------------ DOM (browser)
/** Move nodes and put each back exactly where it was (reverse order). */
function mover() {
  const log = [];
  return {
    move(node, fn) { if (!node) return; log.push([node, node.parentNode, node.nextSibling]); fn(node); },
    restore() { while (log.length) { const [n, p, nx] = log.pop(); if (p) p.insertBefore(n, nx && nx.parentNode === p ? nx : null); } },
  };
}

/**
 * hooks: { setLayers({ key: bool }) — write S.layers, redraw, save (no zoom jump) }.
 * Returns { layersOn(on, groups), filtersOn(on), syncLayers(), flats(line), sumEl }.
 */
export function createMapSettings({ hooks }) {
  const $ = (id) => document.getElementById(id);
  const open = new Set(); // groups opened with [Choose] — kept across a phone ↔ desktop switch
  let rows = null, groupsEl = [], resetEl = null; /* resetEl: P8-09 */

  // ---- M-03 layer groups
  const visible = (lbl) => lbl && lbl.isConnected && lbl.style.display !== 'none';
  const members = (g) => g.keys.map((k) => $('layers')?.querySelector(`input[data-l="${k}"]`)).filter((i) => i && visible(i.closest('label')));
  function syncLayers() {
    for (const el of groupsEl) {
      const ins = members(el._g), on = ins.filter((i) => i.checked).length;
      el.hidden = !ins.length;
      const cb = el.querySelector('input[data-lg]');
      cb.checked = ins.length > 0 && on === ins.length;
      cb.indeterminate = on > 0 && on < ins.length; // P8-10: the native mixed state next to "2 of 3 on"
      el.querySelector('.ms-gs').textContent = groupLine(on, ins.length);
    }
  }
  function choose(el, show) {
    const btn = el.querySelector('.ms-gch'), list = el.nextElementSibling;
    if (show) open.add(el._g.h); else open.delete(el._g.h);
    btn.setAttribute('aria-expanded', String(show)); btn.textContent = t(show ? 'Hide' : 'Choose');
    list.hidden = !show;
  }
  /** groups: groupLayers() output ([{ h, keys }], ungrouped first). */
  function layersOn(on, groups = []) {
    const list = $('layers'); if (!list) return;
    if (on && !rows) {
      rows = mover();
      const extra = [...list.children].filter((c) => !c.matches('label.check')); // the family-layer sources note goes last
      groups.forEach((g, i) => {
        const lbls = g.keys.map((k) => list.querySelector(`:scope > label.check input[data-l="${k}"]`)?.closest('label')).filter(Boolean);
        if (!g.h) { lbls.forEach((l) => rows.move(l, (n) => list.append(n))); return; }
        const id = `msGroup${i}`, el = document.createElement('div');
        el.className = 'ms-grp'; el._g = g;
        el.innerHTML = `<label class="ms-gchk"><input type="checkbox" data-lg="${i}"><span class="ms-gt">${t(g.h)}<small class="ms-gs"></small></span></label><button type="button" class="btn ms-gch" aria-expanded="false" aria-controls="${id}">${t('Choose')}</button>`;
        const sub = document.createElement('div');
        sub.className = 'ms-grows'; sub.id = id; sub.hidden = true;
        list.append(el, sub); groupsEl.push(el);
        lbls.forEach((l) => rows.move(l, (n) => sub.append(n)));
        // the group switch: all on → all off, else all on; stopped here so legacy's #layers listener never sees it
        el.querySelector('input').addEventListener('change', (e) => { e.stopPropagation(); const ins = members(g); hooks.setLayers(groupToggle(ins.map((x) => x.dataset.l), Object.fromEntries(ins.map((x) => [x.dataset.l, x.checked])))); });
        el.querySelector('.ms-gch').addEventListener('click', () => choose(el, sub.hidden));
        if (open.has(g.h)) choose(el, true);
      });
      // P8-09: one quiet row for the hidden heading's "default" (all / none: the group switches)
      const reset = document.createElement('p');
      reset.className = 'ms-reset';
      reset.innerHTML = `<button type="button" class="link">${t('Back to the usual layers')}</button>`;
      reset.querySelector('button').addEventListener('click', () => $('layersDefault')?.click());
      list.append(reset); resetEl = reset;
      extra.forEach((c) => rows.move(c, (n) => list.append(n)));
      syncLayers();
    } else if (!on && rows) {
      rows.restore(); rows = null;
      resetEl?.remove(); resetEl = null;
      groupsEl.forEach((el) => { el.nextElementSibling?.remove(); el.remove(); }); groupsEl = [];
    }
  }

  // ---- M-04 "Exact years" / "Exact numbers" folds, quick chips first
  let filt = null;
  const fold = (key, label) => { const d = document.createElement('details'); d.className = 'ms-exact'; d.dataset.fold = key; d.innerHTML = `<summary>${t(label)}</summary>`; return d; };
  const chipLabel = (text) => { const p = document.createElement('p'); p.className = 'ms-chl'; p.textContent = t(text); return p; };
  const made = [];
  function filtersOn(on) {
    if (on && !filt) {
      filt = mover();
      // Sales history: years text · Last 5 y / 10 y / All · fold "Exact years" (slider)
      const range = document.querySelector('#secHistory .yr-range'), out = range?.querySelector('.yr-out');
      if (range && out) {
        const d = fold('ms-exact-years', 'Exact years'); made.push(d);
        filt.move($('histQuick'), (n) => out.after(n));
        $('histQuick').after(d);
        filt.move(range.querySelector('.yr-track'), (n) => d.append(n));
        filt.move(range.querySelector('.yr-ends'), (n) => d.append(n));
      }
      // More filters (Pro): price ceilings · lease floors · fold "Exact numbers" (the 10 fields)
      const body = document.querySelector('#secFilters > .body');
      if (body) {
        const pmax = body.querySelector('.chips [data-pmax]')?.parentElement, lmin = body.querySelector('.chips [data-lmin]')?.parentElement;
        const fields = [...body.children].filter((c) => c.matches('label.f, .fields'));
        const lp = chipLabel('Highest price'), ll = chipLabel('Remaining lease, at least'), d = fold('ms-exact-nums', 'Exact numbers');
        made.push(lp, ll, d);
        body.prepend(lp);
        filt.move(pmax, (n) => lp.after(n)); pmax?.after(ll);
        filt.move(lmin, (n) => ll.after(n)); lmin?.after(d);
        fields.forEach((f) => filt.move(f, (n) => d.append(n)));
      }
    } else if (!on && filt) {
      filt.restore(); filt = null;
      made.splice(0).forEach((el) => el.remove());
    }
  }

  // ---- "Which flats" line (under the heading; ./mapsheet.js places it)
  const sumEl = document.createElement('p');
  sumEl.className = 'ms-qsum';
  const flats = (line) => { sumEl.textContent = line || ''; };

  return { layersOn, filtersOn, syncLayers, flats, sumEl };
}

/** Every English string this file shows (zh coverage). */
export const uiStrings = () => ['All on', 'Off', '{0} of {1} on', 'Choose', 'Hide', '{0}–{1}', '≥ {0}', '≤ {0}',
  'lease {0}–{1} y', 'lease ≥ {0} y', 'lease ≤ {0} y', '{0}–{1} sqm', '≥ {0} sqm', '≤ {0} sqm', 'storey {0}–{1}', 'storey ≥ {0}', 'storey ≤ {0}',
  'built {0}–{1}', 'built from {0}', 'built up to {0}', '1 more filter', '{0} more filters', 'All flat types', 'No flat types picked', '{0} flat types',
  '{0} of {1} towns', 'Exact years', 'Exact numbers', 'Highest price', 'Remaining lease, at least', 'Back to the usual layers'];
