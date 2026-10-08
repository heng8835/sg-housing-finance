import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maxWidth, clampWidth, keyWidth, PANEL_MIN, PANEL_DEFAULT, PANEL_MAX } from '../../app/modules/shell/resize.js';

test('max width leaves at least 360 px of map and never exceeds 680', () => {
  assert.equal(maxWidth(1920), PANEL_MAX);
  assert.equal(maxWidth(1040), 680);
  assert.equal(maxWidth(1000), 640);
  assert.equal(maxWidth(901), 541);
  assert.equal(maxWidth(600), PANEL_MIN); // never below the minimum
  assert.equal(maxWidth(undefined), PANEL_MAX);
});

test('clamp: null / junk → default; out of range → nearest bound; rounds', () => {
  assert.equal(clampWidth(null, 1920), PANEL_DEFAULT);
  assert.equal(clampWidth(undefined, 1920), PANEL_DEFAULT);
  assert.equal(clampWidth('500', 1920), PANEL_DEFAULT);
  assert.equal(clampWidth(Number.NaN, 1920), PANEL_DEFAULT);
  assert.equal(clampWidth(200, 1920), PANEL_MIN);
  assert.equal(clampWidth(900, 1920), PANEL_MAX);
  assert.equal(clampWidth(612.6, 1920), 613);
  assert.equal(clampWidth(600, 1000), 600);
  assert.equal(clampWidth(660, 1000), 640); // window narrower → clamped
  assert.equal(clampWidth(null, 700), PANEL_MIN); // default itself clamped on a tiny viewport
});

test('keyboard: arrows ±16, Shift ±64, Home / End, Enter resets', () => {
  assert.deepEqual(keyWidth('ArrowRight', false, 420, 1920), { width: 436, reset: false });
  assert.deepEqual(keyWidth('ArrowLeft', false, 420, 1920), { width: 404, reset: false });
  assert.deepEqual(keyWidth('ArrowRight', true, 420, 1920), { width: 484, reset: false });
  assert.deepEqual(keyWidth('ArrowLeft', true, 380, 1920), { width: PANEL_MIN, reset: false });
  assert.deepEqual(keyWidth('ArrowRight', true, 660, 1920), { width: PANEL_MAX, reset: false });
  assert.deepEqual(keyWidth('Home', false, 500, 1920), { width: PANEL_MIN, reset: false });
  assert.deepEqual(keyWidth('End', false, 500, 1000), { width: 640, reset: false });
  assert.deepEqual(keyWidth('Enter', false, 600, 1920), { width: PANEL_DEFAULT, reset: true });
  assert.equal(keyWidth('a', false, 420, 1920), null);
  assert.equal(keyWidth('ArrowUp', false, 420, 1920), null);
});
