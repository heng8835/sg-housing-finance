import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { undoController, offerUndo, UNDO_MS } from '../../app/core/undo.js';

function fakeTimers() {
  let next = 1;
  const live = new Map();
  return {
    setTimer: (fn, ms) => { const id = next++; live.set(id, { fn, ms }); return id; },
    clearTimer: (id) => live.delete(id),
    fire() { const all = [...live.entries()]; live.clear(); all.forEach(([, x]) => x.fn()); },
    get count() { return live.size; },
    get ms() { return [...live.values()].map((x) => x.ms); },
  };
}
const MS = 6000; // a caller's own timer (the app's default is none: UNDO_MS = 0)
function make(ms = MS) {
  const log = [], tm = fakeTimers();
  const c = undoController({ show: (m) => log.push(['show', m]), hide: (r) => log.push(['hide', r]), setTimer: tm.setTimer, clearTimer: tm.clearTimer, ms });
  return { c, log, tm };
}

test('undo: offer shows, Undo runs the callback once and closes', () => {
  const { c, log, tm } = make();
  let back = 0;
  c.offer('Removed A.', () => back++);
  assert.equal(c.open, true); assert.equal(c.message, 'Removed A.');
  assert.deepEqual(tm.ms, [MS]);
  assert.equal(c.undo(), true);
  assert.equal(c.undo(), false, 'only once');
  assert.equal(back, 1); assert.equal(c.open, false); assert.equal(tm.count, 0);
  assert.deepEqual(log, [['show', 'Removed A.'], ['hide', 'undo']]);
});

test('undo: no timer by default (P8-07: it ends at the next action or page change)', () => {
  assert.equal(UNDO_MS, 0);
  const { c, tm } = make(UNDO_MS);
  c.offer('Removed A.', () => {});
  assert.equal(tm.count, 0, 'no timer set');
  c.pause(); c.resume();
  assert.equal(tm.count, 0); assert.equal(c.open, true);
});

test('undo: with a caller\'s timer the line closes by itself; dismiss closes without undoing', () => {
  const { c, log, tm } = make();
  let back = 0;
  c.offer('Removed A.', () => back++);
  tm.fire();
  assert.equal(c.open, false); assert.equal(back, 0);
  c.offer('Removed B.', () => back++);
  assert.equal(c.dismiss(), true); assert.equal(c.dismiss(), false);
  assert.equal(back, 0);
  assert.deepEqual(log.map((x) => x[1]), ['Removed A.', 'timeout', 'Removed B.', 'dismiss']);
});

test('undo: a new removal replaces the line (the earlier one stays done); stale timers do nothing', () => {
  const { c, log, tm } = make();
  const undone = [];
  c.offer('Removed A.', () => undone.push('A'));
  c.offer('Removed B.', () => undone.push('B'));
  assert.equal(tm.count, 1, 'the first timer was cleared');
  assert.deepEqual(log, [['show', 'Removed A.'], ['hide', 'replaced'], ['show', 'Removed B.']]);
  c.undo();
  assert.deepEqual(undone, ['B']);
});

test('undo: hover / focus holds the timer; leaving starts a fresh period', () => {
  const { c, tm } = make();
  c.offer('Removed A.', () => {});
  c.pause();
  assert.equal(tm.count, 0, 'no timer while paused');
  c.resume();
  assert.equal(tm.count, 1);
  tm.fire();
  assert.equal(c.open, false);
  c.pause(); c.resume(); // nothing open: no-ops
  assert.equal(tm.count, 0);
});

test('undo: undo must be a function; offerUndo is a no-op without a document (node)', () => {
  const { c } = make();
  assert.throws(() => c.offer('x', null), TypeError);
  const h = offerUndo('Removed A.', () => {});
  assert.equal(typeof h.dismiss, 'function');
});

test('M-17 / Q7: no confirm() box for Remove flat / Remove all / Delete scenario / Delete view — each offers Undo', () => {
  const src = (p) => readFileSync(new URL(`../../app/${p}`, import.meta.url), 'utf8');
  const legacy = src('modules/explore/legacy.js'), scen = src('modules/scenarios/index.js'), views = src('modules/explore/views.js');
  assert.doesNotMatch(legacy, /confirm\(t\('Remove all flats/);
  assert.doesNotMatch(scen, /confirm\(t\('Delete scenario/);
  assert.doesNotMatch(views, /confirm\(t\('Delete the saved view/);
  for (const s of [legacy, scen, views]) assert.match(s, /offerUndo\(/);
  // confirm stays for Forget my data and Start over
  const hh = src('modules/household/index.js');
  assert.match(hh, /confirm\(t\('Start over\?/);
  assert.match(hh, /confirm\(t\('Forget your household/);
});

test('undo: the callback runs before the line closes (so the focus can go to the restored item)', () => {
  const order = [];
  const c = undoController({ show: () => {}, hide: (r) => order.push(`hide:${r}`), setTimer: () => 1, clearTimer: () => {} });
  c.offer('Removed A.', () => order.push('undo'));
  c.undo();
  assert.deepEqual(order, ['undo', 'hide:undo']);
});
