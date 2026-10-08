// Default heuristics for the future-value scorecard (engine/futurevalue.js). These are modelling
// choices, NOT Singapore rules, so they live here (owned by the UI) and not in policy/sg-policy.json.
// Rule values the scorecard needs (99-year lease, 5-year MOP) come from the policy file instead.
//
// Band arrays are 4 ascending cut-offs -> sub-score 1..5:
//   higher-is-better: score = 1 + (number of cut-offs <= value)
//   lower-is-better:  score = 1 + (number of cut-offs >= value)
// A sub-score is a coarse, relative signal for comparing flats — not a forecast.

export const FUTURE_VALUE_PARAMS = Object.freeze({
  // shared transaction windows (months, ending at asOf)
  windowMonths: 12,          // "recent" prices (momentum, yield, town medians)
  longWindowMonths: 24,      // thinner block-level stats (relative value, liquidity, size)
  minN: 5,                   // fewer sales than this -> "not enough sales" (null score)

  lease: {
    horizonYears: 10,        // look-ahead for "lease left in N years"
    bands: [50, 60, 70, 80], // years left at the horizon (higher is better)
    dragBandYears: 10,       // remaining-lease band width for the empirical lease-drag curve
    dragWindowMonths: 36,    // sales used for the drag curve (town x flat type)
  },
  momentum: {
    years: [1, 3, 5],        // horizons shown
    scoreYears: 3,           // horizon that is scored
    bands: [-10, -3, 3, 10], // town change minus RPI change, percentage points (higher is better)
  },
  value: {
    leaseBandYears: 10,      // peers: same town + flat type, lease start within +/- half of this
    bands: [-10, -3, 3, 10], // % gap vs peers' median $/m2 (lower = cheaper = higher score)
  },
  catalysts: {
    mrtKm: 0.8,              // future MRT station within this distance
    recentYears: 2,          // projects / stations opened up to this many years ago still count (maturing)
    projectKm: 1.5,          // reach of a curated project without its own `km`
    points: { mrt: 2, project: 2 },
    // MP2025 zones within 800 m (from market.js): points per zone, capped per category.
    // Zoning includes existing buildings, so weights stay small; future-leaning zones weigh more.
    landuse: {
      cap: 2,
      weights: {
        'COMMERCIAL': 0.25, 'WHITE': 1, 'BUSINESS PARK': 1, 'CIVIC & COMMUNITY INSTITUTION': 0.25,
        'HEALTH & MEDICAL CARE': 0.5, 'SPORTS & RECREATION': 0.25, 'RESERVE SITE': 0.5,
      },
    },
    bands: [1, 2, 4, 6],     // total points (higher is better)
  },
  supply: {
    radiusKm: 1,             // BTO projects and MOP-wave blocks within this distance
    mopWindowYears: 2,       // blocks whose MOP ends within the next N years
    bands: [300, 1000, 2000, 4000], // new + MOP-wave units nearby (lower is better)
    capWhenPartial: 4,       // btoData switch off (DEC-015): MOP wave only → never the top score, cell marked "(partial)"
  },
  yield: {
    bands: [-15, -5, 5, 15], // gross yield relative to the town's, % (higher is better)
  },
  liquidity: {
    turnoverBands: [1, 2, 3, 5],   // sales per year / dwelling units, % (higher is better)
    salesBands: [2, 5, 10, 20],    // sales per year when the unit count is unknown
  },
  scarcity: {
    shareBands: [5, 10, 20, 35],   // flat type's share of the town's sold units, % (lower is better)
    bigPct: 10,                    // flat at least this % above the town median size -> +1
    rareModels: ['MAISONETTE', 'DBSS', 'TERRACE', 'LOFT', 'ADJOINED', 'TYPE S', 'MULTI GENERATION'], // +1 (substring match)
  },
  // At-a-glance flags (comparer-future-value.md AC 4: strong signals only). The lease (< 60 y in 10 y) and
  // future-MRT (<= 800 m) signals were already At-a-glance lines before the scorecard, so only the MOP wave is new;
  // a gross-yield flag (>= 4.5 %) is left out: every seed flat is above it (6-9 % in 2026), so it is not a strong signal.
  badges: {
    mopUnits: 1000,                // units in blocks within supply.radiusKm whose MOP ends within supply.mopWindowYears
  },
});
