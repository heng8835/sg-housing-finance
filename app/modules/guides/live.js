// Live numbers in guides: {live:key} placeholders resolved for the current household and flat at render time.
// The whitelist is LIVE below — tools/build_content.py LIVE_KEYS must list the same keys (tests compare them).
// Pure apart from t(): give it the household slice, the flat Afford is testing (core/typical effectiveFlat) and
// the policy; it runs the same engine call as the Afford tab (planPurchase), so the numbers match that tab.
import { planPurchase } from '../../engine/plan.js';
import { summarise } from '../../engine/household.js';
import { esc, money, pct } from '../../core/dom.js';
import { t } from '../../core/i18n.js';

/** What a value needs before it can be shown. 'flat' = a price in Afford (picked block, own price or the typical flat). */
export const NEED_IDS = ['income', 'age', 'cash', 'cpfOa', 'flat'];

/** key → { needs, get(ctx) → raw value, fmt } ; ctx = { h, s, plan, flat } */
export const LIVE = {
  'household.buyers': { needs: [], get: (c) => Math.max(1, (c.h.buyers || []).length), fmt: 'count' },
  'household.income': { needs: ['income'], get: (c) => c.s.income, fmt: 'money' },
  'household.youngest_age': { needs: ['age'], get: (c) => c.s.youngestAge, fmt: 'count' },
  'household.cash': { needs: ['cash'], get: (c) => c.s.cash, fmt: 'money' },
  'household.cpf_oa': { needs: ['cpfOa'], get: (c) => c.s.cpfOa, fmt: 'money' },
  'household.funds': { needs: ['cash', 'cpfOa'], get: (c) => c.s.funds, fmt: 'money' },
  'household.loan_type': { needs: [], get: (c) => (c.h.loan === 'bank' ? 'bank loan' : 'HDB loan'), fmt: 'word' },
  'afford.flat': { needs: ['flat'], get: (c) => c.flat.label || t('your price'), fmt: 'text' },
  'afford.price': { needs: ['flat'], get: (c) => c.flat.price, fmt: 'money' },
  // upTo: short lease (A4) — HDB / CPF pro-rate by formulas not published, so the figure is the most it could be
  'afford.loan': { needs: ['flat'], get: (c) => c.plan.chosen.loan, fmt: 'money', upTo: (c) => !!(c.plan.shortLease && c.plan.chosen.loanType === 'hdb') },
  'afford.downpayment': { needs: ['flat'], get: (c) => c.plan.chosen.down, fmt: 'money' },
  'afford.bsd': { needs: ['flat'], get: (c) => c.plan.chosen.duty, fmt: 'money' },
  'afford.grants': { needs: ['flat', 'income'], get: (c) => c.plan.grants.total, fmt: 'money', upTo: (c) => !!(c.plan.shortLease && c.plan.shortLease.ehgUpTo) },
  'afford.upfront': { needs: ['flat'], get: (c) => c.plan.chosen.funding.net, fmt: 'money' },
  'afford.cash_needed': { needs: ['flat', 'cpfOa'], get: (c) => c.plan.chosen.funding.cashNeeded, fmt: 'money' },
  'afford.instalment': { needs: ['flat'], get: (c) => c.plan.chosen.monthly, fmt: 'money' },
  'afford.msr': { needs: ['flat', 'income'], get: (c) => c.plan.chosen.msrAssessed, fmt: 'pct' },
  'afford.max_price': { needs: ['flat', 'income'], get: (c) => c.plan.budget.maxPrice, fmt: 'money' },
  'afford.tenure': { needs: ['flat'], get: (c) => c.plan.chosen.tenure, fmt: 'count' },
};

const empty = (v) => v == null || v === '' || !Number.isFinite(+v);

/** Which needs are not met for this household / flat. */
export function unmet(h, flat) {
  const s = summarise(h || {}), buyers = (h && h.buyers) || [];
  const cpfBuyers = buyers.filter((b) => b && b.citizenship !== 'F'); // foreigners have no CPF
  return {
    income: s.income == null,
    age: s.youngestAge == null,
    cash: empty(h && h.cash),
    cpfOa: cpfBuyers.length > 0 && cpfBuyers.every((b) => empty(b.cpfOa)),
    flat: !(flat && flat.price > 0),
  };
}

/** The household field to open for a need (first empty buyer field, like core/missing.js). */
export function fieldFor(need, h) {
  if (need === 'cash') return 'cash';
  if (need === 'flat') return null;
  const buyers = (h && h.buyers) || [];
  const i = buyers.findIndex((b) => b && !(need === 'cpfOa' && b.citizenship === 'F') && empty(b[need]));
  return `buyers.${Math.max(0, i)}.${need}`;
}

/**
 * Resolve live keys. Returns { values: { key: { text, missing: [needs] } }, needs: [unmet needs used] }.
 * Only computes the purchase plan when a flat with a price is known (and something asks for it).
 * sale = engine/salefunds.js saleInput(plan, year) — the home being sold, counted as the Afford tab counts it (A2).
 */
export function resolveLive(keys, { household, flat, policy, sale = null }) {
  const h = household || {}, miss = unmet(h, flat);
  const s = summarise(h);
  let plan = null;
  const ctx = { h, s, flat, get plan() {
    if (!plan) plan = planPurchase({ household: h, flat: { price: flat.price, flatType: flat.flatType || '4 ROOM', remainingLease: flat.remainingLease ?? null, cov: flat.cov || 0 }, sale }, policy);
    return plan;
  } };
  const values = {}, used = new Set();
  for (const key of keys) {
    const def = LIVE[key];
    if (!def) { values[key] = { text: '—', missing: [] }; continue; }
    const missing = def.needs.filter((n) => miss[n]);
    missing.forEach((n) => used.add(n));
    if (missing.length) { values[key] = { text: '—', missing }; continue; }
    let raw, upTo = false;
    try { raw = def.get(ctx); upTo = !!(def.upTo && raw != null && def.upTo(ctx)); } catch { raw = null; }
    const text = format(raw, def.fmt);
    values[key] = { text: upTo ? t('up to {0}', [text]) : text, missing: [] };
  }
  return { values, needs: NEED_IDS.filter((n) => used.has(n)) };
}

export function format(raw, fmt) {
  if (raw == null || (typeof raw === 'number' && !Number.isFinite(raw))) return '—';
  if (fmt === 'money') return money(raw);
  if (fmt === 'pct') return pct(raw);
  if (fmt === 'count') return Math.round(raw).toLocaleString('en-SG');
  if (fmt === 'word') return t(String(raw));
  return String(raw); // 'text': already translated (labels from core/typical) or a name
}

/** Replace {live:key} in built guide HTML with the resolved values (blue spans; "—" with a tooltip when missing). */
export function fillLive(htmlText, values) {
  return String(htmlText || '').replace(/\{live:([a-z0-9_.]+)\}/gi, (_, key) => {
    const v = values[key] || { text: '—', missing: [] };
    if (v.missing.length) return `<span class="g-live missing" title="${esc(t('Needs: {0}', [v.missing.map((n) => t(NEED_WORDS[n])).join(', ')]))}">—</span>`;
    return `<span class="g-live">${esc(v.text)}</span>`;
  });
}

export const NEED_WORDS = { income: 'income', age: 'age', cash: 'cash savings', cpfOa: 'CPF OA balance', flat: 'a flat price' };

/** Live keys used in a text, in order, without duplicates. */
export const liveKeysIn = (text) => [...new Set([...String(text || '').matchAll(/\{live:([a-z0-9_.]+)\}/gi)].map((m) => m[1]))];
