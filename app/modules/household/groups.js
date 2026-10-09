// "About you" page groups (spec phone-topbar-area-household.md §4.2 / §4.3, slice S3). Pure: which group a household
// store path lives in (groupFor), where household:open { field } lands when that field is not on the page
// (candidates), and the one-line summary under each folded group's title (summaries). Every figure in a summary
// is an engine output passed through as it is (grants() total, loanChoice()); nothing is recomputed here.
import { grants } from '../../engine/grants.js';
import { summarise } from '../../engine/household.js';
import { atPayoutAge } from '../../engine/cpfbuy.js';
import { money } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { loanChoice } from './loan.js';

/** The page's groups in order; fold = the details[data-fold] key (null = always open). */
export const GROUPS = [
  { id: 'basics', fold: null, title: 'The basics' },
  { id: 'grants', fold: 'hhGrants', title: 'Grants and first home' },
  { id: 'loan', fold: 'hhLoan', title: 'Loan and other debts' },
  { id: 'cpf', fold: 'hhCpf', title: 'CPF and retirement' },
  { id: 'data', fold: 'hhData', title: 'Your data' },
];
export const foldOf = (group) => (GROUPS.find((g) => g.id === group) || {}).fold || null;

const BASIC_BUYER = /^buyers\.\d+\.(age|income|citizenship|cpfOa|prYears3Plus|nationality|pass|wpSector)$/;
const CPF_BUYER = /^buyers\.\d+\.(cpfSa|cpfMa|cpfRa|cpfLifeMonthly)$/;
const GRANTS = ['firstTimer', 'propertiesOwned', 'parents', 'grantsOverride'];
const LOAN = ['loan', 'tenure', 'otherDebts'];
const DATA = ['forget', 'export', 'import']; // not store paths: the data controls (e.g. Learn → About → Forget my data)

/** Store path (household-relative, e.g. 'buyers.1.cpfOa') → group id. Unknown paths → 'basics'. */
export function groupFor(path) {
  const p = String(path ?? '');
  if (p === 'scheme' || p === 'cash' || BASIC_BUYER.test(p)) return 'basics';
  if (GRANTS.includes(p)) return 'grants';
  if (LOAN.includes(p)) return 'loan';
  if (CPF_BUYER.test(p)) return 'cpf';
  if (DATA.includes(p)) return 'data';
  return 'basics';
}

/**
 * Where to land, in order (§4.3 step 2): the field itself → the same key on buyer 1 (e.g. buyers.1.income with one
 * buyer) → the group's summary row (a field not shown: SA in Simple, CPF LIFE payout under the payout age) → the
 * first basics field. The page takes the first candidate that is on screen.
 * @returns {({ path:string } | { group:string } | { first:true })[]}
 */
export function candidates(path) {
  const p = String(path ?? ''), out = [];
  if (p) out.push({ path: p });
  const m = /^buyers\.(\d+)\.(\w+)$/.exec(p);
  if (m && m[1] !== '0') out.push({ path: `buyers.0.${m[2]}` });
  const g = groupFor(p);
  if (p && foldOf(g)) out.push({ group: g });
  out.push({ first: true });
  return out;
}

/** The first candidate (above) that isShown(candidate) accepts, else null. */
export const pickTarget = (path, isShown) => candidates(path).find((c) => isShown(c)) || null;

const OWNED = { 0: 'no other homes', 1: 'owns 1 home', 2: 'owns 2 or more homes' };
const TIMER = { true: 'First-timers', mixed: 'One first-timer, one second-timer', false: 'Second-timers' };
const PARENTS = { near: 'near parents', with: 'living with parents' }; // short: the fold shows the full option (review H-1.4)
const filled = (v) => v != null && v !== '';

/** Buyers who have CPF (not foreigners), with their index. */
export const cpfBuyers = (h) => (h.buyers || []).map((b, i) => ({ b, i })).filter(({ b }) => b && b.citizenship !== 'F');

/**
 * One-line summaries for the folded groups (EN keys through t(); 中文 in i18n/zh.json).
 * @param {object} h household slice  @param {object} policy  @param {{ pro?:boolean }} [o]
 * @returns {{ grants:string, loan:string, cpf:string, data:string }}
 */
export function summaries(h, policy, { pro = false } = {}) {
  const x = h || {}, s = summarise(x);
  // first-timer status, then only what differs from the defaults (homes owned, parents), then the grant (review H-1.4)
  const g = [t(TIMER[String(x.firstTimer)] || TIMER.true)];
  const owned = Math.min(2, +x.propertiesOwned || 0);
  if (owned) g.push(t(OWNED[owned]));
  if (PARENTS[x.parents]) g.push(t(PARENTS[x.parents]));
  if (x.grantsOverride != null) g.push(t('your grant figure {0}', [money(x.grantsOverride)]));
  else if (s.income != null) g.push(t('est. grants {0}', [money(grants({ household: x, flatType: '4 ROOM' }, policy).total)]));

  const loan = [t(loanChoice(x, policy).value === 'bank' ? 'Bank loan' : 'HDB loan')];
  if (filled(x.tenure)) loan.push(t('{0} years', [x.tenure]));
  loan.push(+x.otherDebts > 0 ? t('other loans {0} a month', [money(+x.otherDebts)]) : t('no other loans'));

  const cpf = [], who = cpfBuyers(x);
  const payout = who.filter(({ b }) => atPayoutAge(b, policy));
  if (payout.length) {
    const got = payout.filter(({ b }) => filled(b.cpfLifeMonthly));
    cpf.push(got.length ? t('CPF LIFE payout {0} a month', [money(got.reduce((a, { b }) => a + +b.cpfLifeMonthly, 0))]) : t('CPF LIFE payout: not filled'));
  }
  if (pro && who.length) {
    const any = who.some(({ b }) => filled(b.cpfSa) || filled(b.cpfMa) || filled(b.cpfRa));
    cpf.push(t(any ? 'More CPF balances: filled' : 'More CPF balances: not filled'));
  }
  return { grants: g.join(' · '), loan: loan.join(' · '), cpf: cpf.join(' · '), data: t('Export, import or forget') };
}

/** The line under the page title: "2 buyers · S$8,000 a month · saved only in this browser"; in a sample
 * "Sample household · 2 buyers · S$8,000 a month" (the sample notice is folded into it, review H-1.1). */
export function statusLine(h, { sample = false } = {}) {
  const s = summarise(h || {}), n = s.buyers.length;
  if (s.income == null) return t(sample ? 'Sample household' : 'Saved only in this browser. Nothing is sent.');
  const k = sample ? (n === 1 ? 'Sample household · {0} buyer · {1} a month' : 'Sample household · {0} buyers · {1} a month')
    : n === 1 ? '{0} buyer · {1} a month · saved only in this browser' : '{0} buyers · {1} a month · saved only in this browser';
  return t(k, [n, money(s.income)]);
}

/** Every English string this file shows (zh coverage test). */
export const uiStrings = () => [...GROUPS.map((g) => g.title), ...Object.values(OWNED), ...Object.values(TIMER), ...Object.values(PARENTS),
  'your grant figure {0}', 'est. grants {0}', 'Bank loan', 'HDB loan', '{0} years', 'other loans {0} a month', 'no other loans',
  'CPF LIFE payout {0} a month', 'CPF LIFE payout: not filled', 'More CPF balances: filled', 'More CPF balances: not filled',
  'Export, import or forget', 'Sample household', 'Saved only in this browser. Nothing is sent.', 'Sample household · {0} buyer · {1} a month',
  'Sample household · {0} buyers · {1} a month', '{0} buyer · {1} a month · saved only in this browser', '{0} buyers · {1} a month · saved only in this browser'];
