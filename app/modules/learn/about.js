// Learn → "About this app" view (Phase 7b, go-live §3.3, owner question O15: a view in the Learn sheet, no tab strip)
// and the persistent "Educational estimates, not financial advice · About" line (O14). Pure HTML builders: the
// caller (learn/index.js) passes policy meta, the loaded data, the version and the BTO switch. Sources and licences
// summarise DATA_LICENCES.md (repo root) — keep the two in step when a dataset is added or dropped.
import { esc } from '../../core/dom.js';
import { t, currentLang } from '../../core/i18n.js';

export const ABOUT_ID = 'about'; // Learn sheet view id (no glossary term uses it)
// Links open on a tap only (navigation, never a background request — tests/privacy/egress.test.js HOSTS).
export const REPO_URL = 'https://github.com/heng8835/sg-housing-finance';
export const ISSUES_URL = `${REPO_URL}/issues`;
export const LICENCES_URL = `${REPO_URL}/blob/main/DATA_LICENCES.md`;
export const SODL_URL = 'https://data.gov.sg/open-data-licence';
export const OSM_URL = 'https://www.openstreetmap.org/copyright';

/** Licence names (English = key for t()). */
export const LICENCES = {
  sodl: 'Singapore Open Data Licence v1.0',
  onemap: 'OneMap terms of use',
  odbl: 'Open Database Licence (ODbL) 1.0',
  pub: 'PUB website terms',
  facts: 'Facts, each linked to its official page',
  bsd: 'BSD 2-Clause',
};

/** One row per group of datasets in DATA_LICENCES.md. upTo: 'resale' | 'rents' (data month) | 'rules' (policy reviewed). */
export const SOURCES = [
  { data: 'Resale prices', from: 'HDB via data.gov.sg', licence: 'sodl', upTo: 'resale' },
  { data: 'Rental approvals and median rents', from: 'HDB via data.gov.sg', licence: 'sodl', upTo: 'rents' },
  { data: 'Block details and the resale price index', from: 'HDB via data.gov.sg', licence: 'sodl' },
  { data: 'MRT station exits and bus stops', from: 'LTA via data.gov.sg', licence: 'sodl' },
  { data: 'Master Plan 2025 land use and rail stations', from: 'URA via data.gov.sg', licence: 'sodl' },
  { data: 'Schools, childcare and kindergartens', from: 'MOE and ECDA via data.gov.sg', licence: 'sodl' },
  { data: 'Clinics, eldercare, hawker centres, parks and other places', from: 'MOH, NEA and NParks via data.gov.sg', licence: 'sodl' },
  { data: 'Map tiles and address positions', from: 'OneMap (Singapore Land Authority)', licence: 'onemap' },
  { data: 'Cafés, malls, supermarkets and bus routes', from: 'OpenStreetMap contributors', licence: 'odbl' },
  { data: 'Flood-prone areas (approximate)', from: 'PUB', licence: 'pub', feature: 'flood' }, // private build only (floodData)
  { data: 'Future MRT lines and major projects', from: 'Agency announcements, written by hand', licence: 'facts' },
  { data: 'Singapore rules: loans, grants, CPF, stamp duty', from: 'HDB, CPF Board, IRAS, MAS and other official pages', licence: 'facts', upTo: 'rules' },
  { data: 'Map library (Leaflet)', from: 'cdnjs.cloudflare.com', licence: 'bsd' },
];

/** 'YYYY-MM' → "Sep 2026" / "2026年9月"; anything else as given. */
export function monthText(ym, lang = currentLang()) {
  const [y, m] = String(ym || '').split('-').map(Number);
  if (!y || !m) return String(ym || '');
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-SG' : 'en-SG', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Last month of the resale and rent data ('YYYY-MM' or null) from the loaded HDB_DATA / HDB_RENTS. */
export function dataMonths({ hdb, rents } = {}) {
  const months = hdb && Array.isArray(hdb.months) ? hdb.months : [];
  const rm = rents && Array.isArray(rents.months) ? rents.months : [];
  return { resale: months.length ? months[months.length - 1] : null, rents: rm.length ? rm[rm.length - 1] : null };
}

const link = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>`;

/** Source rows shipped with these switches (the PUB flood row only while floodData is on). */
export const sourcesFor = ({ floodOn = true } = {}) => SOURCES.filter((r) => r.feature !== 'flood' || floodOn);

/** The licence table rows (exported for the test). data-l = the column name, shown before each value when a phone
 *  stacks the rows (phone overhaul §3.9, P-56: source over link, no sideways scroll; styles/guides.css). */
export function sourcesTable({ months = {}, reviewed = null, floodOn = true } = {}) {
  const upTo = (row) => (row.upTo === 'rules' ? reviewed || '—' : row.upTo && months[row.upTo] ? monthText(months[row.upTo]) : '—');
  return `<table class="mini about-src"><thead><tr><th>${t('Data')}</th><th>${t('From')}</th><th>${t('Licence')}</th><th>${t('Up to')}</th></tr></thead><tbody>${
    sourcesFor({ floodOn }).map((r) => `<tr><td>${esc(t(r.data))}</td><td data-l="${esc(t('From'))}">${esc(t(r.from))}</td><td data-l="${esc(t('Licence'))}">${esc(t(LICENCES[r.licence]))}</td><td data-l="${esc(t('Up to'))}">${esc(upTo(r))}</td></tr>`).join('')}</tbody></table>`;
}

/**
 * The About view body (inside the sheet's .drawer-body, after the head).
 * @param {{ policy?: {version?, reviewed?, reviewDue?}, hdb?, rents?, version?: string, btoOn?: boolean, floodOn?: boolean }} o
 */
export function aboutHtml({ policy = {}, hdb = null, rents = null, version = 'dev', btoOn = true, floodOn = true, today = '', donate = '' } = {}) {
  const months = dataMonths({ hdb, rents });
  const st = rulesStatus(policy, today);
  const rules = policy.reviewed
    ? t('Rules as of {0} · next review {1} · rules version {2}.', [policy.reviewed, policy.reviewDue || '—', policy.version || '—'])
    : t('Rules: see each rule and its source.');
  return `<div class="about">
    <p>${t('SG Housing & Finance is a free, educational tool. It shows estimates from public data and dated rules. It is not financial advice, and it is not affiliated with HDB, CPF Board, IRAS, MAS or any government agency.')}</p>
    <h3>${t('Your privacy')}</h3>
    <p>${t('Your household details stay in this browser. Nothing leaves it except map tiles from OneMap. No analytics, no accounts.')}</p>
    <p class="hint">${t('The map library is loaded from cdnjs.cloudflare.com; no personal data is sent with it.')}</p>
    <p><button type="button" class="link" data-about-forget>${t('Forget my data')}</button></p>
    <h3>${t('Rules')}</h3>
    <p>${esc(rules)} <button type="button" class="link" data-about-rules>${t('See every rule and its source')}</button></p>
    ${st.overdue ? `<p><span class="tag warn">${esc(st.text)}</span></p>` : ''}
    <details class="fold-inline about-fold"><summary>${t('Data sources and licences ({0})', [sourcesFor({ floodOn }).length])}</summary>
      ${sourcesTable({ months, reviewed: policy.reviewed || null, floodOn })}
      <p class="hint">${t('Contains information from datasets accessed from data.gov.sg, made available under the terms of the {0}.', [link(SODL_URL, t(LICENCES.sodl))])}
        ${t('Map data © {0}.', [link(OSM_URL, t('OpenStreetMap contributors'))])}
        ${t('Agency names say where the data comes from, nothing more.')}
        ${t('Full list: {0}.', [link(LICENCES_URL, 'DATA_LICENCES.md')])}</p>
    </details>
    ${btoOn && floodOn ? '' : `<h3>${t('Not in this version')}</h3>${btoOn ? '' : `<p>${t('BTO project details are not included in this version.')}</p>`}${floodOn ? '' : `<p>${t("PUB's flood-prone areas are not included in this version.")}</p>`}`}
    <h3>${t('Feedback')}</h3>
    <p>${t('Found a wrong number? Tell us on {0}.', [link(ISSUES_URL, t('GitHub Issues'))])} <b>${t('Never paste your income, CPF or savings.')}</b></p>
    ${donate ? `<h3>${t('Support this project')}</h3><div class="about-support"><img class="about-logo" src="icons/logo.png" alt="" width="64" height="63"><p>${t('It is free and private. If it helped you, you can support it here: {0}.', [link(donate, 'Ko-fi ☕')])}</p></div>` : ''}
    <p class="hint about-version">${esc(t('App {0} · data up to {1}', [version, months.resale ? monthText(months.resale) : '—']))}</p>
    <p><button type="button" class="link" data-learn="">${t('← Learn')}</button></p>
  </div>`;
}

/**
 * How fresh the rules are (go-live D1 = c: launched before the yearly January refresh). today = 'YYYY-MM-DD' (Singapore).
 * Past review_due the line turns into a warning instead of the app going stale silently.
 */
export function rulesStatus({ reviewed, reviewDue } = {}, today = '') {
  const overdue = !!(reviewDue && today && today > reviewDue);
  if (!reviewed) return { overdue, text: '' };
  return { overdue, text: overdue ? t('Rules last checked {0} — due for review, some figures may be out of date', [reviewed]) : t('Rules as of {0}', [reviewed]) };
}
/** " · Support us ☕" after the About button (opens the Ko-fi page in a new tab); nothing without a donate URL. */
const supportLink = (donate) => (donate ? ` · <a class="disc-support" href="${esc(donate)}" target="_blank" rel="noopener">${esc(t('Support us'))} ☕</a>` : '');
const rulesSpan = (st) => (st && st.text ? `<span data-rules${st.overdue ? ' class="tag warn"' : ''}>${esc(st.text)}</span> · ` : '');

/** Adds the rules date (and the Support link, when donate is set) to every disclaimer line under root (static ones in index.html), once each. */
export function stampRules(root, st, donate = '') {
  for (const p of root.querySelectorAll('.disc-line')) {
    const about = p.querySelector('[data-about]');
    if (about && !p.querySelector('[data-rules]')) about.insertAdjacentHTML('beforebegin', rulesSpan(st));
    if (about && donate && !p.querySelector('.disc-support')) about.insertAdjacentHTML('afterend', supportLink(donate));
  }
}

/** "Educational estimates, not financial advice · Rules as of … · About · Support us ☕" (About opens this view; learn/index.js listens to [data-about]). */
export function discLineHtml(extraClass = '', st = null, donate = '') {
  return `<p class="disc-line${extraClass ? ` ${esc(extraClass)}` : ''}">${t('Educational estimates, not financial advice')} · ${rulesSpan(st)}<button type="button" class="link" data-about>${t('About')}</button>${supportLink(donate)}</p>`;
}
