// Shared, persisted app state (household, focus flat, UI prefs). Modules talk through this and
// core/bus.js — never to each other. Storage is injected so node tests can use a fake.

export const STORE_KEY = 'sghf:v2';
export const LEGACY_KEY = 'hdb-comparer';
// Which folded sections are open (core/fold.js rememberFolds, P8 M-14): layout only, not personal; Forget clears it.
export const FOLDS_KEY = 'sghf:folds';
// Named scenarios (Phase 6b): at most four snapshots with ids A–D, kept here (localStorage) only — never in a URL.
export const SCENARIO_IDS = ['A', 'B', 'C', 'D'];
export const MAX_SCENARIOS = SCENARIO_IDS.length;
export const SCENARIO_NAME_MAX = 60;

export const defaults = () => ({
  schemaVersion: 1,
  household: {
    scheme: 'family',            // 'family' | 'single'
    // citizenship 'SC'|'PR'|'F'; prYears3Plus (PR); nationality 'MY'|'US'|'EFTA'|'other' (non-SC);
    // pass 'EP'|'SP'|'WP'|'student'|'DP' and wpSector 'services'|'manufacturing'|'cmp' (foreigners)
    // cpfSa / cpfMa / cpfRa: other CPF balances (Plan tab projection)
    buyers: [{ age: null, income: null, citizenship: 'SC', prYears3Plus: null, nationality: null, pass: null, wpSector: null, cpfOa: null, cpfSa: null, cpfMa: null, cpfRa: null }],
    cash: null,                  // cash savings available for the purchase (S$)
    otherDebts: null,            // other monthly debt repayments (S$) — TDSR, bank loans
    firstTimer: true,
    propertiesOwned: 0,          // residential properties already owned (ABSD)
    parents: 'none',             // 'with' | 'near' | 'none' — Proximity Housing Grant
    loan: 'hdb',                 // 'hdb' | 'bank'
    tenure: 25,
    grantsOverride: null,        // manual grant total (S$) — replaces the computed grants
    needsReview: false,          // set by migration: old "cash + CPF" went into cash
  },
  focus: null,                   // { source: 'block'|'choice'|'price', bid?, ft?, sqm?, price, label, choiceId? }
  // mode 'simple' | 'pro'; lang 'en' | 'zh'; panelWidth: side panel px (null = default, shell/resize.js);
  // guide: guided tour memory — offered once, done = { [useCaseId]: 'YYYY-MM-DD' };
  // textSize 'normal' | 'large' | 'larger' (core/textsize.js, B10) — only ever changed by a tap
  ui: { mode: 'simple', lang: 'en', panelWidth: null, textSize: 'normal', guide: { offered: false, done: {} } },
  plan: {                        // Plan tab inputs
    cpf: { wageGrowth: null, bonusMonths: null, prYear: {} }, // null = module default; prYear: { [buyerIndex]: 'PR1'|'PR2'|'PR3+' }
    // the home you own now (sell-then-buy): propertyType 'hdb'|'private'; subsidised true|false|null
    current: { owns: false, propertyType: 'hdb', flatType: '4 ROOM', salePrice: null, outstandingLoan: null, cpfUsed: null, accruedInterest: null, yearsHeld: null, subsidised: null, mode: null, remainingLease: null },
    btoId: null, btoFt: null, btoPrice: null, // BTO vs resale: project name, flat type, price you expect
    btoKeys: null,               // BTO vs resale without the project list (btoData switch off): expected key collection 'YYYY-MM'
    // Phase 7 A7: typed prices per '<project or "typed">|<flat type>' (btoPrice above = older saves, migrated on first
    // change); wait 'project'|'month'|'future' (null = automatic) + the years the user set for a future launch
    // (null = not confirmed → no verdict); your rent now (S$/month, null = nearby median)
    btoPrices: {}, btoWait: null, btoWaitYears: null, rentNow: null,
    // 7b B7: the one rent figure (core/rentshare.js; amount kept equal to rentNow): 'whole'|'room', S$/month, place
    rent: { type: 'whole', amount: null, town: null, bid: null, label: null },
    // ISO dates: keys of the flat you live in (MOP), completion of the next purchase; children's birth dates
    dates: { keyCollection: null, flatClass: 'standard', nextCompletion: null, children: [] },
  },
  // named scenarios: [{ id:'A'|'B'|'C'|'D', name, savedAt (ISO), focus, household, plan:{ cpf }, market:{ rent } }]
  // — inputs only (engine/scenario.js snapshotOf), every number is recomputed
  scenarios: [],
});

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
  return out;
}
const getPath = (obj, path) => (path ? path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj) : obj);
function setPath(obj, path, value) {
  const [k, ...rest] = path.split('.');
  const copy = Array.isArray(obj) ? obj.slice() : { ...obj };
  copy[k] = rest.length ? setPath(obj[k] ?? {}, rest.join('.'), value) : value;
  return copy;
}

/** Keep only well-formed scenarios: known id (first one wins), a flat with a price, a household; sorted A → D. */
export function cleanScenarios(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter((x) => isObj(x) && SCENARIO_IDS.includes(x.id) && !seen.has(x.id) && seen.add(x.id)
      && isObj(x.focus) && x.focus.price > 0 && isObj(x.household))
    .map((x) => ({ ...x, name: String(x.name ?? x.id).slice(0, SCENARIO_NAME_MAX) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** One-time import of the v1.8 profile (localStorage 'hdb-comparer'). */
export function migrateLegacy(raw) {
  let old;
  try { old = JSON.parse(raw || 'null'); } catch { return null; }
  const p = old && old.profile;
  if (!p) return null;
  const has = (v) => v != null && v !== '';
  return {
    household: {
      buyers: [{ age: has(p.age) ? +p.age : null, income: has(p.income) ? +p.income : null, citizenship: 'SC', cpfOa: null }],
      cash: has(p.cash) ? +p.cash : null,
      grantsOverride: has(p.grants) && +p.grants > 0 ? +p.grants : null,
      loan: p.loan === 'bank' ? 'bank' : 'hdb',
      tenure: has(p.tenure) ? +p.tenure : 25,
      needsReview: has(p.cash),
    },
    ui: { mode: 'pro' }, // existing users already work with the full table
  };
}

const withClean = (st) => ({ ...st, scenarios: cleanScenarios(st.scenarios) });

export function createStore({ storage = null, key = STORE_KEY } = {}) {
  const read = (k) => { try { return storage ? storage.getItem(k) : null; } catch { return null; } };
  const write = (k, v) => { try { if (storage) storage.setItem(k, v); } catch { /* quota / private mode */ } };
  const remove = (k) => { try { if (storage) storage.removeItem(k); } catch { /* ignore */ } };

  function load() {
    try {
      const saved = JSON.parse(read(key) || 'null');
      if (saved && saved.schemaVersion === defaults().schemaVersion) return withClean(merge(defaults(), saved));
    } catch { /* fall through */ }
    return merge(defaults(), migrateLegacy(read(LEGACY_KEY)) || {});
  }

  let state = load();
  const subs = new Set();
  // stable block ids (core/blockkey.js, attached by main.js once HDB_DATA is loaded): stamp = add `bk` keys before
  // writing / exporting, remap = re-point saved bids from those keys (after load and import). Identity until then.
  let stamp = (st) => st, remap = (st) => st;
  const persist = () => write(key, JSON.stringify(stamp(state)));
  const notify = (path) => {
    for (const s of subs) {
      if (!s.prefix || path.startsWith(s.prefix) || s.prefix.startsWith(path)) s.fn(getPath(state, s.prefix), path);
    }
  };

  // while a sample household is on, the live keys hold the sample: export / import / forget would act on the wrong data
  const inSample = () => (storage ? sampleStatus(storage) : null);
  const guard = () => { if (inSample()) throw new Error(SAMPLE_BLOCKED); };

  const api = {
    get: (path) => getPath(state, path),
    set(path, value) { state = setPath(state, path, value); persist(); notify(path); },
    /** subscribe('household', fn) → fn(value, changedPath); returns an unsubscribe function. */
    subscribe(prefix, fn) { const s = { prefix, fn }; subs.add(s); return () => subs.delete(s); },
    /** { id, phase } while a sample household is loaded (modules/samples), else null. */
    inSample,
    export() { guard(); return JSON.parse(JSON.stringify(stamp(state))); },
    /** Replace everything from an exported file; throws (and changes nothing) if it is not one. */
    import(obj) {
      guard();
      if (!isObj(obj) || obj.schemaVersion !== defaults().schemaVersion || !isObj(obj.household)) throw new Error('not an export from this app');
      state = remap(withClean(merge(defaults(), obj))); persist(); notify('');
    },
    /**
     * Stable block ids ({ stamp, remap } from core/blockkey.js attachBlockKeys): remaps the loaded state now
     * (notifies 'focus' / 'scenarios' only if a bid changed), persists once so older saves get their keys now, and
     * stamps every later save / export.
     */
    useBlockKeys(fns) {
      stamp = fns.stamp; remap = fns.remap;
      const next = remap(state), changed = next !== state;
      state = next;
      if (storage && read(key) != null) persist(); // nothing saved yet → nothing to stamp
      if (changed) { notify('focus'); notify('scenarios'); }
    },
    /** First free scenario id, or null when all four are used. */
    nextScenarioId() { const used = new Set(state.scenarios.map((x) => x.id)); return SCENARIO_IDS.find((id) => !used.has(id)) || null; },
    /**
     * Save a scenario: `build(id)` returns the snapshot for the first free id. Returns the id, or null when full
     * (or the snapshot is not well-formed) — nothing changes then.
     */
    saveScenario(build) {
      const id = api.nextScenarioId();
      if (!id) return null;
      const snap = { ...(typeof build === 'function' ? build(id) : build), id };
      const next = cleanScenarios([...state.scenarios, snap]);
      if (!next.some((x) => x.id === id)) return null;
      api.set('scenarios', next);
      return id;
    },
    /** Rename (trimmed, at most SCENARIO_NAME_MAX characters); a blank name keeps the old one. Returns true if renamed. */
    renameScenario(id, name) {
      const n = String(name ?? '').trim().slice(0, SCENARIO_NAME_MAX);
      if (!n || !state.scenarios.some((x) => x.id === id)) return false;
      api.set('scenarios', state.scenarios.map((x) => (x.id === id ? { ...x, name: n } : x)));
      return true;
    },
    deleteScenario(id) {
      if (!state.scenarios.some((x) => x.id === id)) return false;
      api.set('scenarios', state.scenarios.filter((x) => x.id !== id));
      return true;
    },
    /**
     * Forget everything: this store, the legacy comparer key and any leftover sample record (only an 'exit' or
     * unreadable one can be left here — guard() refuses while a sample is on; an 'exit' record would otherwise put
     * the forgotten data back at the next start). tests/core/forget.test.js lists the keys left afterwards.
     */
    reset() { guard(); remove(key); remove(LEGACY_KEY); remove(SAMPLE_KEY); remove(FOLDS_KEY); state = defaults(); notify(''); },
  };
  return api;
}

// ---------------------------------------------------------------- sample households sandbox (Phase 6a AC 2)
// The user's own sghf:v2 + hdb-comparer are copied raw (byte for byte, null = key absent) into SAMPLE_KEY before a
// sample is written into those live keys; "Exit sample" writes the copies back and drops SAMPLE_KEY. Both writes
// happen at start-up (applySampleBoot, called before anything reads the keys) after a reload, so a debounced save
// from the page being left can never land on top of them. Pure functions of an injected storage (node-testable).
export const SAMPLE_KEY = 'sghf:sample';
export const SANDBOXED_KEYS = [STORE_KEY, LEGACY_KEY];
export const SAMPLE_BLOCKED = 'Exit the sample first';
const PHASES = ['enter', 'active', 'exit'];

const rawGet = (storage, k) => { try { return storage.getItem(k); } catch { return null; } };
const isSnapshot = (s) => isObj(s) && SANDBOXED_KEYS.every((k) => s[k] === null || typeof s[k] === 'string');

/** Raw copy of the sandboxed keys: { key: string | null } (null = the key did not exist). */
export function snapshotKeys(storage) { return Object.fromEntries(SANDBOXED_KEYS.map((k) => [k, rawGet(storage, k)])); }

/** Put a snapshot back exactly: strings as they were, keys that did not exist removed. Only the sandboxed keys. */
export function restoreKeys(storage, snap) {
  for (const k of SANDBOXED_KEYS) { if (snap[k] == null) storage.removeItem(k); else storage.setItem(k, snap[k]); }
}

/** The sandbox record { id, phase, backup?, payload? }, or null (missing / unreadable). */
export function readSample(storage) {
  try {
    const r = JSON.parse(rawGet(storage, SAMPLE_KEY) || 'null');
    return isObj(r) && typeof r.id === 'string' && PHASES.includes(r.phase) && (r.backup == null || isSnapshot(r.backup)) ? r : null;
  } catch { return null; }
}

/** { id, phase: 'enter' | 'active' } while a sample is on (or loads at the next start), else null. */
export function sampleStatus(storage) {
  const r = readSample(storage);
  return r && r.phase !== 'exit' ? { id: r.id, phase: r.phase } : null;
}

/** The user's own data: the backup while a sample is on, else the live keys. */
export const userSnapshot = (storage) => readSample(storage)?.backup || snapshotKeys(storage);

/**
 * Ask for sample `id`; `payload` = { [sandboxed key]: string } is written at the next start (applySampleBoot).
 * Switching from one sample to another keeps the backup of the user's own data.
 */
export function requestSample(storage, id, payload) {
  if (!isSnapshot(payload)) throw new Error('sample payload must hold a string or null per key');
  const r = readSample(storage);
  storage.setItem(SAMPLE_KEY, JSON.stringify({ id, phase: 'enter', payload, ...(r?.backup ? { backup: r.backup } : {}) }));
}

/** Ask to leave the sample: the backup goes back at the next start. Nothing written yet → just forget the request. */
export function requestSampleExit(storage) {
  const r = readSample(storage);
  if (!r) return false;
  if (r.backup) storage.setItem(SAMPLE_KEY, JSON.stringify({ id: r.id, phase: 'exit', backup: r.backup }));
  else storage.removeItem(SAMPLE_KEY);
  return true;
}

/**
 * Start-up step (before createStore and the map code read the keys): 'enter' → back up the user's keys (unless a
 * backup exists), write the payload, phase 'active'; 'exit' → restore the backup exactly, drop the record.
 * Returns sampleStatus afterwards. A failed write (quota) puts the user's data back and drops the sample.
 */
export function applySampleBoot(storage) {
  if (!storage) return null;
  const r = readSample(storage);
  if (!r) return null;
  if (r.phase === 'exit') {
    if (r.backup) restoreKeys(storage, r.backup);
    storage.removeItem(SAMPLE_KEY);
    return null;
  }
  if (r.phase === 'enter') {
    const backup = r.backup || snapshotKeys(storage);
    try {
      storage.setItem(SAMPLE_KEY, JSON.stringify({ id: r.id, phase: 'active', backup })); // record first: always restorable
      restoreKeys(storage, r.payload);
    } catch {
      try { restoreKeys(storage, backup); storage.removeItem(SAMPLE_KEY); } catch { /* storage unusable */ }
      return null;
    }
  }
  return sampleStatus(storage);
}
