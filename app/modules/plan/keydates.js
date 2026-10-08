// Plan tab — key dates: MOP end, sell-by / ABSD-refund deadlines, lease milestones, P1 registration, and with a move
// the sale and purchase completions + the new flat's MOP end (7b B9), listed and downloadable as a calendar file
// (.ics, upcoming dates only). A past date says "Already passed" and what comes next; dates that contradict the
// chosen order get a warning; selling first, the gap is priced at the household's one rent figure (O9). Everything
// is built in the browser.
import { keyDates, orderCheck, gapCost } from '../../engine/keydates.js';
import { buildIcs } from '../../core/ics.js';
import { esc, money } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { field, dateIn, selIn, badge, fmtDate } from './ui.js';
import { moveMode } from './sellbuy.js';
import { sharedRent } from '../../core/rentshare.js';

const CLASSES = [['standard', 'Standard'], ['plus', 'Plus'], ['prime', 'Prime']];
const ORDER = { 'sell-first': 'Sell first, then buy', 'buy-first': 'Buy first, then sell', contra: 'Sell and buy at the same time (contra)' };
// O11: "typical time" lines only for rules read on an official HDB page (policy value set); none are shown otherwise
export const TYPICAL = [
  ['keydates.typical.hfe_letter_weeks', 'HFE letter: usually about {0} weeks once HDB has all your documents.'],
  ['keydates.typical.resale_acceptance_working_days', 'Resale application: HDB usually accepts a complete application within {0} working days.'],
];

/** Events for the current inputs (shared by the list and the download). */
export function eventsFor({ f, plan: p, policy, today }) {
  const d = p.dates || {}, c = p.current || {};
  return keyDates({
    asOf: today, keyCollection: d.keyCollection, flatClass: d.flatClass || 'standard',
    nextCompletion: d.nextCompletion, saleCompletion: c.owns ? c.saleCompletion : null, mode: c.owns ? moveMode(c) : null, nextPropertyType: 'hdb',
    remainingLease: f && Number.isFinite(f.remainingLease) ? f.remainingLease : null, children: d.children || [],
  }, policy);
}

const titleOf = (e) => t(e.titleKey, e.titleVals);
const noteOf = (e) => t(e.noteKey, e.noteVals);

/** The .ics text for the upcoming events, titles in the current language (past dates are left out). */
export function icsFor(ctx) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const evs = eventsFor(ctx).filter((e) => !e.past).map((e) => ({ id: e.id, start: e.start, end: e.end, title: titleOf(e), description: noteOf(e) }));
  return { count: evs.length, text: buildIcs(evs, { stamp, calName: t('Key dates — SG Housing & Finance') }) };
}

/** "Typical time" lines from sourced policy entries only (O11) — [] while they are unverified. */
export function typicalLines(policy) {
  return TYPICAL.flatMap(([id, tpl]) => {
    try { return [t(tpl, [policy.get(id)])]; } catch { return []; }
  });
}

function moeLink(policy) {
  let url = null;
  try { url = policy.meta('p1.registration.cohort').source_url; } catch { url = null; }
  return /^https?:/.test(url || '') ? ` <a href="${esc(url)}" target="_blank" rel="noopener">${t("MOE's page ↗")}</a>` : '';
}

function itemHtml(e, policy) {
  const p1 = /^p1-/.test(e.id);
  const when = `<b>${fmtDate(e.start)}${e.end ? ` – ${fmtDate(e.end)}` : ''}</b> ${esc(titleOf(e))}${badge(e.status)}`;
  const address = p1 ? `<br><small>${esc(t('MOE has rules on living at the address you register with — check MOE\'s page.'))}${moeLink(policy)}</small>` : '';
  if (e.past) {
    const next = e.pastKey ? t(e.pastKey) : noteOf(e);
    return `<li class="past"><span class="fade">${when}</span> <span class="tag neutral">${t('Already passed')}</span><br><small>${esc(next)}</small></li>`;
  }
  return `<li>${when}<br><small>${esc(noteOf(e))}</small>${address}</li>`;
}

/** Warning when the dates contradict the chosen order ('' when they fit). */
export function orderWarning(c, d) {
  if (!c.owns) return '';
  const mode = moveMode(c);
  const bad = orderCheck({ mode, saleCompletion: c.saleCompletion, purchaseCompletion: d.nextCompletion });
  if (!bad) return '';
  const order = t(ORDER[mode]);
  const msg = mode === 'sell-first'
    ? t('Your dates don\'t match "{0}": the new flat completes on {1}, before the sale completes on {2}. Change the order in Sell then buy, or check the dates.', [order, fmtDate(bad.purchase), fmtDate(bad.sale)])
    : t('Your dates don\'t match "{0}": the sale completes on {1}, before the new flat completes on {2}. Change the order in Sell then buy, or check the dates.', [order, fmtDate(bad.sale), fmtDate(bad.purchase)]);
  return `<div class="need" role="note"><span class="need-ic" aria-hidden="true">!</span><p>${esc(msg)}</p></div>`;
}

/** Selling first: the rent between the sale and the new keys ('' when not selling first or a date is missing). */
export function gapNote(c, d, p) {
  if (!c.owns) return '';
  const g = gapCost({ mode: moveMode(c), saleCompletion: c.saleCompletion, purchaseCompletion: d.nextCompletion, rent: sharedRent(p).amount });
  if (!g) return '';
  const text = g.cost == null
    ? `${esc(t('Between the sale and your new keys: about {0} months.', [g.months]))} <button type="button" class="link" data-act="goto-rent">${t('Add the rent you\'d pay to see this.')}</button>`
    : esc(t('Between the sale and your new keys: about {0} months × your rent {1} = {2}.', [g.months, money(g.rent), money(g.cost)]));
  return `<p class="default-note" role="note"><span class="dn-ic" aria-hidden="true">i</span><span>${text}</span></p>`;
}

/** @param {{ f:object|null, plan:object, policy:object, today:string }} ctx */
export function keyDatesSection(ctx) {
  const { f, plan: p, policy } = ctx;
  const d = p.dates || {}, kids = d.children || [], c = p.current || {};
  const evs = eventsFor(ctx);
  const list = evs.length
    ? `<ul class="dates">${evs.map((e) => itemHtml(e, policy)).join('')}</ul>`
    : `<p class="hint">${t('Enter a date above, or pick a flat, to see its key dates.')}</p>`;
  const typical = c.owns ? typicalLines(policy) : [];
  return `<div class="section" id="planDates"><h3>${t('Key dates')}</h3>
    <div class="fields">
      ${field(t('Key collection of the flat you live in (or will)'), dateIn('plan.dates.keyCollection', d.keyCollection))}
      ${field(t('Flat class'), selIn('plan.dates.flatClass', CLASSES, d.flatClass || 'standard'))}
      ${c.owns ? field(t('Sale completes (expected)'), dateIn('plan.current.saleCompletion', c.saleCompletion)) : ''}
      ${c.owns ? field(t('Completion of the next purchase'), dateIn('plan.dates.nextCompletion', d.nextCompletion)) : ''}
    </div>
    ${kids.length ? `<div class="fields">
      ${kids.map((b, i) => `<div class="f kid">${field(t('Child {0} born on', [i + 1]), dateIn(`plan.dates.children.${i}`, b))}<button type="button" class="link" data-act="remove-child" data-i="${i}">${t('remove')}</button></div>`).join('')}
    </div>` : ''}
    <div class="actions"><button type="button" class="btn sm" data-act="add-child">＋ ${t('Add a child (for Primary 1 dates)')}</button></div>
    ${f && Number.isFinite(f.remainingLease) ? `<p class="hint">${t('Lease dates are for {0}.', [esc(f.label || t('this flat'))])}</p>` : ''}
    ${orderWarning(c, d)}
    ${list}
    ${gapNote(c, d, p)}
    ${typical.length ? `<ul class="notes">${typical.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    <div class="actions"><button type="button" class="btn" data-act="ics"${evs.some((e) => !e.past) ? '' : ' disabled'}>${t('Download calendar (.ics)')}</button></div>
    <p class="hint">${evs.some((e) => e.past) ? `${t('Past dates are left out of the calendar file.')} ` : ''}${t('The calendar file is made in your browser — nothing is sent anywhere. Dates are approximate; check with HDB, IRAS and MOE.')}</p>
  </div>`;
}
