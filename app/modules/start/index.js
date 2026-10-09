// First-run "Start here" (roadmap X-09; Phase 7b B5): on a true first visit (no household, no shortlisted flats, never
// finished or skipped, not in a sample) a calm modal asks what each goal needs, one question per screen, at most 7
// (answers.js questionsFor): goal, who (+ an optional child for Primary 1 dates), residency, income (split for two
// buyers), then the goal's own screens — savings, the home you own, your rent now, where you travel, CPF and cash —
// and towns. Every step can be skipped; "Try a sample household instead" → bus 'samples:open'. One-choice screens
// (goal, first flat?) move on with a tap — no Next button, and a quick second tap is ignored (TAP_GUARD_MS).
// EN · 中文 inside the dialog (O5): the answers are kept as a local draft (store ui.startDraft), the page reloads in
// the other language and the dialog reopens at the same question; finishing or "Skip for now" clears the draft.
// Finishing writes the household through the store (same shape as the drawer) and the Plan inputs (home owned,
// rent now — shared with Rent & Buy, B7 — and the child's date of birth), hands flat types / towns / colour mode /
// commute places to the map (bus 'explore:view') with a "Picked for you" line under the flat types (B11), goes to
// the matching tab, then offers the matching tour (bus 'guide:open') and guide (bus 'guides:open'). Re-open: bus
// 'start:open' { opener, fresh } — household drawer "Edit answers" (keeps cash / CPF / grants) or "Start over"
// (fresh: the household is cleared first, A9), and a line in the Learn sheet (keeps).
// Emits 'start:closed' {} whenever the dialog closes (modules/guide waits for it before its one-time tour offer).
// Memory: store ui.start = { done | skipped: 'YYYY-MM-DD', goal? } — no answers kept (only the draft while the
// language changes). Nothing leaves the browser.
import { t, currentLang } from '../../core/i18n.js';
import { data } from '../../core/data.js';
import { LEGACY_KEY } from '../../core/store.js';
import { isoDay } from '../../core/place.js';
import { bindBlockSearch, blockName } from '../../core/blocksearch.js';
import { questionsFor, isFirstVisit, answersFrom, householdFrom, touchesHousehold, routeFor, startRecord, clearedHousehold, planPatches, cleanDraft, SENIOR_HINT_AGE } from './answers.js';
import { questionHtml, doneHtml, pickedHint } from './view.js';
import { BLOCK_CLS, BLOCK_LIST } from './screens.js';
import { isPhone } from '../../core/spotlight.js';
import { loadTownAliases } from '../../core/townalias.js'; // 中文 town names on the towns screen (S1a)

const SHOW_DELAY_MS = 300; // after the map data has loaded (the guide's own offer waits 800 ms and for 'start:closed')
const TAP_GUARD_MS = 400;  // after a tap moves on, a second tap within this time is ignored (no double step)
// tour titles (modules/guide/steps.js USE_CASES) — repeated as keys so this module imports no other module
const TOUR_TITLES = { firstResale: "I'm buying my first resale flat", btoVsResale: 'Choosing between BTO and resale', sellBuy: 'Selling and buying again', renting: 'Renting a home', retire: 'Planning for retirement / 55+', shortlist: 'Comparing my shortlist', map: 'Using the map' };

async function loadGuideList() {
  const get = async (f) => { try { const r = await fetch(f); return r.ok ? Object.values((await r.json()).guides || {}) : []; } catch { return []; } };
  const list = currentLang() === 'en' ? [] : await get(`content/guides.${currentLang()}.json`);
  return list.length ? list : get('content/guides.json');
}

export function mountStart({ store, bus, policy = null, storage = globalThis.localStorage }) {
  if (document.getElementById('startDlg')) return null;
  const dlg = document.createElement('dialog');
  dlg.id = 'startDlg'; dlg.className = 'start-dlg phone-full'; // phones: a full-screen page (styles/phone.css + start.css)
  dlg.setAttribute('aria-labelledby', 'startTitle');
  document.body.append(dlg);

  let i = 0, a = null, route = null, saved = null, finished = false, returnTo = null, guides = [], tapUntil = 0, paintedAt = null;
  loadGuideList().then((g) => { guides = g; });
  if (currentLang() === 'zh') loadTownAliases(); // one cached same-origin fetch (also started by the map)
  const towns = () => (data.hdb ? data.hdb.towns.slice().sort() : []);
  const hubs = () => (data.commute && Array.isArray(data.commute.hubs) ? data.commute.hubs.map((h) => ({ id: h.id, name: h.name })) : []);
  const payoutAge = () => { try { return policy ? policy.get('cpf.age.life_payout') : null; } catch { return null; } };
  const day = () => isoDay(new Date());
  const qs = () => questionsFor(a);

  function paint(focusSel) {
    const phone = isPhone();
    dlg.innerHTML = route ? doneHtml(a, saved, route, { tourTitle: TOUR_TITLES[route.tour] || '', textSize: store.get('ui.textSize'), phone })
      : questionHtml(i, a, { towns: towns(), hdb: data.hdb, hubs: hubs(), payoutAge: payoutAge(), lang: currentLang(), phone });
    const at = route ? 'done' : i;
    if (at !== paintedAt) { dlg.scrollTop = 0; paintedAt = at; } // a new screen starts at the top (phone: a scrolling page)
    // no text field by default (a phone keyboard would cover the choices); the chosen option, else the first one
    const f = (focusSel && dlg.querySelector(focusSel)) || dlg.querySelector('.st-opt.on') || dlg.querySelector('.st-body .seg .on')
      || dlg.querySelector('.st-opt') || dlg.querySelector('[data-st="next"]');
    f?.focus();
  }

  function open(opener, { fresh = false, draft = null } = {}) {
    if (dlg.open) return;
    returnTo = opener && opener.isConnected ? opener : document.activeElement;
    if (fresh) store.set('household', clearedHousehold()); // "Start over": nothing kept, the questions start empty
    a = draft ? draft.a : answersFrom(store.get('household'), fresh ? {} : { goal: store.get('ui.start')?.goal }, store.get('plan'));
    i = draft ? draft.i : 0; route = null; saved = null; finished = false;
    if (draft) store.set('ui.startDraft', null);
    paintedAt = null;
    dlg.showModal();
    paint(); // after showModal, so the chosen / first option gets the focus (not the ✕)
  }

  function close() {
    if (!finished && !route) store.set('ui.start', { ...(store.get('ui.start') || {}), ...startRecord('skipped', day()) });
    store.set('ui.startDraft', null);
    if (dlg.open) dlg.close();
  }
  dlg.addEventListener('close', () => {
    bus.emit('start:closed', {});
    if (returnTo && returnTo.isConnected && returnTo !== document.body) returnTo.focus();
  });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); }); // Esc = "Skip for now"

  // B11: "Picked for you (…): 3-room, 4-room. Change any time." under the map's Flat type chips, until they are changed
  function showPicked(r) {
    document.getElementById('ftPicked')?.remove();
    const text = pickedHint(r.picked, r.view && r.view.ft, SENIOR_HINT_AGE), chips = document.getElementById('ftChips');
    if (!text || !chips) return;
    const p = document.createElement('p');
    p.id = 'ftPicked'; p.className = 'hint'; p.textContent = text;
    chips.after(p);
    chips.addEventListener('click', () => p.remove(), { once: true });
  }

  // ---- finishing: household + Plan inputs → store, map hand-off, tab, then the "You're set" screen
  function finish() {
    finished = true;
    if (touchesHousehold(a, store.get('household'))) { saved = householdFrom(a, store.get('household')); store.set('household', saved); }
    for (const [path, value] of planPatches(a, store.get('plan'))) store.set(path, value);
    route = routeFor(a, guides);
    store.set('ui.start', startRecord('done', day(), route.goal));
    store.set('ui.startDraft', null);
    store.set('ui.guide.offered', true); // the "You're set" screen offers the tour — no second offer card
    const handOff = () => {
      if (route.view) { bus.emit('explore:view', { view: route.view, fit: !!route.view.towns }); showPicked(route); }
      bus.emit('nav:goto', { tab: route.tab });
      if (route.section) bus.emit('plan:show', { section: route.section });
    };
    if (data.hdb) handOff(); else { const off = bus.on('data:ready', () => { off(); handOff(); }); }
    paint();
  }

  const advance = () => { if (i < qs().length - 1) { i += 1; paint(); } else finish(); };
  const tapAdvance = () => { tapUntil = Date.now() + TAP_GUARD_MS; advance(); };

  // EN · 中文: keep the answers, reload in the other language, reopen at the same question
  function switchLang(code) {
    if (!code || code === currentLang()) return;
    store.set('ui.startDraft', { i, a });
    store.set('ui.lang', code);
    location.reload();
  }

  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) return; // backdrop: do nothing (a stray click must not lose the answers)
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (Date.now() < tapUntil && d.st !== 'close') return; // the second tap of a quick double tap
    if (d.stLang) return switchLang(d.stLang);
    if (d.goal) { a.goal = d.goal; return tapAdvance(); }
    // "Bigger text?" on You're set (B10): a tap turns it on; tapping the chosen size again goes back to Normal
    if (d.stTs) { store.set('ui.textSize', store.get('ui.textSize') === d.stTs ? 'normal' : d.stTs); return paint(`[data-st-ts="${d.stTs}"]`); }
    if (d.buyers) {
      a.buyers = +d.buyers;
      a.ages = Array.from({ length: a.buyers }, (_, k) => a.ages[k] ?? null);
      a.residency = Array.from({ length: a.buyers }, (_, k) => a.residency[k] || 'SC');
      if (a.buyers === 1 && a.firstTimer === 'mixed') a.firstTimer = null;
      return paint('[data-age="0"]');
    }
    if (d.band) { a.band = d.band; a.income = null; a.noWork = false; return paint(`[data-band="${d.band}"]`); }
    if ('nowork' in d) { a.noWork = !a.noWork; if (a.noWork) { a.band = null; a.income = null; } return paint('[data-nowork]'); }
    if (d.split) { a.split = d.split; return paint(`[data-split="${d.split}"]`); }
    if (d.timer) { a.firstTimer = d.timer === 'true' ? true : d.timer === 'false' ? false : 'mixed'; return tapAdvance(); }
    if (d.parents) { a.parents = d.parents; return paint(`[data-parents="${d.parents}"]`); }
    if (d.homeType) { a.home = { ...(a.home || {}), type: d.homeType }; return paint(`[data-home-type="${d.homeType}"]`); }
    if (d.rentType) { a.rent = { ...(a.rent || {}), type: d.rentType }; return paint(`[data-rent-type="${d.rentType}"]`); }
    if (d.town) {
      a.towns = a.towns.includes(d.town) ? a.towns.filter((x) => x !== d.town) : [...a.towns, d.town];
      b.classList.toggle('on'); b.setAttribute('aria-pressed', String(a.towns.includes(d.town)));
      return undefined;
    }
    switch (d.st) {
      case 'close': return close();
      case 'back': i = Math.max(0, i - 1); return paint();
      case 'skip': return skip();
      case 'next': return advance();
      case 'child': a.childOpen = true; return paint('[data-child]');
      // hand-offs: the next view takes the focus, so it is not put back on the opener
      case 'sample': returnTo = null; close(); return bus.emit('samples:open', {});
      case 'tour': returnTo = null; dlg.close(); return bus.emit('guide:open', { useCase: route.tour });
      case 'guide': returnTo = null; dlg.close(); return bus.emit('guides:open', { id: route.guide.id });
      case 'household': returnTo = null; dlg.close(); return bus.emit('household:open', {});
      case 'done': return dlg.close();
      default: return undefined;
    }
  });

  // "Skip" forgets this question's answer (so nothing is written for it) and moves on
  function skip() {
    const q = qs()[i];
    if (q === 'goal') a.goal = null;
    if (q === 'who') { a.buyers = null; a.ages = a.ages.map(() => null); a.child = null; a.childOpen = false; }
    if (q === 'income') { a.income = null; a.band = null; a.noWork = false; a.split = 'even'; a.each = [null, null]; }
    if (q === 'firstTimer') a.firstTimer = null;
    if (q === 'towns') a.towns = [];
    if (q === 'savings') { a.cpfOa = null; a.cash = null; a.parents = null; }
    if (q === 'home') a.home = { type: null, flatType: null, block: null };
    if (q === 'rentNow') a.rent = null;
    if (q === 'travel') a.hubs = [];
    if (q === 'cpfCash') { a.ra = []; a.life = []; a.cash = null; }
    advance();
  }

  const numOf = (el) => (el.value === '' ? null : +el.value);
  dlg.addEventListener('input', (e) => {
    const el = e.target, d = el.dataset;
    if (d.age != null) a.ages[+d.age] = numOf(el);
    else if ('income' in d) {
      a.income = numOf(el);
      if (a.income != null) { a.band = null; a.noWork = false; dlg.querySelectorAll('[data-band], [data-nowork]').forEach((c) => { c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); }); }
    } else if (d.each != null) { a.each = [...(a.each || [null, null])]; a.each[+d.each] = numOf(el); }
    else if ('oa' in d) a.cpfOa = numOf(el);
    else if ('cash' in d) a.cash = numOf(el);
    else if ('rentAmount' in d) a.rent = { ...(a.rent || { type: 'whole' }), amount: numOf(el) };
    else if (d.ra != null) { a.ra = [...(a.ra || [])]; a.ra[+d.ra] = numOf(el); }
    else if (d.life != null) { a.life = [...(a.life || [])]; a.life[+d.life] = numOf(el); }
    else if ('child' in d) a.child = el.value || null;
  });
  dlg.addEventListener('change', (e) => {
    const el = e.target, d = el.dataset;
    if (d.res != null) a.residency[+d.res] = el.value;
    else if ('homeFt' in d) a.home = { ...(a.home || {}), flatType: el.value || null };
    else if (d.hub != null) { a.hubs = [...(a.hubs || [])]; a.hubs[+d.hub] = el.value || null; a.hubs = a.hubs.map((x) => x || null); }
    else if ('child' in d) a.child = el.value || null;
  });
  // "The home you own": block search over data.js (same matching as Plan → Sell then buy)
  bindBlockSearch(dlg, {
    cls: BLOCK_CLS, listId: BLOCK_LIST, getHdb: () => data.hdb,
    onPick: (bid) => { const label = blockName(data.hdb, bid); a.home = { ...(a.home || {}), block: { bid, label } }; const inp = dlg.querySelector(`.${BLOCK_CLS}`); if (inp) inp.value = label; },
    onClear: () => { if (a && a.home) a.home = { ...a.home, block: null }; },
  });

  // ---- re-open points: bus 'start:open' (household drawer "Edit answers" / "Start over"), a line in the Learn sheet index
  bus.on('start:open', ({ opener, fresh } = {}) => open(opener, { fresh: !!fresh && !store.inSample() }));
  bus.on('learn:painted', ({ root, id } = {}) => {
    if (!root || id || root.querySelector('.start-learn')) return;
    const anchor = root.querySelector('.learn-tour'); if (!anchor) return;
    const p = document.createElement('p');
    p.className = 'learn-tour start-learn';
    p.innerHTML = `<button type="button" class="link">${t('Answer a few quick questions to set things up →')}</button>`;
    p.querySelector('button').addEventListener('click', () => { bus.emit('learn:close'); open(null); });
    anchor.before(p);
  });

  // ---- first visit (or back from a language switch): after the map data has loaded, before the guide's own tour offer
  const legacyRaw = () => { try { return storage ? storage.getItem(LEGACY_KEY) : null; } catch { return null; } };
  bus.on('data:ready', () => setTimeout(() => {
    const draft = cleanDraft(store.get('ui.startDraft'));
    if (draft && !store.inSample()) return open(null, { draft });
    if (isFirstVisit({ state: { household: store.get('household'), ui: store.get('ui') }, legacyRaw: legacyRaw(), inSample: !!store.inSample() })) open(null);
    return undefined;
  }, SHOW_DELAY_MS));

  return { open: () => open(null), close };
}
