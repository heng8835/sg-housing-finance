# Compare-table fixture generators

`npm run fixtures` regenerates the chain into `tests/fixtures/`; `npm run fixtures:check` builds it in a temp
folder and compares byte-for-byte (exit 1 on a difference). Chain (`all.mjs` runs it):
`compare-phase2.txt` → `seed_rows.mjs` → `compare-phase6b.txt` → `fv_fixture.mjs` → `compare-phase6b-fv.txt` →
`cpflife_fixture.mjs write` → `compare-phase6d.txt` + `compare-phase6d-fv.txt`; BTO off (DEC-015):
`fv_fixture.mjs <tmp> nobto` → `cpflife_fixture.mjs write nobto=<tmp>` → `compare-phase6d-nobto.txt`
(`nobto` = no `bto.js`, `btoOff` future-value ctx, the "Upcoming BTO supply" row and its "best in" measure removed).
Phase 7a (A1, one numbers engine): `money_fixture.mjs` turns the three 6d files into `compare-phase7a.txt`,
`compare-phase7a-fv.txt`, `compare-phase7a-nobto.txt` — the "Can we afford it?" money rows and the At-a-glance
money lines re-rendered by `app/modules/explore/money.js` (= Afford's `planPurchase`), header "best in X of N"
re-scored. Since 7a the 6b / 6d files are **historical**: the chain builds them in a temp folder and only the 7a
files are written / checked. Reviewed diff: `hdb-data-pipeline/docs/specs/phase7a-compare-diff.md`.
Phase 7 B2 ("For the family"): `family_fixture.mjs` turns the three 7a files into `compare-phase7a-family.txt`,
`-family-fv.txt`, `-family-nobto.txt` — section "FOR THE FAMILY" before "LOCATION & CONVENIENCE" rendered by
`app/modules/explore/familyrows.js` (reads `data/poi.js` + `data/family.js`), "Primary schools within 1 km" re-rendered
there (same measure, asserted), "Primary schools within 2 km" / "Nearest primary school" / "Childcare within 500 m"
dropped (their measures leave "best in X of N"), "Nearest MRT" moved verbatim. Reviewed diff:
`hdb-data-pipeline/docs/specs/phase7a-family-diff.md`. The 7a files stay written / checked unchanged.
Values depend on `app/data/*.js` and the dates fixed in the scripts (policy 7 Oct 2026, data to Sep 2026).
Phase 7b: `phase7b_fixture.mjs` turns the three 7a-family files into `compare-phase7b.txt`, `-fv.txt`, `-nobto.txt` — the
At-a-glance premium flag re-rendered by `app/modules/explore/comparables.js` `premiumFlag()` (B13: "Unusually high / low"
beyond ±20 %; inside that band the old flag, asserted). It also asserts that the "Over-priced?" row (B13 rank text only
below 8 sales) and the money rows (B12: no PHG row and the same planPurchase inputs while no daily place is tagged as the
parents' home) are unchanged; the B1 header note only appears with saved ticks (the seed has none). Since 7b the 7a and
7a-family files are **historical** too: built in the temp folder, only the 7b files are written / checked. Reviewed diff:
`hdb-data-pipeline/docs/specs/phase7b-compare-diff.md`.
Fill links (Oct 2026): `filllinks_fixture.mjs` turns the three 7b files into `compare-phase7c.txt`, `-fv.txt`, `-nobto.txt` —
empty-state cells that wait for an input show the fill-link text (`app/core/filllink.js`); the 7b files are historical
since (built in the temp folder). Reviewed diff: `hdb-data-pipeline/docs/specs/fill-links-compare-diff.md`.
Flat-type labels (S1a): `flattype_fixture.mjs` turns the three 7c files into `compare-phase7d.txt`, `-fv.txt`, `-nobto.txt` —
HDB codes shown through `app/core/flattype.js` ("4 ROOM" → "4-room", "37 TO 39" → "storey 37–39", Storey row "37–39");
labels only. The 7c files are historical since. Reviewed diff: `hdb-data-pipeline/docs/specs/flattype-labels-diff.md`.
