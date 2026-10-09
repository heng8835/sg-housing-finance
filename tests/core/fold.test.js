import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepFolds, focusSelector, foldMemory, rememberFolds, FOLDS_MAX } from '../../app/core/fold.js';
import { FOLDS_KEY } from '../../app/core/store.js';

// minimal stand-ins for the DOM pieces fold.js touches
const details = (key, open) => ({ open, dataset: { fold: key } });
function fakeRoot(items) {
  const listeners = [];
  const root = { items, listeners, addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }), querySelectorAll: () => root.items };
  return root;
}
const el = (attrs, extra = {}) => ({ getAttribute: (k) => attrs[k] ?? null, hasAttribute: (k) => k in attrs, id: attrs.id || '', ...extra });

test('keepFolds: default state, toggle (capture) and snapshot remember; apply re-opens after a re-render', () => {
  const root = fakeRoot([details('pathways', false), details('landlord', false)]);
  const f = keepFolds(root);
  assert.equal(f.attr('pathways'), '');
  assert.equal(f.attr('rbTable', true), ' open');
  const lis = root.listeners.find((l) => l.type === 'toggle');
  assert.ok(lis && lis.capture === true);
  root.items[0].open = true;
  lis.fn({ target: root.items[0] });
  assert.equal(f.attr('pathways'), ' open');
  root.items[1].open = true; f.snapshot();
  assert.equal(f.isOpen('landlord'), true);
  root.items = [details('pathways', false), details('landlord', false), details('mcSources', false)];
  f.apply();
  assert.deepEqual(root.items.map((d) => d.open), [true, true, false]);
});

test('focusSelector: id, then data-p / data-lo / data-path / data-rt, then data-act (+ data-i), then a fold summary', () => {
  assert.equal(focusSelector(el({ id: 'rtAsk' })), '#rtAsk');
  assert.equal(focusSelector(el({ 'data-p': 'plan.current.salePrice' })), '[data-p="plan.current.salePrice"]');
  assert.equal(focusSelector(el({ 'data-lo': 'rent' })), '[data-lo="rent"]');
  assert.equal(focusSelector(el({ 'data-path': 'buyers.0.age' })), '[data-path="buyers.0.age"]');
  assert.equal(focusSelector(el({ 'data-rt': 'room' })), '[data-rt="room"]');
  assert.equal(focusSelector(el({ 'data-act': 'remove-child', 'data-i': '1' })), '[data-act="remove-child"][data-i="1"]');
  assert.equal(focusSelector(el({}, { tagName: 'SUMMARY', parentElement: { dataset: { fold: 'pathways' } } })), 'details[data-fold="pathways"] > summary');
  assert.equal(focusSelector(el({})), null);
  assert.equal(focusSelector(null), null);
});

const memStorage = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const summaryIn = (d) => ({ closest: (sel) => (sel === 'summary' ? { parentElement: d } : null) });

test('M-14 foldMemory: { key: open } in FOLDS_KEY, booleans only, bad / long keys refused, oldest dropped past the cap', () => {
  const s = memStorage({ [FOLDS_KEY]: JSON.stringify({ hhLoan: true, 'bad key': true, afNotes: 'yes', pathways: false }) });
  const m = foldMemory(s);
  assert.equal(m.get('hhLoan'), true); assert.equal(m.get('pathways'), false);
  assert.equal(m.get('bad key'), undefined); assert.equal(m.get('afNotes'), undefined); assert.equal(m.get('never'), undefined);
  assert.equal(m.set('afNotes', true), true);
  assert.equal(m.set('afNotes', true), false, 'unchanged: no write');
  assert.equal(m.set('x'.repeat(61), true), false);
  assert.deepEqual(JSON.parse(s.getItem(FOLDS_KEY)), { hhLoan: true, pathways: false, afNotes: true });
  assert.equal(foldMemory(memStorage({ [FOLDS_KEY]: '{oops' })).get('hhLoan'), undefined);
  const big = foldMemory(memStorage());
  for (let i = 0; i <= FOLDS_MAX; i++) big.set(`cmp-glance-${i}`, true);
  assert.equal(big.get('cmp-glance-0'), undefined, 'oldest dropped');
  assert.equal(big.get(`cmp-glance-${FOLDS_MAX}`), true);
});

test('M-14 keepFolds + rememberFolds: a tapped fold is remembered for the next visit; programmatic toggles and defaults are not', () => {
  const s = memStorage();
  rememberFolds(s);
  try {
    const d1 = { ...details('pathways', false), tagName: 'DETAILS' }, d2 = { ...details('landlord', false), tagName: 'DETAILS' };
    const root = fakeRoot([d1, d2]); root.contains = () => true;
    keepFolds(root);
    const on = (type) => root.listeners.find((l) => l.type === type).fn;
    on('click')({ target: summaryIn(d1) }); d1.open = true; on('toggle')({ target: d1 }); // the user taps "pathways"
    d2.open = true; on('toggle')({ target: d2 }); // opened by code (e.g. a jump chip): this visit only
    assert.deepEqual(JSON.parse(s.getItem(FOLDS_KEY)), { pathways: true });
    // next visit: a fresh keepFolds reads the memory; untouched folds keep their default
    const next = keepFolds(fakeRoot([]));
    assert.equal(next.attr('pathways'), ' open');
    assert.equal(next.isOpen('landlord', false), false);
    assert.equal(next.attr('rbTable', true), ' open');
    const later = fakeRoot([details('pathways', false)]);
    keepFolds(later).apply();
    assert.equal(later.items[0].open, true, 'apply() uses the memory too');
  } finally { rememberFolds(null); }
  assert.equal(keepFolds(fakeRoot([])).attr('pathways'), '', 'without memory: per visit only');
});
