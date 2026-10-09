// Afford tab: can this household afford the focus flat — verdict, cash vs CPF, HDB vs bank, stress,
// repayments, and the most they can pay. Reads household + focus from the store; pure maths in engine/plan.js.
// No price yet → a typical flat for the map's selection (core/typical.js), labelled, never stored.
import { planPurchase } from '../../engine/plan.js';
import { parentsKmFor, withParents } from '../../core/parents.js';
import { esc, money, kilo, pct } from '../../core/dom.js';
import { stackBar, repaymentChart, repaymentTable } from './charts.js';
import { monthlyPanel, bindMonthly } from './monthly.js';
import { t } from '../../core/i18n.js';
import { flatTypeLabel } from '../../core/flattype.js';
import { keepFolds, saveView } from '../../core/fold.js';
import { effectiveFlat, defaultNote, bindPickMap, onTypicalChange, marketRentFor } from '../../core/typical.js';
import { missingFields, needPrompt } from '../../core/missing.js';
import { bindNeeds } from '../../core/quickfill.js';
import { householdLink } from '../../core/filllink.js';
import { saleInput } from '../../engine/salefunds.js';
import { saleBanner, shortLeaseNote, grantsAmount, cashShortLine } from './verdict.js';
import { retypePatch, noSalesHint, blockMedian, blockLabelOf } from './flattype.js';
import { isSimple, incomeShareText, grantName, reasonText } from '../../core/plain.js';
import { grantNotesFor } from '../../core/grantnotes.js';
import { bankLoanNote, grantsMissingFold } from './eligible.js';
import { moneyInput, moneyValue, bindMoneyInputs } from '../../core/moneyinput.js';
import { basedOnHtml } from '../../core/focusflat.js';

const FLAT_TYPES = ['2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'];
const VERDICT = { ok: ['good', '✓', 'Within your limits'], tight: ['warn', '!', 'Possible, but tight'], no: ['critical', '✕', 'Not affordable as it stands'], unknown: ['neutral', '?', 'Need a few more details'] };
const SOURCE_IDS = ['loan.hdb.ltv', 'loan.bank.ltv', 'ratio.msr.cap', 'ratio.tdsr.cap', 'rate.floor.hdb', 'rate.floor.bank', 'rate.hdb.concessionary', 'stamp.bsd.bands', 'stamp.absd.rates', 'grant.ehg.family', 'grant.chg.resale.family', 'grant.phg', 'eligibility.income_ceiling.family', 'downpayment.bank.cash_min', 'fees.option_exercise.max', 'assumption.rate.bank', 'assumption.fees.legal',
  'sellbuy.hdb_loan.cash_retain_min', 'loan.hdb.ltv.short_lease_proration', 'cpf.usage.short_lease_proration', 'grant.ehg.short_lease_proration'];
const term = (id, text) => `<span data-term="${id}">${text}</span>`;
// DOM slot after the verdict: modules/scenarios moves its own card in here after each paint ('afford:painted')
const SLOT = '<div data-slot="scenarios"></div>';
// P8 M-01: on phones the flat's fields live in the flat bar's "Which flat?" sheet (modules/shell/flatbar.js asks with
// 'flatbar:inputs' {slot}), so Afford opens on the verdict; desktop keeps them in the first card (owner Q2)
const phoneMq = typeof matchMedia === 'function' ? matchMedia('(max-width: 767px)') : null;
const isPhone = () => !!(phoneMq && phoneMq.matches);
const BASED_ON = ['income', 'cash', 'cpfOa']; // P8 M-08: the household figures behind the verdict, one-field quick edits

export function mountAfford({ store, policy, bus, el }) {
  const focus = () => store.get('focus');
  const setFocus = (patch) => store.set('focus', { source: 'price', label: 'Your own figures', ...(focus() || {}), ...patch });
  const folds = keepFolds(el);
  let tfNow = null; // the flat on screen (focus, or the typical default)
  let sheetSlot = null; // phones: the "Which flat?" sheet's slot while it is open

  function flatForm(f, tf) {
    return `<div class="section" id="affordFlat"><h3>${t('The flat')}</h3>
      ${f && f.label && f.price > 0 ? `<p class="sec-sub">${esc(f.label)}</p>` : ''}
      ${flatFields(f, tf)}
    </div>`;
  }

  // price, flat type, remaining lease + their hints (the card on desktop, the sheet on phones — never both)
  function flatFields(f, tf, { hint = true } = {}) {
    const ftNow = f?.flatType || tf?.flatType || '4 ROOM';
    const ph = tf && tf.isDefault ? t('{0} (typical)', [tf.price.toLocaleString('en-SG')]) : t('e.g. {0}', ['600,000']);
    return `<div class="fields">
        <label class="f"><span>${t('Price (S$)')}</span>${moneyInput({ attrs: 'id="afPrice"', value: f?.price ?? null, placeholder: ph })}</label>
        <label class="f"><span>${t('Flat type')}</span><select id="afFt">${FLAT_TYPES.map((x) => `<option value="${x}"${x === ftNow ? ' selected' : ''}>${flatTypeLabel(x)}</option>`).join('')}</select></label>
        <label class="f"><span>${t('Remaining lease (years, optional)')}</span><input type="number" id="afLease" min="1" max="99" step="1" value="${f?.remainingLease != null ? Math.floor(f.remainingLease) : ''}"></label>
      </div>
      ${noSalesHint(f)}
      ${defaultNote(tf)}
      ${hint ? `<p class="hint">${t('Pick a block on the map (Afford this →), use Afford on a shortlisted flat, or type a price.')}</p>` : ''}`;
  }

  /** Phones: fill the open "Which flat?" sheet with the fields (same ids — the page has none then). */
  function fillSheet() {
    if (!sheetSlot || !sheetSlot.isConnected || !sheetSlot.closest('dialog[open]') || !isPhone()) return;
    const restore = saveView(sheetSlot, () => sheetSlot.closest('.bs-body'));
    sheetSlot.innerHTML = flatFields(focus(), tfNow, { hint: false }); // the sheet itself lists those ways
    restore();
  }

  // "Notes and sources" — folded card (closed by default): grant notes + the rules used
  function notesFold(p) {
    const rows = SOURCE_IDS.map((id) => { try { return policy.meta(id); } catch { return null; } }).filter(Boolean);
    const flag = (x) => (x.status === 'VERIFIED' ? '' : ` <span class="tag ${x.status === 'ASSUMPTION' ? 'neutral' : 'warn'}">${t(x.status.toLowerCase())}</span>`);
    return `<details class="section fold" id="affordNotes" data-fold="afNotes"${folds.attr('afNotes', false)}>
      <summary><span class="fold-t">${t('Notes and sources')}</span><span class="fold-s">${t('Grant notes and the rules behind these numbers')}</span></summary>
      <div class="fold-body">
        ${[...grantNotesFor(p.grants), ...(p.sale ? [...p.sale.notes, ...p.sale.assumptions] : [])].map((n) => `<p class="hint">• ${esc(t(n))}</p>`).join('')}
        ${isSimple(store.get('ui.mode')) ? `<p class="hint">${t('These numbers use dated rules from official pages and a few fixed assumptions.')} <button type="button" class="link" data-act="rules-log">${t('Rules and recent changes →')}</button></p>` : ''}
        <h4 class="sub pro-only">${t('Rules used · as of {0} ({1}/{2} verified)', [esc(policy.version), rows.filter((x) => x.status === 'VERIFIED').length, rows.length])}</h4>
        <ul class="sources pro-only">${rows.map((x) => `<li>${esc(x.id)}${flag(x)} — ${x.source_url.startsWith('http') ? `<a href="${esc(x.source_url)}" target="_blank" rel="noopener">${t('source')}</a>` : t('modelling assumption')}, ${t('from')} ${esc(x.effective_from)}</li>`).join('')}</ul>
      </div></details>`;
  }

  function loanColumn(o) {
    return `<td>${o.eligible ? '' : `<span class="tag warn">${t('not eligible')}</span><br>`}${t('{0}/mo', [money(o.monthly)])}<br><small>${pct(o.ltv)} LTV · ${(o.rate * 100).toFixed(2)}% · ${t('{0} y', [o.tenure])}${o.lowerTier ? ' ' + t('(lower tier)') : ''}</small></td>`;
  }

  function render() {
    const restore = saveView(el);
    folds.snapshot();
    paint();
    folds.apply();
    restore();
  }

  function paint() {
    // someone who owns a home and will sell (an upgrader) gets the largest selected type, as Plan and Scenarios do
    const h = store.get('household'), f = focus(), tf = effectiveFlat(store, undefined, { prefer: store.get('plan.current.owns') ? 'largest' : null });
    tfNow = tf;
    let html = isPhone() ? '' : flatForm(f, tf);
    if (!tf) { el.innerHTML = html + SLOT + `<p class="foot-note">${t('Enter a price to see whether it fits.')}</p>`; bus.emit('afford:painted', { root: el }); fillSheet(); return bind(); }

    // the sale ticked in Plan → Sell then buy counts here too (A2); off → exactly the numbers without a sale
    const sale = saleInput(store.get('plan'), new Date().getFullYear());
    const p = planPurchase({ household: h, flat: withParents({ price: tf.price, flatType: tf.flatType || '4 ROOM', remainingLease: tf.remainingLease ?? null, cov: tf.cov || 0 }, parentsKmFor(h, tf)), sale }, policy);
    const c = p.chosen, [tone, icon, titleEn] = VERDICT[p.verdict.status], title = t(titleEn);
    const fund = c.funding;
    const hasIncome = p.summary.income != null;
    const mode = store.get('ui.mode'), simple = isSimple(mode); // B10: plain words in Simple, same numbers

    html += `<div class="section afford" id="affordVerdict" aria-live="polite"><h3>${t('Can you afford it?')}</h3>
      ${saleBanner(p, store.get('plan.current'), mode)}
      <div class="verdict"><span class="tag ${tone}">${icon} ${title}</span></div>
      ${p.verdict.reasons.map((r, i) => `<p class="hint">• ${esc(reasonText(p.verdict.codes[i], r, mode))}</p>`).join('')}
      ${bankLoanNote(p)}
      ${!hasIncome || p.verdict.status === 'unknown' || h.cash == null ? needPrompt(missingFields(h, ['income', 'age', 'cash']), 'afVerdict') : ''}
      <div class="kpis">
        <div class="kpi"><small>${term('instalment', t('Monthly instalment'))}</small><b data-qe-live="${esc(t('{0} a month', [money(c.monthly)]))}">${money(c.monthly)}</b><small>${!hasIncome ? householdLink(h, 'income') : simple ? `${incomeShareText(pct(c.msr), pct(c.msrAssessed), (c.assessRate * 100).toFixed(1) + '%')} ${term('msr', '')}` : t('{0} of income', [pct(c.msr)]) + ` · ${term('msr', 'MSR')} ` + t('test {0} at {1}', [pct(c.msrAssessed), (c.assessRate * 100).toFixed(1) + '%'])}</small></div>
        <div class="kpi"><small>${term('upfront-cost', t('Upfront after grants'))}</small><b>${money(fund.net)}</b><small>${t('cash {0} · CPF + grants {1}', [money(fund.cashNeeded), money(fund.cpfUsed)])}</small></div>
        <div class="kpi"><small>${t('Most you can pay')}</small><b>${p.budget.maxPrice != null ? kilo(p.budget.maxPrice) : '—'}</b><small>${p.budget.binding ? t(p.budget.binding === 'income' ? 'limited by income (loan limit)' : 'limited by your cash + CPF') : householdLink(h, 'income')}</small></div>
        <div class="kpi"><small>${term('ehg', t('Grants'))}${h.grantsOverride != null ? ` <span class="tag neutral">${t('your figure')}</span>` : ''}</small><b>${grantsAmount(p)}</b><small>${h.grantsOverride != null ? t('the amount you entered in About you') : p.grants.items.map((i) => `${simple ? esc(grantName(i.id)) : i.id.toUpperCase()} ${kilo(i.amount)}`).join(' · ') || t('none')}</small></div>
      </div>
      ${grantsMissingFold(p, h, mode)}
      ${shortLeaseNote(p)}
      ${p.budget.maxPrice ? `<div class="actions"><button type="button" class="btn sm primary" id="afBudget">${t('Show flats within budget on the map')}</button></div>` : ''}
      ${basedOnHtml(h, BASED_ON, { id: 'afBased', live: '.verdict .tag|.kpi b' })}
    </div>
    ${SLOT}
    ${monthlyPanel({ plan: p, focus: tf, household: h, policy, market: marketRentFor(tf, policy), mode })}
    <div class="section" id="affordUpfront"><h3>${t('Upfront: what you pay before keys')}</h3>
      ${stackBar(fund.items, t('Upfront costs'))}
      ${stackBar([{ id: 'cash', amount: fund.cashNeeded, label: t('From cash') }, { id: 'cpf', amount: fund.cpfUsed, label: simple ? t('From CPF + grants') : t('From CPF OA + grants') }], t('Cash vs CPF'))}
      ${cashShortLine(p, h)}
      <p class="hint">${simple ? `${t('Option fees and any cash over valuation must be paid in cash; your CPF can pay the rest of the downpayment, stamp duty and legal fees.')} ${term('cov', '')}` : `${t('Option and exercise fees and COV must be paid in cash; CPF OA can pay the rest of the downpayment, stamp duty and legal fees.')} ${term('cov', 'COV')} ${term('cpf-housing', 'CPF OA')}`}${p.absd.note ? ' ' + esc(t(p.absd.note)) : ''}</p>
    </div>
    <div class="section pro-only"><h3>${term('hdb-loan', t('HDB loan'))} ${t('vs')} ${term('bank-loan', t('bank loan'))}</h3>
      <table class="mini"><thead><tr><td></td><th>${t('HDB loan')}</th><th>${t('Bank loan')}</th></tr></thead><tbody>
        <tr><td>${t('Monthly')}</td>${p.options.map(loanColumn).join('')}</tr>
        <tr><td>${term('total-interest', t('Total interest'))}</td>${p.options.map((o) => `<td>${money(o.schedule.totalInterest)}</td>`).join('')}</tr>
        <tr><td>${term('msr', t('MSR test'))}</td>${p.options.map((o) => `<td>${hasIncome ? `${pct(o.msrAssessed)} ${o.msrOk ? '✓' : '✕'}` : '—'}</td>`).join('')}</tr>
        <tr><td>${term('tdsr', t('TDSR test'))}</td><td>—</td><td>${p.options[1].tdsr != null ? `${pct(p.options[1].tdsr)} ${p.options[1].tdsrOk ? '✓' : '✕'}` : '—'}</td></tr>
        <tr><td>${t('Cash needed')}</td>${p.options.map((o) => `<td>${money(o.funding.cashNeeded)}</td>`).join('')}</tr>
      </tbody></table>
      <p class="hint">${t('Bank rate is illustrative. HDB and banks test the loan at a floor rate, which can be higher than the rate you pay.')} ${term('floor-rate', '')}</p>
    </div>
    <div class="section pro-only"><h3>${term('stress-test', t('If rates rise (stress test)'))}</h3>
      <table class="mini"><tbody>${c.stress.map((s) => `<tr><td>+${(s.add * 100).toFixed(0)} pp</td><td>${t('{0}/mo', [money(s.monthly)])}</td><td>${s.share != null ? t('{0} of income', [pct(s.share)]) : ''}</td></tr>`).join('')}</tbody></table>
    </div>
    <div class="section pro-only"><h3>${term('amortisation', t('Repayments over {0} years', [c.tenure]))}</h3>
      ${repaymentChart(c.schedule.rows)}
      <details class="fold-inline" data-fold="afTable"${folds.attr('afTable', false)}><summary>${t('Show as a table')}</summary>${repaymentTable(c.schedule.rows)}</details>
    </div>
    ${notesFold(p)}
    <p class="foot-note">${t('Educational estimate — not financial advice and not an HFE letter or loan approval. Confirm with HDB, CPF Board, IRAS and your bank.')}</p>`;
    el.innerHTML = html;
    bus.emit('afford:painted', { root: el });
    bind(p);
    fillSheet();
    bus.emit('explore:budget', { maxPrice: p.budget.maxPrice, apply: false }); // keep the map's budget colours current
  }

  /** The flat's three fields (delegated: the page on desktop, the sheet's slot on phones). */
  function bindFlat(root) {
    const num = (v) => (v === '' ? null : +v);
    root.addEventListener('change', (e) => {
      const x = e.target;
      // typing a price over the typical default keeps the flat type on screen
      if (x.id === 'afPrice') { const v = moneyValue(x); if (!Number.isNaN(v)) setFocus({ price: v, source: 'price', label: t('Your own figures'), ...(focus()?.flatType || !tfNow ? {} : { flatType: tfNow.flatType }) }); }
      // a block hand-off brings that block's median for the new type (or no price), never the old type's median
      else if (x.id === 'afFt') { const f = focus(); setFocus(retypePatch(f, x.value, blockMedian, f && f.bid != null ? blockLabelOf(f.bid) : '')); }
      else if (x.id === 'afLease') setFocus({ remainingLease: num(x.value) });
    });
  }

  function bind(p) {
    // phone: the map is a separate screen — show it (Map tab, sheet at peek) so the result is visible (AC8, P-41)
    el.querySelector('#afBudget')?.addEventListener('click', () => { bus.emit('explore:budget', { maxPrice: p.budget.maxPrice, apply: true }); bus.emit('phone:show-map', {}); });
    el.querySelector('#afLoanWhy')?.addEventListener('click', () => bus.emit('learn:open', { id: 'hdb-loan' }));
    el.querySelector('#afSalePlan')?.addEventListener('click', () => { bus.emit('nav:goto', { tab: 'plan' }); bus.emit('plan:show', { section: 'planSellBuy' }); });
    bindMonthly(el, setFocus);
    bus.emit('learn:decorate', { root: el });
  }

  bindFlat(el);
  bindPickMap(el);
  // after bindPickMap: "Pick on the map →" lands on the Map tab with the sheet at peek on phones (no-op on desktop)
  el.addEventListener('click', (e) => { if (e.target.closest('[data-act="pick-map"]')) bus.emit('phone:show-map', {}); });
  el.addEventListener('click', (e) => { if (e.target.closest('[data-act="rules-log"]')) bus.emit('guides:open', {}); }); // 7c C9: Simple shows no rule ids
  bindMoneyInputs(el);
  bindNeeds(el, { store, bus });
  store.subscribe('household', render);
  store.subscribe('focus', render);
  store.subscribe('plan.current', render); // the home being sold (A2)
  store.subscribe('ui.mode', render); // Simple ↔ Pro wording (B10)
  bus.on('afford:refresh', render);
  // phones: the flat bar's "Which flat?" sheet asks for the fields (bound once per slot)
  const boundSlots = new WeakSet();
  bus.on('flatbar:inputs', ({ slot } = {}) => {
    if (!slot) return;
    sheetSlot = slot;
    if (!boundSlots.has(slot)) { boundSlots.add(slot); bindFlat(slot); bindMoneyInputs(slot); bindPickMap(slot); }
    fillSheet();
  });
  phoneMq?.addEventListener?.('change', render); // the fields move between the page (desktop) and the sheet (phones)
  bus.on('data:ready', render);
  // the default (and the rent behind the Annual Value estimate) follow the map's selection unless a block is picked
  onTypicalChange(() => { const f = focus(); if (!(f && f.price > 0 && f.bid != null)) render(); });
  render();
}
