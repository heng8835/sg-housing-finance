// Plan tab — BTO vs resale: wait for a new flat in a nearby BTO project (renting meanwhile) or buy a
// resale flat around it now. Engine: engine/btoresale.js; data via core/data.js.
// btoData switch off (core/features.js, DEC-015): no project list — the price and the expected key collection are
// typed, resale prices and rents are taken around the flat picked on the map.
// Phase 7 A7 (btoinputs.js): flat types filtered by the household's pathways, the wait asked (no verdict while it is
// unknown), "Your rent now", typed prices kept per project + flat type — never the all-types launch midpoint.
import { compareBtoResale } from '../../engine/btoresale.js';
import { pathways } from '../../engine/eligibility.js';
import { rentComps } from '../../engine/rent.js';
import { data } from '../../core/data.js';
import { feature } from '../../core/features.js';
import { distanceKm } from '../../core/geo.js';
import { esc, money } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { field, selIn, notesFold } from './ui.js';
import { btoPayFold } from './btopay.js';
import { priceKey, typedPrice, priceInput, flatTypeChoice, flatTypeSelect, eligStrip, waitChoice, waitFields, rentNowOf, rentField, rentInfo, askFor } from './btoinputs.js';

// how "resale nearby" is measured (a UI choice, not a rule)
const RESALE_KM = 1;
const RESALE_MONTHS = 12;
const NEAREST_PROJECTS = 15;
const MONTH = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** "Sep 2029" → "2029-09"; "2029" → "2029-12"; "To be announced" → null. */
export function parseTop(s) {
  const m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/.exec(String(s || ''));
  if (m && MONTH[m[1].toLowerCase()]) return `${m[2]}-${String(MONTH[m[1].toLowerCase()]).padStart(2, '0')}`;
  const y = /\b(20\d\d)\b/.exec(String(s || ''));
  return y ? `${y[1]}-12` : null;
}

/** Verdict tag: only on a price typed for this project + flat type, with a known wait and rent (engine: no total
 *  otherwise), for a household that may buy new; null when not comparable. */
const verdictOf = (r, show) => (!show ? null : r.cheaper === 'bto' ? ['good', t('By the key date, the BTO route costs about {0} less', [money(r.difference)])]
  : r.cheaper === 'resale' ? ['warn', t('By the key date, resale now costs about {0} less', [money(-r.difference)])] : null);

function kpisHtml(r, w, rentLine, resale, resaleLabel) {
  return `<div class="kpis">
      <div class="kpi"><small>${t('Wait for the keys')}</small><b>${r.waitMonths == null ? '—' : t('{0} months', [r.waitMonths])}</b><small>${w.mode === 'future' ? t('your guess') : t('from today')}</small></div>
      <div class="kpi"><small>${t('Rent while waiting')}</small><b>${r.rentWhileWaiting == null ? '—' : money(r.rentWhileWaiting)}</b><small>${rentLine}</small></div>
      <div class="kpi"><small>${t('BTO: price + rent')}</small><b>${r.btoTotal == null ? '—' : money(r.btoTotal)}</b><small>${t('{0}-year lease from key collection', [r.btoLeaseYears])}</small></div>
      <div class="kpi"><small>${resaleLabel}</small><b>${r.resaleTotal == null ? '—' : money(r.resaleTotal)}</b><small>${resale?.n ? t('median of {0} sales, last {1} months', [resale.n, RESALE_MONTHS]) : t('no sales of this type nearby')}</small></div>
    </div>`;
}

/**
 * Everything below the inputs, for both modes: the verdict (or what is still missing), the KPIs, payment stages and
 * notes. canCompare = resale prices are there to compare with; doneText = notice when the key date has passed.
 */
function compareBlock({ h, p, policy, today, fold, choice, w, price, median, resale, resaleLabel, canCompare, doneText = null }) {
  const r = compareBtoResale({ asOf: today, keyDate: w.keyDate, waitMonths: w.waitMonths, btoPrice: price, resalePrice: resale?.median ?? null, monthlyRent: rentNowOf(p, median) }, policy);
  const show = canCompare && price != null && !w.done && choice.gate.ok !== false;
  const verdict = verdictOf(r, show);
  const ask = show && !verdict ? askFor(r, w) : '';
  return `${w.done && doneText ? `<p class="notice">${doneText}</p>` : ''}
    ${verdict ? `<p class="verdict"><span class="tag ${verdict[0]}">${verdict[1]}</span></p>` : ''}
    ${ask ? `<p class="hint">${ask}</p>` : ''}
    ${kpisHtml(r, w, rentInfo(p, median), resale, resaleLabel)}
    ${w.done ? '' : btoPayFold({ price, flatType: choice.ft, keyDate: w.keyDate, h, plan: p, policy, fold })}
    ${notesFold(r.notes, 'btoNotes', fold)}`;
}

/** btoData switch off: typed BTO price + expected key collection (or a future launch); resale and rent around the focus flat (if any). */
function typedSection({ h, f, p, policy, today, fold, head, choice, paths }) {
  const ft = choice.ft, key = priceKey(null, ft), price = typedPrice(p, key);
  const w = waitChoice({ p, typed: true, today });
  const home = f && f.bid != null ? data.block(f.bid) : null;
  const resale = home ? data.resaleNear(home, ft, { km: RESALE_KM, months: RESALE_MONTHS }) : null;
  const rents = home ? data.rentsFor(f.bid) : { block: null, town: null };
  const median = home ? rentComps(rents.block, ft, policy, rents.town)?.med ?? null : null;
  return `${head}
    <p class="hint">${t('BTO project details are not included in this version. Type the price for your flat type and the expected completion from HDB\'s sales brochure.')}</p>
    ${eligStrip(choice, paths)}
    <div class="fields">
      ${field(t('Flat type'), flatTypeSelect(choice))}
      ${field(t('BTO price you expect (S$)'), priceInput(key, price))}
      ${waitFields(p, w)}
      ${rentField(p, median, ft)}
    </div>
    ${home ? '' : `<p class="hint">${t('Pick a flat on the map to compare with resale prices and rents around it.')}</p>`}
    ${compareBlock({ h, p, policy, today, fold, choice, w, price, median, resale, resaleLabel: t('Resale within {0} km of your flat', [RESALE_KM]), canCompare: !!home, doneText: t('That key collection month has passed — enter the expected completion of a project still being built.') })}
  </div>`;
}

/** @param {{ h:object, f:object|null, plan:object, policy:object, today:string }} ctx */
export function btoSection({ h, f, plan: p, policy, today, fold = () => '' }) {
  const head = `<div class="section" id="planBto"><h3>${t('BTO or resale?')}</h3>`;
  // who may buy new, and which flat types, before any number (Phase 7 A7)
  const paths = pathways(h, policy);
  const choice = flatTypeChoice(h, policy, { wanted: p.btoFt || f?.flatType, explicit: p.btoFt != null, paths });
  if (!feature('btoData')) return typedSection({ h, f, p, policy, today, fold, head, choice, paths });
  const projects = data.bto?.projects || [];
  // no BTO dataset yet (still loading): the payment stages already work from a typed price
  if (!projects.length) {
    const key = priceKey(null, choice.ft), price = typedPrice(p, key);
    return `${head}<p class="hint">${t('Loading map data…')}</p>${eligStrip(choice, paths)}
      <div class="fields">${field(t('Flat type'), flatTypeSelect(choice))}${field(t('BTO price you expect (S$)'), priceInput(key, price))}</div>
      ${btoPayFold({ price, flatType: choice.ft, keyDate: null, h, plan: p, policy, fold })}</div>`;
  }
  const home = f && f.bid != null ? data.block(f.bid) : null;
  const sorted = projects.map((x) => ({ x, km: home ? distanceKm(home, x) : null }))
    .sort((a, b) => (home ? a.km - b.km : a.x.n.localeCompare(b.x.n)));
  const now = today.slice(0, 7);
  const upcoming = ({ x }) => { const k = parseTop(x.top); return k == null || k > now; };
  // default: the nearest project still being built
  const proj = projects.find((x) => x.n === p.btoId) || (sorted.find(upcoming) || sorted[0]).x;
  const ft = choice.ft;
  // nearest projects to the flat you picked (all of them when no flat is picked), plus the chosen one
  const shown = home ? sorted.slice(0, NEAREST_PROJECTS) : sorted;
  if (!shown.some(({ x }) => x === proj)) shown.push(sorted.find(({ x }) => x === proj));
  const opts = shown.map(({ x, km }) => [x.n, km == null ? x.n : `${x.n} (${km.toFixed(1)} km)`]);
  const projectKey = parseTop(proj.top);
  const w = waitChoice({ p, projectKey, today });
  // the price typed for this project + flat type only — the launch range spans all flat types, so it is never used as a price
  const key = priceKey(proj.n, ft), price = typedPrice(p, key);
  const resale = data.resaleNear(proj, ft, { km: RESALE_KM, months: RESALE_MONTHS });
  const nb = data.nearestBlock(proj);
  const rents = nb ? data.rentsFor(nb.bid) : { block: null, town: null };
  const median = rentComps(rents.block, ft, policy, rents.town)?.med ?? null;
  const past = projectKey != null && projectKey <= now;
  return `${head}
    ${eligStrip(choice, paths)}
    <div class="fields">
      ${field(t('BTO project'), selIn('plan.btoId', opts, proj.n, 'text', false), 'wide')}
      ${field(t('Flat type'), flatTypeSelect(choice))}
      ${field(t('BTO price you expect (S$)'), priceInput(key, price))}
      ${waitFields(p, w, proj.top)}
      ${rentField(p, median, ft)}
    </div>
    <p class="hint">${esc(proj.n)} · ${t('expected completion')}: ${esc(projectKey ? proj.top : t('not announced'))}${proj.pmin ? ` · ${t('launch prices {0}–{1} (all flat types)', [money(proj.pmin), money(proj.pmax)])}` : ''}${proj.url ? ` · <a href="${esc(proj.url)}" target="_blank" rel="noopener">${t('project page ↗')}</a>` : ''}</p>
    ${past ? `<p class="notice">${t('Expected completion has passed — these flats are probably completed and sold. Pick a project still being built.')}</p>` : ''}
    ${price ? '' : `<p class="hint">${t('Enter the BTO price for this flat type (from the HDB sales brochure) to compare.')}</p>`}
    ${compareBlock({ h, p, policy, today, fold, choice, w, price, median, resale, resaleLabel: t('Resale within {0} km now', [RESALE_KM]), canCompare: true })}
  </div>`;
}
