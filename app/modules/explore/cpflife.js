// Compare table row "CPF LIFE at 65 (est.)" (roadmap CPF-11): the household's estimated CPF LIFE payout with vs
// without each shortlisted flat — engine/cpfpayout.js, the same projection as Plan → CPF & retirement.
// legacy.js hooks: createCpfLife(...) once, then ROWS() → insert(rows); ROW_TERMS ← terms.
import { lifePayoutDelta, payoutReadiness } from '../../engine/cpfpayout.js';
import { CPF_DEFAULTS } from '../../core/cpf-defaults.js';
import { money } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { isSimple } from '../../core/plain.js';
import { fillLink } from '../../core/filllink.js';

/** Lookup key (English, stable); the label shows the payout age from policy. */
export const ROW_KEY = 'CPF LIFE at payout age (est.)';
const AFTER_KEY = 'Most you can pay'; // last money row (./money.js ROW_KEYS.most, 7a A1)
/** Simple-mode label (B10): "CPF LIFE" named by what it is. */
export const SIMPLE_LABEL = 'Monthly CPF payout from {0} (est.)';

/** "−S$310" / "+S$20" (U+2212 minus). */
export const signedMoney = (v) => `${v < 0 ? '−' : '+'}${money(Math.abs(v))}`;

/** Cell HTML for one lifePayoutDelta() result. Buyers at the payout age (A10): no projection — their entered payout.
 *  mode 'simple' (B10): the same amounts as "S$310 less a month than if you don't buy". */
export function cellHtml(r, mode = 'pro') {
  if (!r) return '—';
  // fill links (core/filllink.js): the drawer opens on that buyer's field
  const open = (field, text) => fillLink({ target: 'household', field, text, small: true });
  const addPayout = (i) => open(`buyers.${i ?? 0}.cpfLifeMonthly`, 'cpfLifeMonthly');
  if (r.ok) {
    const missing = (r.payoutMissing || []).length ? addPayout(r.payoutMissing[0]) : '';
    if (r.allAtPayout) return `${t('no change: payouts have started')}<small>${t('{0}/mo you entered', [money(r.without.monthly)])}</small>${missing}`;
    if (isSimple(mode)) {
      const head = r.delta === 0 ? t('no change vs not buying') : r.delta < 0 ? t("about {0} less a month than if you don't buy", [money(-r.delta)]) : t("about {0} more a month than if you don't buy", [money(r.delta)]);
      return `${head}<small>${t('{0} a month without this flat, {1} with it (estimate)', [money(r.without.monthly), money(r.withBuy.monthly)])}</small>${missing}`;
    }
    const head = r.delta === 0 ? t('no change vs not buying') : t('≈ {0}/mo vs not buying', [signedMoney(r.delta)]);
    return `${head}<small>${t('{0} → {1}/mo (estimate)', [money(r.without.monthly), money(r.withBuy.monthly)])}</small>${missing}`;
  }
  if (r.reason === 'atpayout') return `—${addPayout(r.buyer)}`;
  if (r.reason === 'nobalances') return `—${open(`buyers.${r.buyer ?? 0}.cpfOa`, 'cpfOa')}`;
  if (r.reason === 'noage') return `—${open(`buyers.${r.buyer ?? 0}.age`, 'age')}`;
  if (r.reason === 'foreigner') return `—<small>${t('no CPF LIFE for foreigners')}</small>`;
  return '—';
}

/**
 * @param {{ policy:object, store:object, bus:object, D:object, body?:HTMLElement|null, rerender?:()=>void, year?:()=>number }} x
 *   D = window.HDB_DATA (flat types); the "Add … →" links are fill links (core/filllink.js, bound in main.js)
 * → { row(), insert(rows), terms }
 */
export function createCpfLife({ policy, store, bus, D, body = null, rerender = null, year = () => new Date().getFullYear() }) {
  const A65 = policy.get('cpf.age.life_payout'), A55 = policy.get('cpf.age.ra_formation');
  const settings = () => ((store.get('plan') || {}).cpf) || {};
  // the compare table re-renders on household changes already; Plan-tab CPF settings (pay rise, bonus, PR year) too
  let last = JSON.stringify(settings());
  if (rerender) store.subscribe('plan', () => { const s = JSON.stringify(settings()); if (s !== last) { last = s; rerender(); } });

  /** One row per render: household and settings are read now; results memoised per metrics object. */
  function row() {
    const household = store.get('household'), s = settings(), y = year(), memo = new WeakMap();
    const of = (m) => {
      if (!memo.has(m)) {
        let r;
        try { r = lifePayoutDelta({ household, flat: { price: m.c.price, flatType: D.flat_types[m.c.ft], remainingLease: m.leaseNow ?? null }, settings: s, defaults: CPF_DEFAULTS, year: y }, policy); } catch { r = null; }
        memo.set(m, r);
      }
      return memo.get(m);
    };
    const ready = !payoutReadiness(household, policy);
    return {
      k: ROW_KEY, lbl: t('CPF LIFE at {0} (est.)', [A65]), slbl: t(SIMPLE_LABEL, [A65]), simple: true, f: (m) => cellHtml(of(m)), fs: (m) => cellHtml(of(m), 'simple'),
      // best = smallest reduction; only a measure once the household's CPF can be projected
      ...(ready ? { v: (m) => { const r = of(m); return r && r.ok ? r.delta : null; }, best: 'max' } : {}),
      tip: t('Estimated CPF LIFE (Standard) monthly payout from {0} for all buyers, if you buy this flat vs if you do not. OA used upfront and for the instalments no longer goes into the Retirement Account at {1}, so the payout is lower. Same projection as Plan → CPF & retirement. An estimate, not a CPF quote.', [A65, A55]),
    };
  }
  /** Put the row at the end of "Can we afford it?" (after "Most you can pay"; else before the next section). */
  function insert(r) {
    let at = r.findIndex((x) => x.k === AFTER_KEY) + 1;
    if (at <= 0) { const s = r.findIndex((x) => x.sec === 'Can we afford it?'); at = s < 0 ? r.length : r.findIndex((x, i) => i > s && x.sec); if (at < 0) at = r.length; }
    r.splice(at, 0, row());
    return r;
  }
  return { row, insert, terms: { [ROW_KEY]: 'cpf-housing' } };
}
