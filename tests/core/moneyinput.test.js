// Phone overhaul §3.5 / §7, owner default Q10: money fields show thousands separators; the value handed to the
// engines is the same plain whole-dollar number as before (core/moneyinput.js, pure helpers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, formatMoney, formatTyping, deleteAcrossComma, moneyInput, MONEY_MAX_DIGITS } from '../../app/core/moneyinput.js';

test('format: "600000" → "600,000"; numbers; empty → ""', () => {
  assert.equal(formatMoney('600000'), '600,000');
  assert.equal(formatMoney(600000), '600,000');
  assert.equal(formatMoney(1234567), '1,234,567');
  assert.equal(formatMoney(999), '999');
  assert.equal(formatMoney(0), '0');
  assert.equal(formatMoney(null), '');
  assert.equal(formatMoney(undefined), '');
  assert.equal(formatMoney(''), '');
  assert.equal(formatMoney(612345.5), '612,345.5', 'a stored decimal is shown, never rounded');
});

test('parse: "S$ 600,000" → 600000; empty → null', () => {
  assert.equal(parseMoney('S$ 600,000'), 600000);
  assert.equal(parseMoney('600,000'), 600000);
  assert.equal(parseMoney('600000'), 600000);
  assert.equal(parseMoney('S$600000'), 600000);
  assert.equal(parseMoney('$3,300'), 3300);
  assert.equal(parseMoney('SGD 3300'), 3300);
  assert.equal(parseMoney('0'), 0);
  assert.equal(parseMoney('007'), 7);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('   '), null);
  assert.equal(parseMoney(null), null);
  assert.equal(parseMoney(undefined), null);
  assert.equal(parseMoney(600000), 600000);
});

test('parse: pasted text with spaces, commas and full-width digits', () => {
  assert.equal(parseMoney(' 600 000 '), 600000);
  assert.equal(parseMoney('6,00,000'), 600000);
  assert.equal(parseMoney('600 000'), 600000);
  assert.equal(parseMoney('S$ 600,000.00'), 600000, '.00 is whole dollars');
  assert.equal(parseMoney('６０００００'), 600000);
  assert.equal(parseMoney('６００，０００'), 600000);
});

test('parse: negative, decimal and junk are rejected (NaN)', () => {
  for (const bad of ['-500', '−500', '600000.5', '600,000.25', '1.5k', 'abc', 'S$', '12a', '1e6', String(10 ** MONEY_MAX_DIGITS), -1, 2.5, Infinity])
    assert.ok(Number.isNaN(parseMoney(bad)), `${bad} rejected`);
  assert.equal(parseMoney('9'.repeat(MONEY_MAX_DIGITS)), Number('9'.repeat(MONEY_MAX_DIGITS)));
});

test('round trip: format(parse(x)) is stable and parse(format(n)) === n', () => {
  for (const n of [0, 5, 50, 500, 5000, 50000, 600000, 1234567, 99999999]) assert.equal(parseMoney(formatMoney(n)), n);
  assert.equal(formatMoney(parseMoney('S$ 1 234 567')), '1,234,567');
});

test('typing: separators appear and the caret stays next to the same digit', () => {
  assert.deepEqual(formatTyping('6000', 4), { text: '6,000', caret: 5 });
  assert.deepEqual(formatTyping('60000', 5), { text: '60,000', caret: 6 });
  assert.deepEqual(formatTyping('600000', 6), { text: '600,000', caret: 7 });
  // a digit typed in the middle: "60,|000" + "5" = "60,5|000" → "605|,000" (caret still right after the 5)
  assert.deepEqual(formatTyping('60,5000', 4), { text: '605,000', caret: 3 });
  // a digit typed at the start
  assert.deepEqual(formatTyping('1600,000', 1), { text: '1,600,000', caret: 1 });
  // deleting a digit (browser already removed it): "600,00|0" minus the 0 before the caret
  assert.deepEqual(formatTyping('600,00', 6), { text: '60,000', caret: 6 });
  assert.deepEqual(formatTyping('', 0), { text: '', caret: 0 });
  assert.deepEqual(formatTyping('007', 3), { text: '7', caret: 1 });
  assert.deepEqual(formatTyping('0', 1), { text: '0', caret: 1 });
});

test('typing: a paste with S$, spaces and commas is cleaned; caret at the end', () => {
  assert.deepEqual(formatTyping('S$ 600 000', 10), { text: '600,000', caret: 7 });
  assert.deepEqual(formatTyping('６０００００', 6), { text: '600,000', caret: 7 });
});

test('typing: a decimal point, a minus or a letter is left as typed (shown as invalid, not silently changed)', () => {
  assert.deepEqual(formatTyping('600000.5', 8), { text: '600000.5', caret: 8 });
  assert.deepEqual(formatTyping('-500', 4), { text: '-500', caret: 4 });
  assert.deepEqual(formatTyping('12a', 3), { text: '12a', caret: 3 });
});

test('typing: never longer than the digit cap', () => {
  const r = formatTyping('1'.repeat(MONEY_MAX_DIGITS + 3));
  assert.equal(r.text.replace(/,/g, '').length, MONEY_MAX_DIGITS);
});

test('Backspace / Delete next to a comma remove the digit beyond it', () => {
  // "600,|000" Backspace → removes the 0 before the comma → "60,000", caret after "60"
  assert.deepEqual(deleteAcrossComma('600,000', 4, 'back'), { text: '60,000', caret: 2 });
  // "600|,000" Delete → removes the 0 after the comma → "60,0|00" (still three digits before the caret)
  assert.deepEqual(deleteAcrossComma('600,000', 3, 'forward'), { text: '60,000', caret: 4 });
  assert.equal(deleteAcrossComma('600,000', 5, 'back'), null);
  assert.equal(deleteAcrossComma('600,000', 0, 'back'), null);
});

test('markup: text field, numeric keyboard, formatted value, attributes escaped', () => {
  const html = moneyInput({ value: 600000, placeholder: 'e.g. 600,000', attrs: 'id="afPrice" data-p="plan.x" data-k="money"' });
  assert.match(html, /^<span class="money-in"><input type="text" inputmode="numeric"/);
  assert.match(html, /id="afPrice"/);
  assert.match(html, /value="600,000"/);
  assert.match(html, /placeholder="e.g. 600,000"/);
  assert.match(html, /data-money/);
  assert.match(html, /id="afPrice" data-p="plan.x" data-k="money"/);
  assert.match(moneyInput({ value: null }), /value=""/);
  assert.doesNotMatch(moneyInput({ placeholder: '"><b>' }), /"><b>/);
});
