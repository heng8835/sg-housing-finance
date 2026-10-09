// Rent & Buy → the folded "Rules and checks" cards: what this household may buy / borrow / rent
// (engine/eligibility.js) and renting out your flat (engine/landlord.js). Markup only — every verdict
// comes from the engines.
import { pathways } from '../../engine/eligibility.js';
import { rentOutCheck, tenancyStampDuty, rentalYield } from '../../engine/landlord.js';
import { esc, money, pct } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { flatTypeLabel } from '../../core/flattype.js';
import { moneyInput } from '../../core/moneyinput.js';
import { missingFields, needPrompt } from '../../core/missing.js';

// status tag carries a word, not just an icon
const OK = { true: ['good', '✓', 'Yes'], false: ['critical', '✕', 'No'], conditional: ['info', '?', 'Depends'] };
export const term = (id, text) => `<span data-term="${id}">${text}</span>`;
export const badge = (status) => (status && status !== 'VERIFIED' ? ` <span class="tag ${status === 'ASSUMPTION' ? 'neutral' : 'warn'}" title="${esc(t('How sure we are about this rule'))}">${esc(t(status.toLowerCase()))}</span>` : '');
export const ftLabel = flatTypeLabel; // S1a: one shared display helper

const foldHead = (title, sub) => `<summary><span class="fold-t">${title}</span><span class="fold-s">${sub}</span></summary>`;

/** "What your household can do" — folded card (closed by default). */
export function pathwaysSection(h, policy, folds) {
  const p = pathways(h, policy);
  const item = (label, a) => {
    const [tone, icon, word] = OK[String(a.ok)];
    // one tag in a fixed column (styles/modules.css .pw); how sure we are about the rule is text in the why line
    const conf = a.status && a.status !== 'VERIFIED' ? `<span class="pw-conf" title="${esc(t('How sure we are about this rule'))}">${esc(t('Rule: {0}', [t(a.status.toLowerCase())]))}</span>` : '';
    const why = a.why.map((w) => esc(t(w))).join(' ');
    return `<li class="pw"><span class="pw-name">${label}</span><span class="tag ${tone} pw-tag">${icon} ${esc(t(word))}</span>
      ${why || conf ? `<p class="pw-why">${why}${why && conf ? ' ' : ''}${conf}</p>` : ''}</li>`;
  };
  const group = (title, items) => `<h4 class="sub">${title}</h4><ul class="pw-list">${items.join('')}</ul>`;
  return `<details class="section fold" id="rentPathways" data-fold="pathways"${folds.attr('pathways', false)}>
    ${foldHead(t('What your household can do'), t('Buy, borrow and rent options for your residency'))}
    <div class="fold-body">
      ${h.buyers?.some((b) => b.age || b.income) ? '' : needPrompt(missingFields({ buyers: (h.buyers || []).slice(0, 1) }, ['age', 'income']), 'rbPathways')}
      ${group(t('Buy'), [item(t('New HDB flat (BTO)'), p.buy.bto), item(t('Resale HDB flat'), p.buy.resale), item(t('New executive condo (EC)'), p.buy.ecNew),
        item(t('Resale EC'), p.buy.ecResale), item(t('Private condo'), p.buy.condo), item(t('Landed house'), p.buy.landed)])}
      ${group(t('Borrow'), [item(term('hdb-loan', t('HDB loan')), p.loan.hdb)])}
      ${group(t('Rent a home'), [item(t('Whole HDB flat'), p.rent.hdbWhole), item(t('Room in an HDB flat'), p.rent.hdbRoom), item(t('Private home'), p.rent.privateHome)])}
      ${p.nextBest ? `<p class="hint"><b>${t('Next best path')}:</b> ${esc(t(p.nextBest))}</p>` : ''}
      ${p.notes.map((n) => `<p class="hint">• ${esc(t(n))}</p>`).join('')}
    </div></details>`;
}

const TENANTS = {
  sc: [{ citizenship: 'SC' }], my: [{ citizenship: 'F', nationality: 'MY', pass: 'SP' }],
  other: [{ citizenship: 'F', nationality: 'other', pass: 'EP' }], wpm: [{ citizenship: 'F', nationality: 'other', pass: 'WP', wpSector: 'manufacturing' }],
};

/** "Renting out your flat" — folded card, Pro only. `lo` = the tab's local landlord inputs. */
export function landlordSection(f, lo, policy, folds) {
  const ft = f?.flatType || '4 ROOM';
  const chk = rentOutCheck({ ownerCitizenship: lo.ownerCitizenship, flatClass: lo.flatClass, mopMet: lo.mopMet, flatType: ft, mode: lo.mode, roomsLet: lo.roomsLet, occupants: lo.occupants, tenants: TENANTS[lo.tenants], months: lo.months }, policy);
  const duty = lo.rent ? tenancyStampDuty({ monthlyRent: lo.rent, months: lo.months }, policy) : null;
  const yld = lo.rent && f?.price ? rentalYield({ price: f.price, monthlyRent: lo.rent }) : null;
  const sel = (id, opts, cur) => `<select data-lo="${id}">${opts.map(([v, l]) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${esc(t(l))}</option>`).join('')}</select>`;
  return `<details class="section fold pro-only" id="rentLandlord" data-fold="landlord"${folds.attr('landlord', false)}>
    ${foldHead(t('Renting out your flat'), `${t('HDB checks, occupancy and stamp duty')} · ${ftLabel(ft)}`)}
    <div class="fold-body">
      <h4 class="sub">${t('Your flat')}</h4>
      <div class="fields">
        <label class="f"><span>${t('Owner')}</span>${sel('ownerCitizenship', [['SC', 'Singapore Citizen'], ['PR', 'Permanent Resident']], lo.ownerCitizenship)}</label>
        <label class="f"><span>${t('Flat class')}</span>${sel('flatClass', [['standard', 'Standard / older'], ['plus', 'Plus'], ['prime', 'Prime']], lo.flatClass)}</label>
        <label class="f"><span>${term('mop', 'MOP')}</span>${sel('mopMet', [[true, 'Met'], [false, 'Not yet']], lo.mopMet)}</label>
      </div>
      <h4 class="sub">${t('The tenancy')}</h4>
      <div class="fields">
        <label class="f"><span>${t('Renting')}</span>${sel('mode', [['room', 'Room(s)'], ['whole', 'Whole flat']], lo.mode)}</label>
        <label class="f"><span>${t('Tenants')}</span>${sel('tenants', [['sc', 'Singaporeans / PRs'], ['my', 'Malaysians'], ['other', 'Other foreigners'], ['wpm', 'Work Permit (manufacturing)']], lo.tenants)}</label>
        <label class="f"><span>${t('People living there (incl. you)')}</span><input type="number" data-lo="occupants" min="1" max="12" value="${lo.occupants}"></label>
        <label class="f"><span>${t('Months')}</span><input type="number" data-lo="months" min="1" max="60" value="${lo.months}"></label>
        <label class="f"><span>${t('Monthly rent (S$)')}</span>${moneyInput({ value: lo.rent ?? null, attrs: 'data-lo="rent"' })}</label>
      </div>
      <p class="verdict"><span class="tag ${chk.ok ? 'good' : 'critical'}">${chk.ok ? '✓ ' + t('Allowed, with the checks below') : '✕ ' + t('Not allowed as planned')}</span>${badge(chk.status)}</p>
      ${chk.issues.map((i) => `<p class="hint">${i.level === 'block' ? '✕' : '•'} ${esc(t(i.msg))}${badge(i.status)}</p>`).join('')}
      <p class="hint">${chk.maxOccupants ? t('Max occupants: {0}.', [chk.maxOccupants]) + ' ' : ''}${t('Rental period: {0} months minimum', [chk.minPeriodMonths])}${chk.maxPeriodMonths ? t(', up to {0} months per approval', [chk.maxPeriodMonths]) : ''}${t('.')}${chk.ncQuotaApplies ? ' ' + t('The Non-Citizen quota applies — check the block on HDB first.') : ''}</p>
      ${duty ? `<p class="hint">${t('Tenancy stamp duty')}: <b>${money(duty.duty)}</b>${duty.exempt ? ` (${t('exempt')})` : ''}${yld?.gross != null ? ` · ${t('gross yield')} <b>${pct(yld.gross, 1)}</b>` : ''}</p>` : ''}
      ${chk.linkOut.map((l) => `<p class="hint"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(t(l.label))} ↗</a></p>`).join('')}
    </div></details>`;
}
