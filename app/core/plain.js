// Plain words for Simple mode (Phase 7 B10, spec phase7-user-feedback.md §4.5): one shared word list that the Simple
// variants of compare rows, Afford, Rent & Buy, Plan and the block card use. Pro keeps the precise terms (MSR, P25–P75,
// percentile, n=…) — every function here is only called when mode is 'simple'. Numbers arrive already formatted by
// the caller (same values as Pro); nothing here computes or rounds money. Pure: strings via t(), node-testable.
// The full before → after list: hdb-data-pipeline/docs/specs/phase7a-plainwords.md.
import { t } from './i18n.js';

/** True only for Simple mode; anything else (undefined, 'pro') keeps the Pro wording. */
export const isSimple = (mode) => mode === 'simple';

/** "5/5" alone did not say whether 5 is good (P6-6): every 1–5 future-value score gets a word. 5 = most favourable. */
export const SCORE_WORDS = { 1: 'poor', 2: 'below average', 3: 'average', 4: 'good', 5: 'very good' };
export function scoreText(score, partial = false) {
  const word = t(SCORE_WORDS[score] || '');
  return partial ? t('{0}/5 — {1} (partial)', [score, word]) : t('{0}/5 — {1}', [score, word]);
}

/**
 * "36th percentile" → "Cheaper than about 64% of similar sales". p = where the asking $psf sits among the sales
 * (0 = cheaper than all, 100 = dearer than all; engine/fairvalue.js). Same number as Pro, said from the buyer's side.
 */
export function percentileText(p) {
  const n = Math.round(p);
  if (n <= 2) return t('Cheaper than almost all similar sales');
  if (n >= 98) return t('More expensive than almost all similar sales');
  if (n < 50) return t('Cheaper than about {0}% of similar sales', [100 - n]);
  if (n > 50) return t('More expensive than about {0}% of similar sales', [n]);
  return t('In the middle of similar sales');
}

/** "P25–P75 S$713k–S$781k · n=35" → "Typical: S$713k–S$781k (middle half of 35 similar sales)". lo / hi pre-formatted. */
export const middleHalfText = (lo, hi, n) => t('Typical: {0}–{1} (middle half of {2} similar sales)', [lo, hi, n]);
/** "n=3 (at least 5 needed)" → plain. */
export const tooFewText = (n, min) => t('Too few similar sales to judge ({0} found, {1} needed)', [n, min]);

/**
 * "22% of income · MSR test 26% at 3% (cap 30%)" → "Uses 22% of your income; 26% when tested at 3% interest (limit 30%)".
 * All arguments pre-formatted percentages; cap optional.
 */
export function incomeShareText(share, tested, rate, cap = null) {
  return cap == null
    ? t('Uses {0} of your income; {1} when tested at {2} interest', [share, tested, rate])
    : t('Uses {0} of your income; {1} when tested at {2} interest (limit {3})', [share, tested, rate, cap]);
}
/** "TDSR 41%" → "all loans: 41% of income". */
export const allLoansText = (share) => t('all loans: {0} of income', [share]);

/** Grant ids → names (Afford's "EHG S$30k · CHG S$50k"). The ⓘ "Grants" term keeps the details. */
export const GRANT_NAMES = { ehg: 'Enhanced CPF Housing Grant', chg: 'CPF Housing Grant', phg: 'Proximity Housing Grant' };
export const grantName = (id) => (GRANT_NAMES[id] ? t(GRANT_NAMES[id]) : String(id).toUpperCase());

/**
 * Engine verdict reasons (engine/plan.js, English, translated at render) whose wording names a ratio. Keyed by the
 * reason code; the other reasons are already plain and stay as the engine says them.
 */
export const SIMPLE_REASONS = {
  msr: 'The monthly payment would be over the limit for your income when tested at a higher interest rate — the loan would be smaller.',
  tdsr: 'All your loan payments together would be over the limit for your income when tested at a higher interest rate.',
};
/** The reason text to show: the plain one in Simple mode when there is one, else the engine's (translated). */
export const reasonText = (code, text, mode) => t(isSimple(mode) && SIMPLE_REASONS[code] ? SIMPLE_REASONS[code] : text);

/** Every English string this module can show (zh coverage test). */
export const uiStrings = () => [
  ...Object.values(SCORE_WORDS), '{0}/5 — {1}', '{0}/5 — {1} (partial)',
  'Cheaper than almost all similar sales', 'More expensive than almost all similar sales', 'Cheaper than about {0}% of similar sales',
  'More expensive than about {0}% of similar sales', 'In the middle of similar sales',
  'Typical: {0}–{1} (middle half of {2} similar sales)', 'Too few similar sales to judge ({0} found, {1} needed)',
  'Uses {0} of your income; {1} when tested at {2} interest', 'Uses {0} of your income; {1} when tested at {2} interest (limit {3})',
  'all loans: {0} of income', ...Object.values(GRANT_NAMES), ...Object.values(SIMPLE_REASONS),
];
