import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, escapeText, fold } from '../../app/core/ics.js';

const unfold = (text) => text.replace(/\r\n /g, '');
const bytes = (s) => new TextEncoder().encode(s).length;

test('escapes TEXT values', () => {
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
});

test('folds long lines at 75 octets without splitting UTF-8 characters', () => {
  const line = 'SUMMARY:' + '最低居住期结束'.repeat(10);
  const folded = fold(line);
  for (const l of folded.split('\r\n')) assert.ok(bytes(l) <= 75, l);
  assert.equal(unfold(folded), line);
});

test('all-day events, inclusive end, CRLF and stable UIDs', () => {
  const events = [
    { id: 'mop', start: '2029-03-15', title: 'Minimum Occupation Period ends', description: 'Sell, rent out, or buy private.' },
    { id: 'p1-1', start: '2028-06-01', end: '2028-08-31', title: 'Primary 1 registration, child 1' },
  ];
  const ics = buildIcs(events, { stamp: '20261007T000000Z' });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'every line ends with CRLF');
  const text = unfold(ics);
  assert.match(text, /DTSTART;VALUE=DATE:20290315\r\nDTEND;VALUE=DATE:20290316/);
  assert.match(text, /DTSTART;VALUE=DATE:20280601\r\nDTEND;VALUE=DATE:20280901/);
  assert.match(text, /SUMMARY:Primary 1 registration\\, child 1/);
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, 2);
  const uids = text.match(/UID:.+/g);
  assert.equal(new Set(uids).size, 2);
  assert.deepEqual(buildIcs(events, { stamp: '20991231T000000Z' }).match(/UID:.+/g), ics.match(/UID:.+/g));
});
