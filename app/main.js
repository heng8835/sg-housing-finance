// App entry: show a loading state, load policy + language + data, then mount the views.
import { loadScripts, loadLate, MAP_FILES, LATE_FILES } from '@core/data-loader.js';
import { loadPolicy } from '@core/policy.js';
import { createStore, applySampleBoot } from '@core/store.js';
import { attachBlockKeys, checkDerived } from '@core/blockkey.js';
import { bus } from '@core/bus.js';
import { initI18n, applyStatic, t } from '@core/i18n.js';
import { mountHousehold } from '@modules/household/index.js';
import { mountQuickEdit } from '@modules/household/quickedit.js';
import { mountSamples } from '@modules/samples/index.js';
import { mountStart } from '@modules/start/index.js';
import { mountAfford } from '@modules/afford/index.js';
import { mountScenarios } from '@modules/scenarios/index.js';
import { mountRent } from '@modules/rent/index.js';
import { mountPlan } from '@modules/plan/index.js';
import { mountJourney } from '@modules/journey/index.js';
import { mountLearn } from '@modules/learn/index.js';
import { mountModeSwitch } from '@modules/shell/mode.js';
import { mountLangSwitch } from '@modules/shell/lang.js';
import { mountPhone } from '@modules/shell/phone.js';
import { mountFlatBar } from '@modules/shell/flatbar.js';
import { mountMenu } from '@modules/shell/menu.js';
import { mountPanelResize } from '@modules/shell/resize.js';
import { mountTextSize } from '@modules/shell/textsize.js';
import { bindTextSize } from '@core/textsize.js';
import { bindFillLinks } from '@core/filllink.js';
import { rememberFolds } from '@core/fold.js';
import { bindSkipLink, bindCombobox, bindRadioArrows } from '@core/a11y.js';

const boot = document.getElementById('boot');
const say = (text) => { boot.querySelector('.msg').textContent = text; };
const LATE_START_MS = 100; // the rest of the data starts at the latest this long after the map (hidden tab)
const fail = (text) => { boot.classList.add('err'); say(text); };

async function main() {
  if (location.protocol === 'file:') {
    fail('Open this app through a local web server: double-click serve.cmd (or run docker compose up). / 请通过本地服务器打开：双击 serve.cmd。');
    return;
  }
  try {
    // sample households: load / exit a sample before anything reads the stored keys (core/store.js, modules/samples)
    try { applySampleBoot(window.localStorage); } catch (err) { console.warn('Sample sandbox:', err.message); }
    const store = createStore({ storage: window.localStorage });
    bindTextSize(store); // Normal / Large / Larger classes on <html> (B10) before anything paints
    rememberFolds(window.localStorage); // P8 M-14: folds the user opened / closed stay that way next visit (layout only)
    await initI18n(store.get('ui.lang'));
    applyStatic();
    // a11y 5a: "Skip to content" focuses the open page; the type-ahead lists get the combobox roles
    bindSkipLink(document); bindRadioArrows(document);
    for (const [inp, list] of [['mSearch', 'mList'], ['cAddr', 'acList'], ['wPlace', 'wList']]) bindCombobox(document.getElementById(inp), document.getElementById(list));
    // phone (≤ 767 px): top bar, bottom tab bar, map sheet, full-screen pages; Aa + Menu (phone overhaul §2)
    mountPhone({ bus });
    mountMenu({ store, bus });
    // the household / Afford / Rent / Learn views need only the small policy file — they work while map data loads.
    // Lazy data (S1b, docs/specs/lazy-data.md): only the first map screen's files block the map; the rest follow it.
    const dataLoaded = loadScripts(MAP_FILES, (done, total) => say(t('Loading HDB data… {0} of {1} files', [done, total])));
    const policy = await loadPolicy('policy/sg-policy.json');
    mountPanelResize({ store, bus });
    mountHousehold({ store, policy, bus });
    bindFillLinks(document, bus); // "Add your income →"-style links in any tab / card / drawer → the field to fill
    mountSamples({ store, policy, bus }); // banner while a sample is on; picker; card at the top of the Learn sheet
    mountStart({ store, bus, policy }); // first-run "Start here" questions (after 'data:ready'); bus 'start:open' re-opens
    mountAfford({ store, policy, bus, el: document.getElementById('affordRoot') });
    mountScenarios({ store, policy, bus, root: document.getElementById('affordRoot') }); // card in Afford's slot
    mountRent({ store, policy, bus, el: document.getElementById('rentRoot') });
    mountPlan({ store, policy, bus, el: document.getElementById('planRoot') });
    mountFlatBar({ store, bus }); // P8 M-01: "For: <flat> [Change]" + ‹ › under the title of Afford / Rent / Plan
    mountQuickEdit({ store, bus }); // P8 M-08: "Based on your household" rows → one-field sheet (writes the household)
    mountJourney({ store, bus }); // P8 M-07: "Your steps" card on the Start here goal's page + "My goal" in Menu / Learn
    let appReady;
    const ready = new Promise((resolve) => { appReady = resolve; });
    // offline copy (PWA, phase 6c): service worker registered once `ready` resolves, "Update available" toast,
    // "Offline copy" line in the Learn sheet; optional — a missing or failing module never stops the app
    import('@modules/offline/index.js')
      .then((m) => m.mountOffline({ bus, ready }))
      .catch((err) => console.warn('Offline copy not available:', err.message));
    mountLearn({ policy, bus }).then(() => {
      mountModeSwitch({ store }); mountLangSwitch({ store }); mountTextSize({ store, bus }); // text size: next to EN / 中文
      // guided tour (header button after #learnBtn + one-time offer once `ready` resolves); optional — a missing or
      // failing guide module never stops the app
      import('@modules/guide/index.js')
        .then((m) => m.mountGuide({ store, bus, ready }))
        .catch((err) => console.warn('Guide not available:', err.message));
      // guides + quizzes + policy-change log in the Learn sheet (fills Learn's [data-slot="guides"]); optional too
      import('@modules/guides/index.js')
        .then((m) => m.mountGuides({ store, policy, bus }))
        .catch((err) => console.warn('Guides not available:', err.message));
    });
    await dataLoaded;
    // stable block ids (go-live F2): re-point saved shortlist / focus / scenario bids via "block|street" keys and drop
    // per-block data built for another data.js — before the map code reads 'hdb-comparer'
    try {
      const r = attachBlockKeys({ hdb: window.HDB_DATA, store, storage: window.localStorage });
      if (r && (r.derived.length || r.comparer.dropped)) console.warn('Block ids:', JSON.stringify({ derived: r.derived, dropped: r.comparer.dropped }));
    } catch (err) { console.warn('Block ids:', err.message); }
    const { startExplore } = await import('@modules/explore/legacy.js');
    startExplore({ policy, store, bus });
    boot.remove();
    performance.mark('map:ready'); // first map paint (docs/specs/lazy-data.md measures from here)
    // the rest of the data (schools & places, rents, market, commute, bus routes): each file → 'data:more' {file, ok}
    // (the map re-binds it); then 'data:ready' once everything has settled, as before — the Afford / Rent / Plan
    // views and the first-visit questions render with complete data, and the offline copy reuses what was fetched
    // let the map paint first (a hidden tab gets no animation frames, hence the timer as well)
    await new Promise((resolve) => { requestAnimationFrame(() => setTimeout(resolve)); setTimeout(resolve, LATE_START_MS); });
    await loadLate(LATE_FILES, (file, ok) => {
      try {
        const dropped = ok ? checkDerived(window.HDB_DATA) : [];
        if (dropped.length) console.warn('Late data:', JSON.stringify(dropped));
      } catch (err) { console.warn('Late data:', err.message); }
      bus.emit('data:more', { file, ok });
    });
    performance.mark('data:all');
    bus.emit('data:ready');
    appReady();
  } catch (err) {
    fail(`${t('Failed to start')}: ${err.message}`);
    throw err;
  }
}

main();
