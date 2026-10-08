// Build-time feature switches (DEC-015). This is the PRIVATE default — every feature on.
// The public export (tools/public_export.py) rewrites this file with the switch off, e.g.
//   export const BUILD_FEATURES = { btoData: false, floodData: false };
// and leaves out the data files the features need (data/bto.js, data/flood.js). Code stays in the repo ("hide, don't drop").
// Read through core/features.js (runtime: ?features=-btoData switches a feature off for testing; a URL can
// never switch on a feature the build turned off). tools/build_sw_manifest.py reads the values below.
//
// btoData — the BTO projects dataset (data/bto.js; not licensed for publication, DEC-015): map layer + popups +
//           search hits, compare row "Upcoming BTO supply within 1 km", the BTO part of the future-value
//           supply driver, the Plan → "BTO or resale?" project list. Off → those parts are hidden; the Plan card
//           works from a typed BTO price and key date.
// floodData — PUB's flood-prone points (data/flood.js, hand-transcribed from PUB's list; PUB's website terms allow
//           personal viewing only, no republishing without written consent): map layer + legend row, block-popup line,
//           compare row "Flood-prone point within 300 m", the "No flood-prone point" priority, the PUB part of the
//           family sources line. Off → the row says "Not in this version" and names PUB's list (plain text, no link); the rest hides.
export const BUILD_FEATURES = { btoData: false, floodData: false };
// App version shown in Learn → About (Phase 7b): 'dev' in the repo; tools/stage_site.py writes the git short SHA of the
// commit it stages into the copy it deploys (never into this file).
export const BUILD_SHA = 'dev';
// Owner's donation page (DEC-019: donations first) — e.g. a Ko-fi, Buy Me a Coffee or GitHub Sponsors URL (https only).
// Empty = Learn → About shows no "Support this project" section. Add the page's host to tests/privacy/egress.test.js HOSTS.
export const DONATE_URL = '';
