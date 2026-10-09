// Explore — the calculation window ("Prices from the last N years", under the legend) and the sales-history
// year slider (hdb-data-pipeline/docs/specs/phase5-accept1-design.md §5.2).
// Sev-1: legacy keeps reading S.mFrom / S.mTo for the colours, tiles, Prices box and hand-off price; this file
// only derives them. Defaults (1 year, last 10 years) give exactly today's window [NM − 12, NM − 1].
// Pure helpers first (tests/explore/period.test.js); mountPeriod() wires the side-panel controls (browser).
import { t } from '../../core/i18n.js';

export const CALC_OPTIONS = [12, 24, 36, 60];   // months — UI choices, not policy
export const CALC_DEFAULT = 12;
export const HIST_YEARS = 10;                   // default slider span: the last 10 calendar years
const CALC_LABEL = { 12: '1 year', 24: '2 years', 36: '3 years', 60: '5 years' };

/** "1 year" … "5 years" for a calculation window in months. */
export const calcLabel = (m) => t(CALC_LABEL[m] || CALC_LABEL[CALC_DEFAULT]);
/** Nearest option to a month span (ties → the shorter window). */
export const nearestCalc = (span) => CALC_OPTIONS.reduce((best, o) => (Math.abs(o - span) < Math.abs(best - span) ? o : best), CALC_OPTIONS[0]);
/** First and last calendar year in the data's month list ('YYYY-MM', ascending). */
export const yearsOf = (months) => ({ first: +String(months[0]).slice(0, 4), last: +String(months[months.length - 1]).slice(0, 4) });

/** Default slider: the last HIST_YEARS years, clamped to the data's first year. */
export function histDefault(months) {
  const { first, last } = yearsOf(months);
  return { from: Math.max(first, last - (HIST_YEARS - 1)), to: last };
}

/** Whole years inside the data, from ≤ to. */
export function clampHist(hist, months) {
  const { first, last } = yearsOf(months), d = histDefault(months);
  const to = Math.min(last, Math.max(first, Math.round(Number.isFinite(+hist?.to) ? +hist.to : d.to)));
  const from = Math.min(to, Math.max(first, Math.round(Number.isFinite(+hist?.from) ? +hist.from : d.from)));
  return { from, to };
}

/** Month indices covered by the slider: first month ≥ Jan `from`, last month ≤ Dec `to`. */
export function histRange(months, hist) {
  const a = `${hist.from}-01`, b = `${hist.to}-12`;
  let hi = -1;
  for (let i = months.length - 1; i >= 0; i--) if (months[i] <= b) { hi = i; break; }
  if (hi < 0) hi = 0;
  let lo = months.findIndex((m) => m >= a);
  if (lo < 0 || lo > hi) lo = hi;
  return { from: lo, to: hi };
}

/**
 * The calculation window: mTo = min(NM − 1, Dec hist.to), mFrom = max(Jan hist.from, mTo − calcM + 1).
 * `clipped` = the slider's first year cut the window short.
 */
export function windowFor({ months, calcM, hist }) {
  const r = histRange(months, hist);
  const mTo = Math.min(months.length - 1, r.to), want = mTo - calcM + 1;
  const mFrom = Math.max(0, r.from, want);
  return { mFrom, mTo, months: mTo - mFrom + 1, clipped: r.from > want };
}

/**
 * Fill S.calcM / S.hist. A save from before the slider (custom S.mFrom / S.mTo) migrates to the nearest window:
 * calcM = nearest option to the span, hist.to = year of mTo, hist.from = max(first, to − 9).
 */
export function migratePeriod(S, months) {
  if (S.calcM != null && S.hist) {
    S.calcM = CALC_OPTIONS.includes(+S.calcM) ? +S.calcM : CALC_DEFAULT;
    S.hist = clampHist(S.hist, months);
    return S;
  }
  const NM = months.length;
  const mTo = Math.min(NM - 1, Math.max(0, Number.isFinite(S.mTo) ? S.mTo : NM - 1));
  const mFrom = Math.min(mTo, Math.max(0, Number.isFinite(S.mFrom) ? S.mFrom : NM - 12));
  S.calcM = nearestCalc(mTo - mFrom + 1);
  const to = +String(months[mTo]).slice(0, 4);
  S.hist = clampHist({ from: to - (HIST_YEARS - 1), to }, months);
  return S;
}

/** "2017 – 2026", with "2026 (Jan–Sep)" when the data's last year is partial. partial = 'Jan–Sep' | null. */
export function histText(hist, last, partial) {
  const to = hist.to === last && partial ? `${hist.to} (${partial})` : String(hist.to);
  return hist.from === hist.to && !(hist.to === last && partial) ? String(hist.from) : t('{0} – {1}', [hist.from, to]);
}

/** Help line under the window select. */
export function windowHelp(w, fmtMonth) {
  return `${t('{0} – {1}', [fmtMonth(w.mFrom), fmtMonth(w.mTo)])} · ${t('used for colours, medians and $psf')}${w.clipped ? ' ' + t('Shortened to your sales-history range.') : ''}`;
}

/** Slider quick chip → years. y = '5' | '10' | 'all'. */
export function quickHist(y, months) {
  const { first, last } = yearsOf(months);
  return { from: y === 'all' ? first : Math.max(first, last - (+y - 1)), to: last };
}

// ------------------------------------------------------------------ browser
/**
 * ctx: { months, S, fmtMonth, monthName(mm) → 'Jan', save(), onChange() }. Fills S.calcM / S.hist / S.mFrom / S.mTo now
 * (before the first render) and on every change. Returns { info() → { hist, histFrom, histTo, win, calc } }.
 */
export function mountPeriod({ months, S, fmtMonth, monthName, save, onChange }) {
  const $ = (id) => document.getElementById(id);
  const { first, last } = yearsOf(months);
  const lastM = +String(months[months.length - 1]).slice(5, 7);
  const partial = lastM === 12 ? null : `${monthName(1)}–${monthName(lastM)}`;
  migratePeriod(S, months);
  let w = windowFor({ months, calcM: S.calcM, hist: S.hist });
  S.mFrom = w.mFrom; S.mTo = w.mTo;

  const sel = $('calcWin'), from = $('histFrom'), to = $('histTo');
  for (const el of [from, to]) { if (!el) continue; el.min = first; el.max = last; }
  const ends = document.querySelector('#secHistory .yr-ends');
  if (ends) ends.innerHTML = `<span>${first}</span><span>${last}</span>`;

  function sync() {
    // M-10 (P8 8c): "Prices from the last" is a seg of 4 buttons (index.html #calcWin), roving tabindex
    sel?.querySelectorAll('button[data-v]').forEach((b) => { const on = +b.dataset.v === S.calcM; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
    if ($('calcWinHelp')) $('calcWinHelp').textContent = windowHelp(w, fmtMonth);
    if (from) { from.value = S.hist.from; from.setAttribute('aria-valuetext', String(S.hist.from)); }
    if (to) { to.value = S.hist.to; to.setAttribute('aria-valuetext', String(S.hist.to)); }
    if (from) from.style.zIndex = S.hist.from === S.hist.to && S.hist.to === last ? '3' : ''; // both thumbs at the end: "from" on top so it can move
    if ($('histOut')) $('histOut').textContent = histText(S.hist, last, partial);
    const span = Math.max(1, last - first), fill = $('histFill');
    if (fill) { fill.style.left = `calc(var(--yr-r) + (100% - 2 * var(--yr-r)) * ${(S.hist.from - first) / span})`; fill.style.width = `calc((100% - 2 * var(--yr-r)) * ${(S.hist.to - S.hist.from) / span})`; }
    if ($('histHint')) $('histHint').textContent = t('Block cards list every sale in these years. Map prices use the window under the legend, ending {0}.', [fmtMonth(w.mTo)]);
    document.querySelectorAll('#histQuick .chip').forEach((c) => { const q = quickHist(c.dataset.y, months); c.classList.toggle('on', q.from === S.hist.from && q.to === S.hist.to); });
  }
  let timer = null;
  function apply(now) {
    w = windowFor({ months, calcM: S.calcM, hist: S.hist });
    S.mFrom = w.mFrom; S.mTo = w.mTo;
    sync(); save();
    clearTimeout(timer);
    if (now) onChange(); else timer = setTimeout(onChange, 120); // slider drags: one render per pause
  }
  const pickCalc = (b) => { if (!b || +b.dataset.v === S.calcM) return; S.calcM = +b.dataset.v; apply(true); };
  sel?.addEventListener('click', (e) => pickCalc(e.target.closest('button[data-v]')));
  sel?.addEventListener('keydown', (e) => { // ← / → move and pick (as the other segs, card.js wireSeg)
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return;
    const bs = [...sel.querySelectorAll('button[data-v]')], i = bs.indexOf(e.target.closest('button')); if (i < 0) return;
    e.preventDefault(); e.stopPropagation(); // keep the map from panning
    const next = bs[(i + d + bs.length) % bs.length]; next.focus(); pickCalc(next);
  });
  const setYears = (which, v) => {
    const y = Math.max(first, Math.min(last, Math.round(v)));
    if (which === 'from') S.hist = { from: Math.min(y, S.hist.to), to: S.hist.to }; // handles never cross (equal = one year)
    else S.hist = { from: S.hist.from, to: Math.max(y, S.hist.from) };
    apply(false);
  };
  for (const [el, which] of [[from, 'from'], [to, 'to']]) {
    if (!el) continue;
    el.addEventListener('input', () => setYears(which, +el.value));
    el.addEventListener('keydown', (e) => {
      const d = e.key === 'PageUp' ? 5 : e.key === 'PageDown' ? -5 : 0; if (!d) return;
      e.preventDefault(); setYears(which, +el.value + d);
    });
  }
  $('histQuick')?.addEventListener('click', (e) => { const c = e.target.closest('.chip[data-y]'); if (!c) return; S.hist = quickHist(c.dataset.y, months); apply(true); });
  sync();

  return {
    info: () => ({ hist: { ...S.hist }, histFrom: histRange(months, S.hist).from, histTo: histRange(months, S.hist).to, win: w, calc: calcLabel(S.calcM) }),
    /** S.calcM / S.hist were set from outside (saved map views): clamp, derive S.mFrom / S.mTo, update the controls. */
    refresh() { migratePeriod(S, months); w = windowFor({ months, calcM: S.calcM, hist: S.hist }); S.mFrom = w.mFrom; S.mTo = w.mTo; sync(); },
  };
}
