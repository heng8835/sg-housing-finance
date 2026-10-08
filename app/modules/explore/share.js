// Every URL the Explore code builds from user state lives here, so the privacy test (tests/privacy/) can drive the
// real builders with marker values (go-live blocker 3). Pure: no DOM, no network, no storage.
//
//   shareUrl        "#shortlist=" link — flats only ([block|street key, flat type, storey, sqm, asking price, facing]);
//                   in the URL FRAGMENT, which browsers never send to a server or in a Referer header.
//                   Never nicknames, listing URLs, household, income, CPF or cash.
//   readShareHash   the opposite (old index rows still read, at most SHARE_MAX flats)
// No request carries user text: the Daily places search runs on the app's own data (core/placesearch.js) since
// OneMap's search API needs a per-owner token; OneMap serves map tiles + logo only.
import { shareRow, readShareRow } from '../../core/blockkey.js';

export const SHARE_MAX = 12;
export const SHARE_PREFIX = '#shortlist=';

/** URL-safe base64 of UTF-8 text (no padding). */
export const b64url = {
  enc: (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))),
};

/** Share link for the shortlist: `origin + pathname + #shortlist=…` (no query string, no previous fragment). */
export function shareUrl(choices, hdb, loc) {
  const rows = (choices || []).map((c) => shareRow(c, hdb));
  return `${loc.origin}${loc.pathname}${SHARE_PREFIX}${b64url.enc(JSON.stringify(rows))}`;
}

/**
 * `location.hash` → null (not a share link) | { rows: [{ bid, ft, storey, sqm, price, facing }] } | { error: true }.
 * Unknown blocks / labels are dropped; at most SHARE_MAX rows.
 */
export function readShareHash(hash, hdb) {
  const m = String(hash || '').match(/^#shortlist=([\w-]+)$/);
  if (!m) return null;
  let rows;
  try { rows = JSON.parse(b64url.dec(m[1])); } catch { return { error: true }; }
  return { rows: (Array.isArray(rows) ? rows : []).map((r) => readShareRow(r, hdb)).filter(Boolean).slice(0, SHARE_MAX) };
}
