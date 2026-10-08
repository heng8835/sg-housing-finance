// Policy-change log (spec phase 6 AC 4): every entry of policy/sg-policy.json, grouped by topic, newest
// effective date first, with value, effective / retrieved dates, status badge and source link; status filter;
// a banner from review_due. Generated at runtime — nothing to maintain by hand. Pure apart from t().
import { esc } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { ruleText, sourceHost } from '../../core/policyfmt.js';

export const STATUSES = ['VERIFIED', 'CORROBORATED', 'ASSUMPTION', 'UNVERIFIED'];
export const STATUS_TONE = { VERIFIED: 'good', CORROBORATED: 'info', ASSUMPTION: 'neutral', UNVERIFIED: 'warn' };
export const REVIEW_SOON_DAYS = 30; // UI heuristic: "review due soon" banner this many days before review_due

// id prefix → topic (first match wins); anything else → 'Other rules'
export const TOPICS = [
  ['assumption.', 'Modelling assumptions'],
  ['loan.', 'Loans and limits'], ['tenure.', 'Loans and limits'], ['ratio.', 'Loans and limits'], ['downpayment.', 'Loans and limits'],
  ['rate.', 'Interest rates'],
  ['eligibility.', 'Eligibility'], ['elig.', 'Eligibility'],
  ['grant.', 'Grants'],
  ['stamp.', 'Stamp duty'],
  ['fees.', 'Fees'],
  ['lease.', 'Lease'],
  ['cpf.', 'CPF'],
  ['sellbuy.', 'Selling and buying again'],
  ['seniors.', 'Options at 55+'],
  ['rentbuy.', 'Rent or buy'],
  ['rent.', 'Renting and renting out'], ['rental.', 'Renting and renting out'],
  ['cost.', 'Monthly costs'],
  ['commute.', 'Commute estimates'],
  ['p1.', 'Primary school registration'],
];

export const topicOf = (id) => (TOPICS.find(([p]) => id.startsWith(p)) || [null, 'Other rules'])[1];

/** 'current' | 'upcoming' (starts after today) | 'ended' (effective_to before today). ISO strings compare as dates. */
export function stateOf(p, today) {
  if (p.effective_from > today) return 'upcoming';
  if (p.effective_to != null && p.effective_to < today) return 'ended';
  return 'current';
}

/**
 * Groups for the log: [{ topic, latest, items: [entry] }] — items newest effective_from first (id breaks ties),
 * groups by their newest change first. `status` = one of STATUSES or null (all).
 */
export function groupLog(params, { today, status = null } = {}) {
  const groups = new Map();
  for (const p of params) {
    if (status && p.status !== status) continue;
    const topic = topicOf(p.id);
    if (!groups.has(topic)) groups.set(topic, []);
    groups.get(topic).push({ ...p, topic, state: stateOf(p, today) });
  }
  const byDate = (a, b) => (b.effective_from.localeCompare(a.effective_from) || a.id.localeCompare(b.id));
  return [...groups.entries()].map(([topic, items]) => ({ topic, items: items.sort(byDate), latest: items[0].effective_from }))
    .sort((a, b) => b.latest.localeCompare(a.latest) || a.topic.localeCompare(b.topic));
}

/** Count per status (for the filter buttons). */
export const statusCounts = (params) => Object.fromEntries(STATUSES.map((s) => [s, params.filter((p) => p.status === s).length]));

const DAY_MS = 864e5;
/** 'overdue' | 'soon' | 'ok' for the review_due banner. */
export function reviewState(reviewDue, today, soonDays = REVIEW_SOON_DAYS) {
  if (!reviewDue) return 'ok';
  if (today > reviewDue) return 'overdue';
  const days = (Date.parse(reviewDue) - Date.parse(today)) / DAY_MS;
  return days <= soonDays ? 'soon' : 'ok';
}

/** Value as shown in the log: a number by its unit, Yes / No, a link, or "Table" (details below). */
export function valueHtml(p) {
  const n = ruleText(p);
  if (n != null) return `<b>${esc(n)}</b>`;
  if (p.value == null) return `<i>${esc(t('not set yet'))}</i>`;
  if (typeof p.value === 'boolean') return `<b>${esc(t(p.value ? 'Yes' : 'No'))}</b>`;
  if (typeof p.value === 'string' && /^https?:/.test(p.value)) return `<a href="${esc(p.value)}" target="_blank" rel="noopener">${esc(sourceHost(p.value))}</a>`;
  if (typeof p.value === 'string') return esc(p.value);
  return `<i>${esc(t('Table of values'))}</i>`;
}

function itemHtml(p) {
  const isTable = p.value != null && typeof p.value === 'object';
  const when = p.state === 'upcoming' ? t('from {0} (upcoming)', [p.effective_from])
    : p.state === 'ended' ? t('{0} to {1} (replaced)', [p.effective_from, p.effective_to]) : t('from {0}', [p.effective_from]);
  const src = /^https?:/.test(p.source_url || '')
    ? `<a href="${esc(p.source_url)}" target="_blank" rel="noopener">${esc(sourceHost(p.source_url))}</a>` : esc(t('modelling choice'));
  const details = isTable || p.note
    ? `<details class="fold-inline"><summary>${esc(t('Details'))}</summary>${p.note ? `<p class="pl-note" lang="en">${esc(p.note)}</p>` : ''}${isTable ? `<pre class="pl-json">${esc(JSON.stringify(p.value))}</pre>` : ''}</details>` : '';
  return `<li class="pl-item${p.state !== 'current' ? ` ${p.state}` : ''}">
    <div class="pl-top"><code class="pl-id">${esc(p.id)}</code><span class="tag ${STATUS_TONE[p.status] || 'neutral'}">${esc(t(p.status.toLowerCase()))}</span></div>
    <div class="pl-val">${valueHtml(p)}${p.unit && !isTable && typeof p.value === 'number' ? ` <small class="muted" lang="en">${esc(p.unit)}</small>` : ''}</div>
    <div class="pl-meta">${esc(when)} · ${esc(t('retrieved {0}', [p.retrieved || '—']))} · ${src}</div>${details}</li>`;
}

const on = (yes) => (yes ? ' class="chip on" aria-pressed="true"' : ' class="chip" aria-pressed="false"');

/** Whole log view body. */
export function logHtml(policy, { today, status = null } = {}) {
  const params = policy.params(), counts = statusCounts(params), state = reviewState(policy.reviewDue, today);
  const banner = state === 'overdue'
    ? `<div class="pl-banner warn" role="note">${esc(t('Review overdue: these rules were due for a check on {0}. Some values may be out of date — check the sources before you rely on them.', [policy.reviewDue]))}</div>`
    : `<div class="pl-banner${state === 'soon' ? ' soon' : ''}" role="note">${esc(t(state === 'soon' ? 'Review due soon: next scheduled check on {0} (HDB loan rate each quarter, CPF on 1 January).' : 'Next scheduled review: {0} (HDB loan rate each quarter, CPF on 1 January).', [policy.reviewDue]))}</div>`;
  const filter = `<div class="pl-filter" role="group" aria-label="${esc(t('Show rules by status'))}">
    <button type="button" data-pl-status=""${on(!status)}>${esc(t('All ({0})', [params.length]))}</button>
    ${STATUSES.map((s) => `<button type="button" data-pl-status="${s}"${on(status === s)}>${esc(t(s.toLowerCase()))} (${counts[s]})</button>`).join('')}</div>`;
  const groups = groupLog(params, { today, status });
  return `${banner}
    <p class="hint">${esc(t('Every rule value the app uses, newest change first. Rules file {0}, reviewed {1}.', [policy.version, policy.reviewed || '—']))}</p>
    ${filter}
    ${groups.map((g) => `<section class="section pl-group"><h3>${esc(t(g.topic))} <small class="muted">${g.items.length}</small></h3><ul class="pl-list">${g.items.map(itemHtml).join('')}</ul></section>`).join('') || `<p class="muted">${esc(t('No match.'))}</p>`}
    <p class="hint">${esc(t('Status: verified = read on an official page · corroborated = secondary sources only · assumption = a modelling choice, not a rule · unverified = not yet checked.'))}</p>`;
}
