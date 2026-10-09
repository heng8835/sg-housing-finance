// 7c C11 flat-type presets: one tap sets the flat-type filter to "2–3 room" or "4 room +".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FT_PRESETS, presetIdx, presetOn, presetChips } from '../../app/modules/explore/ftpresets.js';

const FT = ['1 ROOM', '2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM', 'EXECUTIVE', 'MULTI-GENERATION'];

test('one tap sets exactly the group', () => {
  assert.deepEqual(FT_PRESETS.map((p) => p.label), ['2–3 room', '4 room +']);
  assert.deepEqual(presetIdx(FT, 'small'), [1, 2]);
  assert.deepEqual(presetIdx(FT, 'large'), [3, 4, 5, 6]);
  assert.deepEqual(presetIdx(FT, 'nope'), []);
  assert.deepEqual(presetIdx(['3 ROOM', '4 ROOM'], 'large'), [1]); // names missing from the data are skipped
});

test('the active preset is shown pressed only for the exact set', () => {
  assert.equal(presetOn(FT, [2, 1], 'small'), true);
  assert.equal(presetOn(FT, [1, 2, 3], 'small'), false);
  assert.equal(presetOn(FT, [], 'small'), false);
  const html = presetChips(FT, [3, 4, 5, 6]);
  assert.match(html, /data-ft-preset="small" aria-pressed="false"/);
  assert.match(html, /class="chip ft-preset on" data-ft-preset="large" aria-pressed="true"/);
  assert.match(html, /role="group"/);
  assert.equal(presetChips(['1 ROOM'], []), '');
});
