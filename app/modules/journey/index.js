// Goal steps (Phase 8 M-07): a foldable "Your steps" card at the top of the Start here goal's page (phone and desktop),
// "My goal" rows in the phone Menu (bus 'menu:painted' slot) and a "My goal" line in the desktop Learn index
// (bus 'learn:painted'). Reads the store and the map's save ('hdb-comparer'); the only write is "Hide these steps"
// (ui.journey.hidden = goal; "Show my steps" clears it). Steps go where the input is typed: data-fill links
// (core/filllink.js, bound on document by main.js) or nav:goto (+ plan:show, scroll / focus) — never another module.
// The card lives outside the pages' roots (inserted after the tab's .page-head), so their re-renders leave it alone.
import { LEGACY_KEY } from '../../core/store.js';
import { keepFolds } from '../../core/fold.js';
import { GOAL_PAGE, goalOf, hiddenGoal, factsFrom, journeyModel } from './steps.js';
import { cardHtml, hiddenHtml, menuRowsHtml, learnLineHtml } from './view.js';

const PHONE_MQ = '(max-width: 767px)'; // same breakpoint as modules/shell/phone.js
const RECHECK_MS = 300; // after a click / submit anywhere: the map's save is debounced (200 ms), then re-derive
const ANSWER_PAGES = ['afford', 'rent', 'plan']; // phones: the card starts folded here so the answer stays above the fold (P8-01)
const MENU_CLOSE_MS = 50; // Menu row → act this long after closing the Menu (its 'close' event normally comes first)

export function mountJourney({ store, bus, storage = typeof localStorage !== 'undefined' ? localStorage : null } = {}) {
  if (!store || !bus || typeof document === 'undefined') return null;
  const mq = matchMedia(PHONE_MQ);
  const wrap = document.createElement('div');
  wrap.className = 'jr-wrap'; wrap.id = 'journey'; wrap.hidden = true;
  const folds = keepFolds(wrap);
  let sig = null, model = null;
  let justHid = null; // goal hidden from its page just now → "Steps hidden … Show them again" until the page changes

  const legacyRaw = () => { try { return storage ? storage.getItem(LEGACY_KEY) : null; } catch { return null; } };
  function current() {
    const ui = store.get('ui') || {}, goal = goalOf(ui);
    if (!goal) return null;
    const state = { household: store.get('household'), focus: store.get('focus'), plan: store.get('plan'), ui };
    return journeyModel({ goal, facts: factsFrom(state, legacyRaw()), household: state.household, hidden: hiddenGoal(ui) });
  }
  function place(page) {
    const tab = document.getElementById(`tab-${page}`);
    if (!tab) return false;
    const head = tab.querySelector(':scope > .page-head');
    if (head ? wrap.previousElementSibling !== head : tab.firstElementChild !== wrap) { if (head) head.after(wrap); else tab.prepend(wrap); }
    return true;
  }
  function paint(force = false) {
    const m = current();
    model = m;
    const gone = m && m.hidden && justHid !== m.goal;
    if (!m || gone || !place(m.page)) { if (!wrap.hidden || sig) { folds.snapshot(); wrap.hidden = true; wrap.innerHTML = ''; } sig = null; return; }
    const key = JSON.stringify([m.goal, m.hidden, m.steps.map((s) => [s.done, s.text, s.vals, s.go]), mq.matches, store.get('ui.lang')]);
    if (!force && key === sig) return;
    const had = wrap.contains(document.activeElement);
    sig = key;
    folds.snapshot();
    wrap.hidden = false;
    wrap.innerHTML = m.hidden ? hiddenHtml({ phone: mq.matches }) : cardHtml(m, { open: folds.isOpen('journey', m.openByDefault && !(mq.matches && ANSWER_PAGES.includes(m.page))) });
    if (had) wrap.querySelector(m.hidden ? '[data-jr="unhide"]' : 'summary')?.focus({ preventScroll: true });
  }

  // ---- where a step goes
  function openCompare() {
    if (mq.matches) {
      const b = document.querySelector('#choicesView [data-v="compare"]');
      if (b && b.getAttribute('aria-checked') !== 'true') b.click();
    } else if (!document.getElementById('drawer')?.classList.contains('open')) document.getElementById('drawerToggle')?.click();
  }
  function go(g) {
    if (!g) return;
    if (g.compare) { bus.emit('nav:goto', { tab: 'choices' }); setTimeout(openCompare, 0); return; }
    bus.emit('nav:goto', { tab: g.tab });
    if (g.section) bus.emit('plan:show', { section: g.section });
    setTimeout(() => {
      const el = g.focus ? document.querySelector(`[data-p="${g.focus}"]`) : g.anchor ? document.getElementById(g.anchor) : null;
      if (!el) return;
      el.scrollIntoView?.({ block: g.focus ? 'center' : 'start' });
      if (g.focus) el.focus?.({ preventScroll: true });
    }, 0);
  }
  function hide() {
    const g = goalOf(store.get('ui'));
    if (!g) return;
    justHid = g;
    store.set('ui.journey', { hidden: g }); // the one write (store subscription repaints)
  }
  /** Menu / Learn "Show my steps": un-hide, go to the goal's page, open the card. No goal → Start here. */
  function showSteps(opener) {
    const g = goalOf(store.get('ui'));
    if (!g) { bus.emit('start:open', { opener }); return; }
    justHid = null;
    if (hiddenGoal(store.get('ui')) === g) store.set('ui.journey', { hidden: null });
    bus.emit('nav:goto', { tab: GOAL_PAGE[g] });
    paint(true);
    const d = wrap.querySelector('details.jr-card');
    if (!d) return;
    d.open = true;
    // the phone shell shows the page on its tab observer (a microtask): scroll and focus once it is visible
    setTimeout(() => { d.scrollIntoView?.({ block: 'start' }); d.querySelector('summary')?.focus({ preventScroll: true }); }, 0);
  }

  wrap.addEventListener('click', (e) => {
    const b = e.target.closest?.('button');
    if (!b || b.dataset.fill) return; // data-fill: core/filllink.js's document binder opens the place
    if (b.dataset.jr === 'hide') return hide();
    if (b.dataset.jr === 'unhide') return showSteps(b);
    if (b.dataset.jrStep != null && model) go(model.steps[+b.dataset.jrStep]?.go);
    return undefined;
  });

  // ---- repaint: any store change (signature-guarded), a page change, the shortlist count, a click / submit (the
  // map's own save holds the shortlist and Daily places), phone ↔ desktop
  store.subscribe('', () => paint());
  const tabs = [...document.querySelectorAll('.tab')];
  const onTab = () => { if (justHid && model && !document.getElementById(`tab-${model.page}`)?.classList.contains('active')) { justHid = null; } paint(); };
  if (typeof MutationObserver !== 'undefined') {
    const mo = new MutationObserver(onTab);
    tabs.forEach((el) => mo.observe(el, { attributes: true, attributeFilter: ['class'] }));
    const count = document.getElementById('choiceCount');
    if (count) new MutationObserver(() => paint()).observe(count, { childList: true, characterData: true, subtree: true });
  }
  let timer = null;
  const later = () => { clearTimeout(timer); timer = setTimeout(() => paint(), RECHECK_MS); };
  document.addEventListener('click', later);
  document.addEventListener('submit', later);
  mq.addEventListener?.('change', () => paint(true));
  bus.on('data:ready', () => paint());
  bus.on('start:closed', () => paint());

  // ---- phone Menu: "My goal: …" (show the steps) + "Change my goal" (Start here)
  bus.on('menu:painted', ({ root } = {}) => {
    const slot = root?.querySelector('[data-slot="menu-extra"]');
    if (!slot || slot.querySelector('.jr-menu')) return;
    const box = document.createElement('div');
    box.innerHTML = menuRowsHtml(goalOf(store.get('ui')));
    const list = box.firstElementChild;
    slot.prepend(list);
    root.querySelector('button[data-act="start"]')?.closest('li')?.setAttribute('hidden', ''); // "Change my goal" does the same
    list.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-jr]');
      if (!b) return;
      const opener = document.getElementById('phoneMenu');
      const act = () => (b.dataset.jr === 'show' ? showSteps(opener) : bus.emit('start:open', { opener }));
      if (!root.open) return act();
      // the Menu's own 'close' handler puts the focus back on the Menu button; that event may come late (a hidden
      // tab), so act on a short timer and take the focus back to the card if the event comes after it
      let done = false;
      const run = () => { if (!done) { done = true; act(); } };
      root.addEventListener('close', () => setTimeout(() => {
        if (!done) run(); else if (b.dataset.jr === 'show') wrap.querySelector('details.jr-card > summary')?.focus({ preventScroll: true });
      }, 0), { once: true });
      root.close();
      setTimeout(run, MENU_CLOSE_MS);
      return undefined;
    });
  });
  // ---- desktop Learn index: the same line ("My goal: … · Show my steps · Change my goal"), only with a goal
  bus.on('learn:painted', ({ root, id } = {}) => {
    if (!root || id || mq.matches || root.querySelector('.jr-learn')) return;
    const goal = goalOf(store.get('ui'));
    const anchor = root.querySelector('.start-learn') || root.querySelector('.learn-tour');
    if (!goal || !anchor) return;
    const p = document.createElement('p');
    p.className = 'learn-tour jr-learn';
    p.innerHTML = learnLineHtml(goal);
    p.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-jr]');
      if (!b) return;
      bus.emit('learn:close');
      if (b.dataset.jr === 'show') showSteps(null); else bus.emit('start:open', { opener: null });
    });
    if (anchor.classList.contains('start-learn')) anchor.after(p); else anchor.before(p);
  });

  paint();
  return { paint, showSteps };
}
