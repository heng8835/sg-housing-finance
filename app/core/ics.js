// iCalendar (RFC 5545) text for all-day events — the "Key dates" download. Format code, not rules:
// escaping, CRLF line ends and folding at 75 octets (UTF-8 aware, so Chinese titles fold safely).

const FOLD = 75;
const enc = new TextEncoder();
const bytes = (s) => enc.encode(s).length;

/** Escape TEXT values: backslash, semicolon, comma, newline. */
export const escapeText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Fold a content line: first line ≤ 75 octets, continuations start with one space (≤ 75 incl. space). */
export function fold(line) {
  const out = [];
  let cur = '', limit = FOLD;
  for (const ch of line) {
    if (bytes(cur + ch) > limit) { out.push(cur); cur = ' ' + ch; limit = FOLD; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

const compact = (isoDate) => isoDate.replace(/-/g, '');
function nextDay(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const n = new Date(Date.UTC(y, m - 1, d + 1));
  return `${n.getUTCFullYear()}${String(n.getUTCMonth() + 1).padStart(2, '0')}${String(n.getUTCDate()).padStart(2, '0')}`;
}
// stable id from the event content (re-downloading updates rather than duplicates in most calendars)
function uidFor(e) {
  let h = 5381;
  for (const ch of `${e.id || ''}|${e.start}|${e.title}`) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return `${h.toString(36)}-${compact(e.start)}@sg-housing-finance`;
}

/**
 * @param {{ id?:string, start:string, end?:string|null, title:string, description?:string }[]} events
 *   start / end are ISO dates; end is inclusive (multi-day all-day event).
 * @param {{ stamp:string, calName?:string }} opts stamp = DTSTAMP in UTC, 'YYYYMMDDTHHMMSSZ'
 * @returns {string}
 */
export function buildIcs(events, { stamp, calName = 'Key dates' }) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SG Housing & Finance//Key dates//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(calName)}`];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${uidFor(e)}`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.start)}`, `DTEND;VALUE=DATE:${nextDay(e.end || e.start)}`,
      `SUMMARY:${escapeText(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
