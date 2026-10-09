// Learn: glossary popovers (ⓘ next to finance terms and compare-table rows) and a side sheet with
// the full entry, related terms, the rule values it relies on and their sources. Content comes from
// content/content.json (built from content/glossary/*.md); rule numbers are filled in from policy.
import { esc, money } from '../../core/dom.js';
import { fillPolicyTables } from '../../core/policyfmt.js'; // 7b: rule tables (BRS / FRS by year)
import { t, currentLang } from '../../core/i18n.js';
import { data } from '../../core/data.js';
import { feature } from '../../core/features.js';
import { appVersion, donateUrl } from '../../core/version.js';
import { ABOUT_ID, aboutHtml, discLineHtml, rulesStatus, stampRules } from './about.js'; // 7b: About / Sources view + disclaimer line
import { isPhone } from '../../core/spotlight.js';

export async function mountLearn({ policy, bus }) {
  let terms = {};
  const file = currentLang() === 'en' ? 'content/content.json' : `content/content.${currentLang()}.json`;
  try { terms = (await (await fetch(file)).json()).terms || {}; } catch { /* Learn is optional */ }
  if (!Object.keys(terms).length && file !== 'content/content.json') { try { terms = (await (await fetch('content/content.json')).json()).terms || {}; } catch { /* ignore */ } }

  // ---- rules date on every disclaimer line (go-live D1 = c); a warning once review_due has passed
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date()); // YYYY-MM-DD
  const rules = rulesStatus({ reviewed: policy.reviewed, reviewDue: policy.reviewDue }, today);
  stampRules(document, rules);

  // ---- {policy:id} placeholders → formatted rule values
  function value(id) {
    if (id.startsWith('proposed.')) return `<i>${t('(see source)')}</i>`;
    let p; try { p = policy.meta(id); } catch { return `<i>${t('(see source)')}</i>`; }
    const v = p.value, unit = String(p.unit || '');
    if (typeof v !== 'number') return `<i>${t('(see the rules table)')}</i>`;
    const shown = /ratio|rate/i.test(unit) ? `${+(v * 100).toFixed(2)}%` : /S\$/.test(unit) ? money(v) : v.toLocaleString('en-SG');
    return `<b title="${esc(t('{0} · from {1}', [t(p.status.toLowerCase()), p.effective_from]))}">${shown}</b>`;
  }
  const fill = (htmlText) => fillPolicyTables(htmlText, policy).replace(/\{policy:([a-z0-9_.-]+)\}/gi, (_, id) => value(id));

  // ---- popover
  const pop = document.createElement('div');
  pop.className = 'term-pop'; pop.hidden = true; pop.setAttribute('role', 'dialog');
  document.body.appendChild(pop);
  let popFor = null;
  const closePop = () => { pop.hidden = true; if (popFor) popFor.setAttribute('aria-expanded', 'false'); popFor = null; };
  function openPop(btn, { id, tip }) {
    const term = terms[id];
    pop.innerHTML = `${term ? `<b>${esc(term.term)}</b>${fill(term.short)}` : ''}${tip ? `<div${term ? ' style="margin-top:6px;color:var(--text-2)"' : ''}>${esc(tip)}</div>` : ''}
      ${term ? `<div style="margin-top:8px"><button type="button" class="link" data-learn="${esc(id)}">${t('Learn more →')}</button></div>` : ''}`;
    pop.hidden = false;
    const r = btn.getBoundingClientRect(), w = Math.min(300, innerWidth - 16);
    pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
    pop.style.top = `${r.bottom + 6 + pop.offsetHeight > innerHeight ? Math.max(8, r.top - pop.offsetHeight - 6) : r.bottom + 6}px`;
    popFor = btn; btn.setAttribute('aria-expanded', 'true');
    pop.querySelector('[data-learn]')?.focus();
  }

  // ---- side sheet
  const sheet = document.createElement('dialog');
  sheet.className = 'sheet phone-full'; sheet.setAttribute('aria-label', t('Learn')); // phones: full-screen page (§3.9)
  document.body.appendChild(sheet);
  const ids = Object.keys(terms).sort((a, b) => terms[a].term.localeCompare(terms[b].term));
  function sources(term) {
    const rows = (term.policy_keys || []).map((k) => { try { return policy.meta(k); } catch { return null; } }).filter(Boolean);
    // 7c C9: Simple shows no rule ids — a plain line + a link to the rules page; Pro keeps the list
    return rows.length ? `<div class="pro-only"><h3>${t('Rules this relies on')}</h3><ul>${rows.map((p) => `<li>${esc(p.id)}: ${typeof p.value === 'number' ? value(p.id) : t('table')} <small>(${esc(t(p.status.toLowerCase()))}, ${t('from')} ${esc(p.effective_from)}${p.source_url.startsWith('http') ? `, <a href="${esc(p.source_url)}" target="_blank" rel="noopener">${t('source')}</a>` : ''})</small></li>`).join('')}</ul></div><p class="hint simple-only">${t('The numbers above come from dated rules on official pages.')} <button type="button" class="link" data-about-rules>${t('Rules and recent changes →')}</button></p>` : '';
  }
  function renderIndex(q = '') {
    const ql = q.trim().toLowerCase();
    const list = ids.filter((id) => !ql || terms[id].term.toLowerCase().includes(ql) || id.includes(ql));
    return `<label class="f"><span>${t('Search the glossary')}</span><input type="search" id="learnQ" value="${esc(q)}" placeholder="${esc(t('e.g. MSR, grant, lease'))}"></label>
      <ul class="learn-index">${list.map((id) => `<li><button type="button" class="link" data-learn="${id}">${esc(terms[id].term)}</button> <small class="muted">${esc(t(terms[id].level))}</small></li>`).join('') || `<li class="muted">${t('No match.')}</li>`}</ul>`;
  }
  // phones: the close button says "Close" (44 px, like the Menu); wider screens keep the ✕
  const closeBtn = () => (isPhone() ? `<button type="button" class="btn sm" data-close>${t('Close')}</button>`
    : `<button type="button" class="btn sm" data-close aria-label="${esc(t('Close'))}">✕</button>`);
  function openSheet(id) {
    if (id === ABOUT_ID) return openAbout();
    const term = id && terms[id];
    sheet.innerHTML = `<div class="drawer-body"><div class="drawer-head"><h2>${term ? esc(term.term) : t('Learn: housing & money terms')}</h2>${closeBtn()}</div>
      ${term ? `<p>${fill(term.short)}</p>${term.formula ? `<p class="formula">${esc(term.formula)}</p>` : ''}<div class="md">${fill(term.body)}</div>
        ${term.related.length ? `<h3>${t('Related')}</h3><p>${term.related.map((r) => `<button type="button" class="chip" data-learn="${esc(r)}">${esc(terms[r]?.term || r)}</button>`).join(' ')}</p>` : ''}
        ${sources(term)}${term.source ? `<p class="hint">${t('Official page')}: <a href="${esc(term.source)}" target="_blank" rel="noopener">${esc(term.source.replace(/^https?:..(www\.)?/, '').split('/')[0])}</a></p>` : ''}
        <p><button type="button" class="link" data-learn="">${t('← All terms')}</button></p>` : `<div data-slot="guides"></div><p class="learn-tour"><button type="button" class="link" data-guide>${t('New here? Take a guided tour →')}</button></p><h3 class="learn-gloss">${t('Glossary')}</h3><div id="learnIndex">${renderIndex()}</div>
        <p class="learn-about"><button type="button" class="link" data-about>${t('About this app, sources and privacy →')}</button></p>`}
      <p class="hint pro-only">${t("Educational content — not financial advice. Numbers in bold come from the app's dated rules file.")}</p>
      <p class="hint simple-only">${t('Educational content — not financial advice. Numbers in bold come from dated rules on official pages.')}</p></div>`;
    if (!sheet.open) sheet.showModal();
    sheet.querySelector('.drawer-body').scrollTop = 0;
    if (!term) sheet.querySelector('.drawer-head').insertAdjacentHTML('afterend', discLineHtml('inline learn-disc', rules)); // phone only (CSS)
    bus.emit('learn:painted', { root: sheet, id: term ? id : null }); // modules/guides fills [data-slot="guides"]
  }
  // ---- About / Sources view (7b, O15): version, data month, rules meta, licences, privacy, feedback
  function openAbout() {
    const body = aboutHtml({ policy: { version: policy.version, reviewed: policy.reviewed, reviewDue: policy.reviewDue }, hdb: data.hdb, rents: data.rents, version: appVersion(), btoOn: feature('btoData'), floodOn: feature('floodData'), today, donate: donateUrl() });
    sheet.innerHTML = `<div class="drawer-body"><div class="drawer-head"><h2>${t('About this app')}</h2>${closeBtn()}</div>${body}</div>`;
    if (!sheet.open) sheet.showModal();
    sheet.querySelector('.drawer-body').scrollTop = 0;
    bus.emit('learn:painted', { root: sheet, id: ABOUT_ID });
  }
  sheet.addEventListener('input', (e) => { if (e.target.id === 'learnQ') { const q = e.target.value; sheet.querySelector('#learnIndex').innerHTML = renderIndex(q); const i = sheet.querySelector('#learnQ'); i.focus(); i.setSelectionRange(q.length, q.length); } });
  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return sheet.close();
    if (e.target.closest('[data-guide]')) { sheet.close(); return bus.emit('guide:open', {}); } // modules/guide (H9)
    if (e.target.closest('[data-about-rules]')) { sheet.close(); return bus.emit('guides:open', {}); } // policy-change log
    if (e.target.closest('[data-about-forget]')) { // About you, "Your data" group opened at "Forget my data"
      sheet.close(); return bus.emit('household:open', { field: 'forget' });
    }
    const l = e.target.closest('[data-learn]'); if (l) openSheet(l.dataset.learn || null);
  });

  // ---- [data-term] labels get a focusable ⓘ
  function decorate(root = document) {
    root.querySelectorAll('[data-term]').forEach((el) => {
      if (el.dataset.decorated || !terms[el.dataset.term]) return;
      el.dataset.decorated = '1';
      el.insertAdjacentHTML('beforeend', `<button type="button" class="term" data-term-id="${esc(el.dataset.term)}" aria-label="${esc(t('What is {0}?', [terms[el.dataset.term].term]))}" aria-expanded="false">ⓘ</button>`);
    });
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('button.term, button.info');
    if (b) { e.stopPropagation(); if (popFor === b) return closePop(); return openPop(b, { id: b.dataset.termId, tip: b.dataset.tip }); }
    const l = e.target.closest('.term-pop [data-learn]');
    if (l) { const id = l.dataset.learn; closePop(); return openSheet(id); }
    if (!pop.hidden && !e.target.closest('.term-pop')) closePop();
  }, true);
  document.addEventListener('click', (e) => { if (e.target.closest('[data-about]')) openSheet(ABOUT_ID); }); // disclaimer lines + Learn index
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { const b = popFor; closePop(); b?.focus(); } });
  addEventListener('scroll', closePop, true);

  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'btn sm'; btn.id = 'learnBtn'; btn.innerHTML = `📘<span class="lbl"> ${t('Learn')}</span>`; btn.setAttribute('aria-label', t('Learn: glossary of housing and money terms'));
  btn.addEventListener('click', () => openSheet(null));
  document.getElementById('hhChip')?.before(btn);

  bus.on('learn:decorate', ({ root }) => decorate(root));
  bus.on('learn:open', ({ id }) => openSheet(id));
  bus.on('learn:close', () => { if (sheet.open) sheet.close(); });
  decorate();
}
