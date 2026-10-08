// Tiny app-wide event bus for one-off hand-offs between modules (state lives in core/store.js).
// Events: 'nav:goto' {tab} · 'learn:open' {id} · 'explore:budget' {maxPrice|null} · 'explore:fit' {}
//   · 'explore:rings' {lat, lon, radiiKm, label} | null (P1 rings) · 'plan:show' {section} (scroll the Plan tab)
//   · 'explore:area' {kind, label, blockIds, town, centre, n} | null (drawn area; explore emits, core/typical.js listens)
//   · 'explore:selection' {flatTypes, allTypes, towns|null, area|null, window:{from,to,months}, history:{from,to}}
//   · 'household:open' {field?} (open the drawer, focus that data-path) · 'guide:open' {useCase?} (tour picker / one tour)
//   · 'afford:painted' {root} (Afford re-rendered; modules/scenarios moves its card into root's [data-slot="scenarios"])
//   · 'learn:painted' {root, id} (Learn sheet re-rendered; modules/guides fills root's [data-slot="guides"] on the index)
//   · 'learn:close' {} · 'guides:open' {id?} (a guide, or the policy-change log without id)
//   · 'samples:open' {} (sample picker) · 'samples:load' {id} (load a sample household: ids in modules/samples/data.js
//     SAMPLE_IDS; reloads the page) · 'samples:exit' {} (restore the user's own data; reloads). store.inSample() → {id}|null
//   · 'start:open' {opener?} (first-run "Start here" questions, modules/start) · 'start:closed' {} (its dialog closed)
//   · 'explore:view' {view, fit?} (apply a partial map view: ft / towns names, colorBy… — modules/explore/views.js)

const target = new EventTarget();

export const bus = {
  on(type, fn) { const h = (e) => fn(e.detail); target.addEventListener(type, h); return () => target.removeEventListener(type, h); },
  emit(type, detail = {}) { target.dispatchEvent(new CustomEvent(type, { detail })); },
};
