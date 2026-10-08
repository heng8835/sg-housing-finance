// App entry: show a loading state, load policy + language + data, then mount the views.
import { loadScripts, DATA_FILES } from '@core/data-loader.js';
import { loadPolicy } from '@core/policy.js';
import { createStore, applySampleBoot } from '@core/store.js';
import { attachBlockKeys } from '@core/blockkey.js';
import { bus } from '@core/bus.js';
import { initI18n, applyStatic, t } from '@core/i18n.js';
import { mountHousehold } from '@modules/household/index.js';
import { mountSamples } from '@modules/samples/index.js';
import { mountStart } from '@modules/start/index.js';
import { mountAfford } from '@modules/afford/index.js';
import { mountScenarios } from '@modules/scenarios/index.js';
import { mountRent } from '@modules/rent/index.js';
import { mountPlan } from '@modules/plan/index.js';
import { mountLearn } from '@modules/learn/index.js';
import { mountModeSwitch } from '@modules/shell/mode.js';
import { mountLangSwitch } from '@modules/shell/lang.js';
import { mountPhone } from '@modules/shell/phone.js';
import { mountMenu } from '@modules/shell/menu.js';
import { mountPanelResize } from '@modules/shell/resize.js';
import { mountTextSize } from '@modules/shell/textsize.js';
import { bindTextSize } from '@core/textsize.js';

const boot = document.getElementById('boot');
const say = (text) => { boot.querySelector('.msg').textContent = text; };
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
    await initI18n(store.get('ui.lang'));
    applyStatic();
    // phone (≤ 767 px): top bar, bottom tab bar, map sheet, full-screen pages; Aa + Menu (phone overhaul §2)
    mountPhone({ bus });
    mountMenu({ store, bus });
    // the household / Afford / Rent / Learn views need only the small policy file — they work while map data loads
    const dataLoaded = loadScripts(DATA_FILES, (done, total) => say(t('Loading HDB data… {0} of {1} files', [done, total])));
    const policy = await loadPolicy('policy/sg-policy.json');
    mountPanelResize({ store, bus });
    mountHousehold({ store, policy, bus });
    mountSamples({ store, policy, bus }); // banner while a sample is on; picker; card at the top of the Learn sheet
    mountStart({ store, bus, policy }); // first-run "Start here" questions (after 'data:ready'); bus 'start:open' re-opens
    mountAfford({ store, policy, bus, el: document.getElementById('affordRoot') });
    mountScenarios({ store, policy, bus, root: document.getElementById('affordRoot') }); // card in Afford's slot
    mountRent({ store, policy, bus, el: document.getElementById('rentRoot') });
    mountPlan({ store, policy, bus, el: document.getElementById('planRoot') });
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
    bus.emit('data:ready');
    appReady();
    boot.remove();
  } catch (err) {
    fail(`${t('Failed to start')}: ${err.message}`);
    throw err;
  }
}

main();
