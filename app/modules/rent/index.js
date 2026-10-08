// "Rent & Buy" tab: is this rent fair (hero, with the quarterly trend chart), rent or buy (+ chart), then the
// rules folded away — what this household may buy / borrow / rent and renting out (rules.js). Based on the
// picked block, the area drawn on the map, or a typical flat for the map's selection ("Based on" switch;
// core/typical.js). Engines: rent, rentbuy, monthly-cost, plan (+ eligibility, landlord in rules.js). Rent or buy
// shows a winner only for a path the household can take (buygate.js, Phase 7 A6).
// 7b B7: one rent figure (core/rentshare.js, store plan.rent — also Plan's "Your rent now"): whole flat or room, the
// amount and the place (town / block picked in the card, place.js) survive a reload. A room rent is the user's own
// figure — never estimated, never judged (room.js).
import { rentComps, fairRent, grossYield, rentToIncome } from '../../engine/rent.js';
import { rentVsBuy, scenarios } from '../../engine/rentbuy.js';
import { monthlyCost } from '../../engine/monthly-cost.js';
import { planPurchase } from '../../engine/plan.js';
import { summarise } from '../../engine/household.js';
import { data } from '../../core/data.js';
import { esc, money, pct } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { keepFolds, saveView } from '../../core/fold.js';
import { lastSelection, onTypicalChange, scopeOf, typicalPriceWidened, typicalRent, defaultFlatType, bindPickMap, ftWord, townName } from '../../core/typical.js';
import { missingFields, needPrompt } from '../../core/missing.js';
import { bindNeeds } from '../../core/quickfill.js';
import { pathwaysSection, landlordSection, ftLabel } from './rules.js';
import { buyGate, rbVerdict } from './buygate.js';
import { drawChart, signedMoney } from './chart.js';
import { drawRentChart } from './rentchart.js';
import { runMc, mcResult, MC_DRAWS_RENTBUY } from '../../core/mc.js';
import { MC_FLAG, rangeToggle, rangeBlock } from './range.js';
import { rentTypeField, amountField, roomBody, windowLine, rentCompared, rentToCompare } from './room.js';
import { rentPlace, placeFields, changePlaceLink, bindPlace } from './place.js';
import { sharedRent, rentAmount, bindSharedRent } from '../../core/rentshare.js';

const FLAT_TYPES = ['2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE'];
const VERDICT = { below: 'Below the usual range', fair: 'Fair', above: 'Above the usual range', 'well-above': 'Well above the usual range', unknown: 'Not enough data' };

export function mountRent({ store, policy, bus, el }) {
  // basis: null = automatic (the most recent of block / area), else the user's choice in "Based on"
  const local = { placeOpen: false, horizon: 10, scenario: 'base', basis: null, chart: {}, lo: { ownerCitizenship: 'SC', flatClass: 'standard', mopMet: true, mode: 'room', roomsLet: 1, occupants: 3, months: 12, tenants: 'other', rent: null } };
  const focus = () => store.get('focus');
  const rent = () => sharedRent(store.get('plan')); // { type, amount, town, bid, label } — the shared figure
  const setRent = (patch) => store.set('plan.rent', { ...(store.get('plan.rent') || {}), ...patch });
  const folds = keepFolds(el);
  let rb = null, trend = null, disposeChart = () => {}, disposeTrend = () => {};

  // ---------------------------------------------------------------- what the tab is based on
  const blockName = (f) => data.block(f.bid)?.label || f.label || t('this flat');
  function options() {
    const f = focus(), sel = lastSelection(), out = [];
    const pl = data.hdb ? rentPlace(store.get('plan')) : null;
    if (pl && pl.label) out.push({ v: 'place', label: pl.label, place: pl }); // the place saved with your rent (B7)
    if (f && f.bid != null && data.hdb) out.push({ v: 'block', label: blockName(f) });
    if (sel?.area?.blockIds?.length) out.push({ v: 'area', label: sel.area.label || t('drawn area') });
    if (data.hdb) out.push({ v: 'typical', label: t('Typical: {0}', [scopeOf({ ...(sel || {}), area: null }).label]) });
    return out;
  }
  const chosen = (opts) => (opts.some((o) => o.v === local.basis) ? local.basis : (opts[0] || {}).v || null);

  /** Everything the two sections need for the chosen basis (comps, price, chart town). */
  function context(h) {
    const f = focus(), sel = lastSelection(), opts = options(), basis = chosen(opts);
    const ft = defaultFlatType(f, sel), win = sel && sel.window;
    const c = { basis, opts, ft, f, comps: null, price: null, priceDefault: false, priceScope: null, lease: null, town: null, chartNote: null, sub: null };
    if (basis === 'place') {
      const pl = opts.find((o) => o.v === 'place').place, scope = { kind: 'towns', towns: [pl.town], label: townName(pl.town) };
      c.town = pl.town; c.sub = pl.label;
      if (pl.bid != null) { const r = data.rentsFor(pl.bid); c.comps = data.rents ? rentComps(r.block, ft, policy, r.town) : null; }
      else c.comps = typicalRent({ flatType: ft, scope }, policy);
      Object.assign(c, typicalFor(ft, scope, win));
    } else if (basis === 'block') {
      const r = data.rentsFor(f.bid);
      c.town = data.townOf(f.bid);
      c.comps = data.rents ? rentComps(r.block, ft, policy, r.town) : null;
      c.sub = f.label;
      if (f.price > 0) { c.price = f.price; c.lease = f.remainingLease ?? null; }
      else if (c.town) Object.assign(c, typicalFor(ft, { kind: 'towns', towns: [c.town], label: townName(c.town) }, win));
    } else if (basis === 'area') {
      const scope = scopeOf(sel);
      c.town = scope.town;
      c.comps = typicalRent({ flatType: ft, scope }, policy);
      Object.assign(c, typicalFor(ft, scope, win));
      c.chartNote = c.town ? t('Town median ({0}) — no quarterly history for a drawn area', [townName(c.town)]) : null;
    } else if (basis === 'typical') {
      const scope = scopeOf({ ...(sel || {}), area: null });
      c.town = scope.kind === 'towns' && scope.towns.length === 1 ? scope.towns[0] : null;
      c.comps = typicalRent({ flatType: ft, scope }, policy);
      Object.assign(c, typicalFor(ft, scope, win));
    }
    c.income = summarise(h).income;
    return c;
  }
  function typicalFor(ft, scope, win) {
    const r = typicalPriceWidened({ flatType: ft, scope, window: win });
    return r ? { price: Math.round(r.price), priceDefault: true, priceScope: r.scope } : {};
  }

  // ---------------------------------------------------------------- is this rent fair?
  function basisField(c) {
    if (c.opts.length < 2) return c.opts.length ? `<p class="sec-sub">${esc(c.basis === 'block' && c.sub ? c.sub : c.opts[0].label)}</p>` : '';
    const btn = (o) => {
      const on = o.v === c.basis;
      return `<button type="button" role="radio" data-v="${o.v}" aria-checked="${on}" tabindex="${on ? 0 : -1}" class="${on ? 'on' : ''}" title="${esc(o.label)}">${esc(o.label)}</button>`;
    };
    return `<div class="seg-field rb-ctx"><span class="f-label" id="rbCtxLbl">${t('Based on')}</span>
      <div class="seg" id="rbCtx" role="radiogroup" aria-labelledby="rbCtxLbl">${c.opts.map(btn).join('')}</div></div>`;
  }

  function rentSection(c, h) {
    const head = `<div class="section" id="rentFair"><h3>${t('Is this rent fair?')}</h3>`, simple = store.get('ui.mode') === 'simple'; // B10 plain words
    const rt = rent(), room = rt.type === 'room', asking = rt.amount;
    if (!data.rents || !c.basis) return `${head}${rentTypeField(rt.type)}<div class="fields">${amountField(rt.type, asking)}</div>${room ? roomBody(null, null, '') : ''}<p class="hint">${t('Loading rent data…')}</p></div>`;
    const { comps, ft } = c;
    // where: the town / block picker unless a map block is in use (then "Based on" + "Change place")
    const showPlace = c.basis !== 'block' || local.placeOpen;
    const place = showPlace ? placeFields(rentPlace(store.get('plan')), data.hdb ? data.hdb.towns.slice().sort() : []) : '';
    const placeLink = showPlace ? '' : changePlaceLink();
    // a room: the user's own figure — no median, no verdict, no chart, no yield (DEC-016 Q3)
    if (room) {
      trend = null;
      const need = needPrompt(missingFields(h, ['income']), 'rbShare', { compact: true });
      return `${head}${rentTypeField(rt.type)}${basisField(c)}${placeLink}
        <div class="fields">${place}${amountField('room', asking)}</div>
        ${roomBody(asking, c.income, need)}</div>`;
    }
    const fair = comps && asking ? fairRent({ asking, comps }, policy) : null;
    const tierLabel = { block12: t('this block, last 12 months'), block24: t('this block, last 24 months'), town: t('whole town') };
    const series = c.town ? data.rents.towns[c.town]?.[ft]?.q || [] : [];
    trend = series.some((v) => v != null) ? { q: series, quarters: data.rents.quarters, flatType: ft, town: townName(c.town), asking, state: local.chart } : null;
    const rentNow = asking || comps?.med;
    const share = !comps ? '' : c.income
      ? `<div class="kpi"><small>${t('Rent as share of income')}</small><b>${pct(rentToIncome({ rent: rentNow, income: c.income }))}</b><small>${t('household gross income')}</small></div>`
      : needPrompt(missingFields(h, ['income']), 'rbShare', { compact: true });
    const none = c.basis === 'typical' && !c.town && !comps
      ? `<p class="hint">${t('Pick a town or draw an area to get a typical rent')} <button type="button" class="link" data-act="pick-map">${t('Pick on the map →')}</button></p>`
      : `<p class="hint">${t('No rental records for this flat type here.')}</p>`;
    return `${head}${rentTypeField(rt.type)}${basisField(c)}${placeLink}
      <div class="fields">${place}
        <label class="f"><span>${t('Flat type')}</span><select id="rtFt">${FLAT_TYPES.map((x) => `<option value="${x}"${x === ft ? ' selected' : ''}>${ftLabel(x)}</option>`).join('')}</select></label>
        ${amountField('whole', asking, comps ? Math.round(comps.med) : '')}
      </div>
      ${comps ? `<div class="kpis"><div class="kpi"><small>${t('Median rent')} (${esc(tierLabel[comps.tier] || comps.label || '')})</small><b>${money(comps.med)}</b><small>${simple && comps.p25 && comps.n ? t('middle half of {0} rentals: {1}–{2}', [comps.n, money(comps.p25), money(comps.p75)]) : `${comps.p25 ? `${t('middle half')} ${money(comps.p25)}–${money(comps.p75)}` : ''}${comps.n ? (simple ? ` · ${t('{0} rentals', [comps.n])}` : ` · n=${comps.n}`) : ''}`}</small></div>
        <div class="kpi"><small>${t('Verdict')}</small><b>${fair ? esc(t(VERDICT[fair.verdict])) : '—'}</b><small>${fair?.band ? `${t('usual')}: ${money(fair.band[0])}–${money(fair.band[1])}` : t('enter the asking rent')}</small></div>
        ${share}
        ${c.price ? `<div class="kpi"><small>${t('Gross rental yield')}</small><b>${pct(grossYield({ annualRent: rentNow * 12, price: c.price }), 1)}</b><small>${t('rent ÷ price')} ${money(c.price)}</small></div>` : ''}</div>` : none}
      ${comps ? windowLine(comps, data.rents.months) : ''}
      ${trend ? `<div class="rt-chart"></div><p class="hint">${esc(c.chartNote || t('HDB quarterly median rent for this town and flat type.'))}</p>` : ''}
      <p class="hint">${t('Source: HDB rental approvals (data.gov.sg), {0} to {1}.', [data.rents.months[0], data.rents.months[1]])}</p></div>`;
  }

  // ---------------------------------------------------------------- rent vs buy
  // Monte-Carlo range (Pro, off by default): the worker runs once per input; the render that finds it finished draws the bands
  const mcFailed = new Set(), mcWaiting = new Set();
  function mcState(x) {
    if (store.get(MC_FLAG) !== true || store.get('ui.mode') !== 'pro') return { state: 'off', out: null };
    const args = { x }, opts = { n: MC_DRAWS_RENTBUY }, key = JSON.stringify(args);
    const out = mcResult('rentbuy', args, opts);
    if (out) return { state: 'done', out };
    if (mcFailed.has(key)) return { state: 'error', out: null };
    if (!mcWaiting.has(key)) {
      mcWaiting.add(key);
      runMc('rentbuy', args, policy, opts).then(() => { mcWaiting.delete(key); render(); },
        (err) => { mcWaiting.delete(key); console.warn('Monte-Carlo range', err); mcFailed.add(key); render(); });
    }
    return { state: 'pending', out: null };
  }

  function rentBuySection(c, h) {
    rb = null;
    const head = `<div class="section" id="rentBuy"><h3>${t('Rent or buy?')}</h3>`;
    if (!(c.price > 0)) return `${head}<p class="hint">${data.hdb ? t('Pick a flat with a price (Afford this → on the map) to compare renting with buying.') : t('Loading map data…')}</p></div>`;
    const rt = rent(), room = rt.type === 'room';
    // a room: only the rent you typed — never a median (no public room data); a whole flat: yours, else the median here
    const ft = c.ft, { rent: rentNow, typed } = rentToCompare(rt, c.comps);
    if (!rentNow) return `${head}<p class="hint">${room ? t('Enter your room rent above to compare.') : t('Enter a rent above to compare.')}</p></div>`;
    const plan = planPurchase({ household: h, flat: { price: c.price, flatType: ft, remainingLease: c.lease } }, policy);
    const vs = `${money(c.price)} ${t('vs')} ${money(rentNow)}/${t('month')}`;
    const sub = `<p class="sec-sub">${c.priceDefault ? `${esc(t('Typical {0} in {1}', [ftWord(ft), c.priceScope.label]))} · ` : ''}${vs}</p>
      <p class="hint rb-rent">${esc(rentCompared(rt.type, rentNow, typed))}</p>`;
    // eligibility and cash before any winner (Phase 7 A6): a path the household can't take gets no comparison
    const gate = buyGate(plan, policy, { household: h, price: c.price, rent: rentNow, rentIsAsking: typed, room });
    if (gate.blocked) return `${head}${sub}${gate.html}</div>`;
    const o = plan.chosen;
    const mc = monthlyCost({ flatType: ft, price: c.price, loan: { amount: o.loan, rate: o.rate, years: o.tenure || 1 }, marketMonthlyRent: rentNow }, policy);
    const owner = mc.total - (mc.items.find((i) => i.id === 'mortgage')?.monthly || 0);
    const sc = scenarios(policy);
    const x = { horizonYears: local.horizon, buy: { price: c.price, flatType: ft, loanType: o.loanType, loanAmount: o.loan, rate: o.rate, tenure: o.tenure || 1, upfrontCash: o.funding.cashNeeded, upfrontCpf: o.funding.cpfUsed, monthlyOwnerCosts: owner }, rent: { monthlyRent: rentNow }, assumptions: sc[local.scenario] };
    const res = rentVsBuy(x, policy);
    const range = mcState(x);
    const last = res.series.at(-1), diff = last.buyNetWorth - last.rentNetWorth;
    const beText = res.breakEvenYear != null ? t('Buying overtakes renting in year {0}.', [res.breakEvenYear]) : t('Buying does not overtake renting within this period.');
    rb = { res, bands: range.out ? range.out.bands : null, aria: `${t('Net worth over {0} years: buying ends at {1}, renting and investing at {2}.', [last.year, signedMoney(last.buyNetWorth), signedMoney(last.rentNetWorth)])} ${beText}` };
    const table = `<table class="mini"><thead><tr><th>${t('Year')}</th><th>${t('Buy')}</th><th>${t('Rent and invest')}</th><th>${t('Difference')}</th></tr></thead><tbody>
      ${res.series.map((s) => `<tr><td>${s.year === 0 ? t('Now') : s.year}</td><td>${signedMoney(s.buyNetWorth)}</td><td>${signedMoney(s.rentNetWorth)}</td><td>${signedMoney(s.buyNetWorth - s.rentNetWorth)}</td></tr>`).join('')}
    </tbody></table>`;
    return `${head}${sub}${gate.html}
      <div class="fields">
        <label class="f"><span>${t('Over')}</span><select id="rbH">${[5, 10, 20].map((y) => `<option value="${y}"${y === local.horizon ? ' selected' : ''}>${t('{0} years', [y])}</option>`).join('')}</select></label>
        <label class="f"><span>${t('Price outlook')}</span><select id="rbS">${Object.entries(sc).map(([k, v]) => `<option value="${k}"${k === local.scenario ? ' selected' : ''}>${t(k)} (${(v.priceGrowth * 100).toFixed(0)}%/${t('yr')})</option>`).join('')}</select></label>
      </div>
      ${rbVerdict(diff, gate)}
      <p class="hint">${gate.noWinner ? '' : `${beText} `}${store.get('ui.mode') === 'simple' ? t('Monthly owner costs (property tax, town council fees, utilities, insurance)') : t('Monthly owner costs (tax, S&CC, utilities, insurance)')}: ${money(owner)}.</p>
      ${res.flags.map((x) => `<p class="hint">• ${esc(t(x))}</p>`).join('')}
      ${rangeToggle(store.get(MC_FLAG) === true)}
      <div class="rb-chart"></div>
      ${rangeBlock(range.state, range.out)}
      <details class="fold-inline" data-fold="rbTable"${folds.attr('rbTable', false)}><summary>${t('Show as a table')}</summary>${table}</details>
      <p class="hint">${t('Net worth = home equity (after selling costs and CPF refund) vs savings invested by the renter. Assumptions are editable in the rules file; not a forecast.')}</p></div>`;
  }

  function render() {
    const h = store.get('household');
    const restore = saveView(el);
    folds.snapshot();
    disposeChart(); disposeTrend();
    const c = context(h);
    el.innerHTML = rentSection(c, h) + rentBuySection(c, h)
      + `<p class="group-label">${t('Rules and checks')}</p>`
      + pathwaysSection(h, policy, folds) + landlordSection(c.f, local.lo, policy, folds)
      + `<p class="foot-note">${t('Educational guide — not legal or financial advice. HDB, CPF Board and IRAS have the final say.')}</p>`;
    disposeChart = rb ? drawChart(el.querySelector('#rentBuy .rb-chart'), rb.res, rb.aria, rb.bands, store.get('ui.mode')) : () => {};
    disposeTrend = trend ? drawRentChart(el.querySelector('#rentFair .rt-chart'), trend) : () => {};
    bus.emit('learn:decorate', { root: el });
    restore();
  }

  el.addEventListener('change', (e) => {
    const x = e.target;
    if (x.id === 'rtFt') { store.set('focus', { ...(focus() || {}), flatType: x.value }); return; }
    if (x.id === 'rtAsk') { setRent({ amount: rentAmount(x.value) }); return; } // the shared figure: re-render via the store
    if (x.id === 'rbH') local.horizon = +x.value;
    else if (x.id === 'rbS') local.scenario = x.value;
    else if (x.id === 'rbMc') { store.set(MC_FLAG, x.checked); return; }
    else if (x.dataset.lo) { const k = x.dataset.lo, v = x.value; local.lo[k] = k === 'mopMet' ? v === 'true' : ['occupants', 'months', 'rent'].includes(k) ? (v === '' ? null : +v) : v; }
    else return;
    render();
  });
  // rent type: whole flat or room (7b B7, saved with the shared rent). "Based on": any option. "Change place": the picker.
  el.addEventListener('click', (e) => {
    const ctx = e.target.closest('#rbCtx button[data-v]');
    if (ctx) { if (ctx.dataset.v !== chosen(options())) { local.basis = ctx.dataset.v; render(); el.querySelector(`#rbCtx [data-v="${ctx.dataset.v}"]`)?.focus(); } return; }
    if (e.target.closest('[data-act="rent-place"]')) { local.placeOpen = true; render(); el.querySelector('#rtTown')?.focus(); return; }
    const b = e.target.closest('#rtType button[data-rt]');
    if (!b || b.dataset.rt === rent().type) return;
    setRent({ type: b.dataset.rt });
    el.querySelector(`#rtType [data-rt="${b.dataset.rt}"]`)?.focus();
  });
  el.addEventListener('keydown', (e) => {
    const b = e.target.closest?.('#rtType button[data-rt], #rbCtx button[data-v]');
    if (!b) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const all = [...b.parentElement.querySelectorAll('button')];
      const next = all[(all.indexOf(b) + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length];
      all.forEach((x) => x.setAttribute('tabindex', x === next ? '0' : '-1'));
      next.focus();
    } else if ((e.key === ' ' || e.key === 'Enter') && b.getAttribute('aria-disabled') === 'true') e.preventDefault();
  });
  bindPickMap(el);
  bindNeeds(el, { store, bus });
  bindPlace(el, { store, onPlace: () => { local.basis = 'place'; local.placeOpen = false; } });
  bindSharedRent(store); // plan.rent.amount = plan.rentNow (Plan: BTO "Your rent now"), one figure

  // the most recent source wins: a newly picked block, or a newly drawn area
  let prev = focus();
  store.subscribe('focus', () => {
    const f = focus();
    if (f && f.bid != null && (!prev || prev.bid !== f.bid || prev.source !== f.source)) local.basis = 'block';
    prev = f;
    render();
  });
  bus.on('explore:area', (a) => { if (a && a.blockIds?.length) local.basis = 'area'; else if (local.basis === 'area') local.basis = null; });
  onTypicalChange(render);
  store.subscribe('household', render);
  store.subscribe('plan.rent', render); // the shared rent (also fires for plan.rentNow typed in Plan)
  store.subscribe(MC_FLAG, render);
  store.subscribe('ui.mode', render); // Simple ↔ Pro: the range (Pro) and the plain words (B10)
  bus.on('data:ready', render);
  render();
}
