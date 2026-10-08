import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepFolds, focusSelector } from '../../app/core/fold.js';

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
