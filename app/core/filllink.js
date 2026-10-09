// Fill links (owner, Oct 2026: "the rows that need additional info should LINK to fill it in"). One short, tappable
// link for every empty-state cell or line that is empty only because an input is missing; it opens the place where
// that input is typed, focused on the field. Pure HTML builders + one delegated click binder (main.js, document):
//   household → bus 'household:open' { field }   (drawer, focus + flash data-path = field)
//   places    → bus 'fill:open' { target }        (My choices → Daily places, place search focused — explore/legacy)
//   flat      → bus 'fill:open' { target, id, field } (that shortlisted flat's edit form, field focused — explore/legacy)
//   rent      → bus 'fill:open' { target }        (Rent & Buy → the rent field — modules/rent)
// Audit + wording: hdb-data-pipeline/docs/specs/fill-links-audit.md. Values are never computed here.
import { esc } from './dom.js';
import { t } from './i18n.js';

export const FILL_TARGETS = ['household', 'places', 'flat', 'rent'];
/** Household drawer data-path values (modules/household/index.js) a link may focus. */
export const HOUSEHOLD_FIELD = /^(buyers\.\d+\.(age|income|citizenship|cpfOa|cpfSa|cpfMa|cpfRa|cpfLifeMonthly|prYears3Plus|nationality|pass|wpSector)|cash|otherDebts|firstTimer|propertiesOwned|parents|tenure|grantsOverride)$/;
/** My choices form fields a flat link may focus (form ids c + Field: cFacing, cUrl, …). */
export const FLAT_FIELDS = ['facing', 'url', 'storey', 'price', 'sqm', 'name'];
export const FLAT_INPUT = { facing: 'cFacing', url: 'cUrl', storey: 'cStorey', price: 'cPrice', sqm: 'cSqm', name: 'cName' };

/** The one wording per missing input (English = i18n key; 中文 in i18n/zh.json). */
export const FILL_TEXT = {
  income: 'Add your income →', age: 'Add your age →', cpfOa: 'Add CPF balances →', cash: 'Add your savings →',
  funds: 'Add savings and CPF →', cpfLifeMonthly: 'Add your CPF LIFE payout →',
  places: 'Add a daily place →', parentsPlace: "Tag your parents' home →",
  facing: 'Set the facing →', url: 'Add the listing link →', rent: 'Add your rent →',
};

const empty = (v) => v == null || v === '';
const BUYER_KEYS = ['age', 'income', 'cpfOa', 'cpfLifeMonthly'];

/**
 * Household path for a missing input: per-buyer keys → the first buyer (CPF: non-foreigner) whose value is empty,
 * else buyer 1; 'funds' → cash while it is empty, else the first CPF OA; other keys are top-level paths.
 */
export function householdField(household, key) {
  const h = household || {}, buyers = Array.isArray(h.buyers) ? h.buyers : [];
  if (key === 'funds') return empty(h.cash) ? 'cash' : householdField(h, 'cpfOa');
  if (!BUYER_KEYS.includes(key)) return key;
  const i = buyers.findIndex((b) => b && !(key.startsWith('cpf') && b.citizenship === 'F') && empty(b[key]));
  return `buyers.${i < 0 ? 0 : i}.${key}`;
}

/** Is { target, field } a place the app can open? (tests: every prompt maps to a known field / target) */
export function knownFill({ target, field = '' } = {}) {
  if (target === 'household') return HOUSEHOLD_FIELD.test(field);
  if (target === 'flat') return FLAT_FIELDS.includes(field);
  return target === 'places' || target === 'rent';
}

/**
 * The link: <button class="link fill-link" data-fill=target data-field=… data-id=…>text</button>.
 * text = a FILL_TEXT key or an English string; small = wrapped in <small> (under a value in a cell).
 */
export function fillLink({ target, field = '', id = null, text, small = false }) {
  const label = esc(t(FILL_TEXT[text] || text));
  const b = `<button type="button" class="link fill-link" data-fill="${esc(target)}"${field ? ` data-field="${esc(field)}"` : ''}${id != null ? ` data-id="${esc(String(id))}"` : ''}>${label}</button>`;
  return small ? `<small>${b}</small>` : b;
}

/** Household link for one missing input key (income, age, cpfOa, cash, funds, cpfLifeMonthly); text = another wording
 *  (a sentence that was already the whole empty state, e.g. Afford's cash line). */
export const householdLink = (household, key, { small = false, field = null, text = null } = {}) =>
  fillLink({ target: 'household', field: field || householdField(household, key), text: text || key, small });

/** Remove fill links from cell HTML (the printed brief: paper cannot be tapped). */
export const stripFillLinks = (html) => String(html ?? '').replace(/<small><button type="button" class="link fill-link"[^>]*>[^<]*<\/button><\/small>/g, '')
  .replace(/<button type="button" class="link fill-link"[^>]*>[^<]*<\/button>/g, '');

/** Delegated click handler: any [data-fill] inside root opens its place (bound once on document by main.js). */
export function bindFillLinks(root, bus) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-fill]');
    if (!b) return;
    const target = b.dataset.fill, field = b.dataset.field || '', id = b.dataset.id != null ? +b.dataset.id : null;
    if (!knownFill({ target, field })) return;
    e.preventDefault();
    if (target === 'household') bus.emit('household:open', { field });
    else bus.emit('fill:open', { target, field, id });
  });
}

/** Every English string this module shows (zh coverage test). */
export const uiStrings = () => Object.values(FILL_TEXT);
