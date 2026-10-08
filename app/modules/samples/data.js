// Sample households for the sandbox (Phase 6a AC 2). Made-up people with plausible, round numbers — no personal
// data. Every value here is a typed INPUT (what a user would enter), never a Singapore rule value: rules still come
// from policy/sg-policy.json through the engines. Flats are real blocks (tools/market_cache.json "HDB Property
// Information"), found again in data.js by block + street at load time; `leaseStart` (the block's completion year)
// is only the fallback when data.js has no lease year for the block. Prices are illustrative asking prices.
// Guides can load one with bus.emit('samples:load', { id }) — ids in SAMPLE_IDS.

const buyer = (o) => ({ age: null, income: null, citizenship: 'SC', prYears3Plus: null, nationality: null, pass: null, wpSector: null, cpfOa: null, cpfSa: null, cpfMa: null, cpfRa: null, ...o });
const current = (o = {}) => ({ owns: false, propertyType: 'hdb', flatType: '4 ROOM', salePrice: null, outstandingLoan: null, cpfUsed: null, accruedInterest: null, yearsHeld: null, subsidised: null, mode: null, remainingLease: null, ...o });
const dates = (o = {}) => ({ keyCollection: null, flatClass: 'standard', nextCompletion: null, children: [], ...o });

export const SAMPLES = [
  {
    id: 'young-couple',
    name: 'Young couple, first flat',
    blurb: 'Two Singapore Citizens aged 29 and 31 earning about S$8,000 a month together, buying their first home: a 4-room resale flat within 4 km of their parents.',
    tryThis: 'Try: Afford for the grants (incl. the Proximity Housing Grant) and the loan; My choices to compare three 4-room flats.',
    household: {
      scheme: 'family',
      buyers: [buyer({ age: 29, income: 4500, cpfOa: 35000, cpfSa: 12000, cpfMa: 10000 }), buyer({ age: 31, income: 3500, cpfOa: 30000, cpfSa: 10000, cpfMa: 9000 })],
      cash: 40000, otherDebts: 0, firstTimer: true, propertiesOwned: 0, parents: 'near', loan: 'hdb', tenure: 25, grantsOverride: null, needsReview: false,
    },
    plan: { cpf: { wageGrowth: null, bonusMonths: null, prYear: {} }, current: current(), btoId: null, btoFt: null, btoPrice: null, dates: dates() },
    shortlist: [
      { blk: '411A', street: 'FERNVALE RD', flatType: '4 ROOM', storey: 10, sqm: 93, price: 600000, facing: 'N', name: 'Fernvale 4-room', leaseStart: 2011 },
      { blk: '614B', street: 'EDGEFIELD PLAINS', flatType: '4 ROOM', storey: 12, sqm: 93, price: 610000, facing: 'E', name: 'Edgefield 4-room', leaseStart: 2011 },
      { blk: '686B', street: 'WOODLANDS DR 73', flatType: '4 ROOM', storey: 8, sqm: 102, price: 500000, facing: 'S', name: 'Woodlands 4-room', leaseStart: 2001 },
    ],
    mapTypes: null, // null = the map's default flat types
  },
  {
    id: 'upgrading-family',
    name: 'Upgrading family',
    blurb: 'A Singapore Citizen (44) and a Permanent Resident (42) with two children. They own a 4-room flat, will sell it and buy a 5-room resale flat.',
    tryThis: 'Try: Plan for sell then buy and the key dates (incl. P1 registration); Afford for the 5-room budget.',
    household: {
      scheme: 'family',
      buyers: [
        buyer({ age: 44, income: 7000, cpfOa: 60000, cpfSa: 70000, cpfMa: 45000 }),
        buyer({ age: 42, income: 5500, citizenship: 'PR', prYears3Plus: true, nationality: 'other', cpfOa: 40000, cpfSa: 50000, cpfMa: 35000 }),
      ],
      cash: 60000, otherDebts: 0, firstTimer: false, propertiesOwned: 1, parents: 'none', loan: 'hdb', tenure: 20, grantsOverride: null, needsReview: false,
    },
    plan: {
      cpf: { wageGrowth: null, bonusMonths: null, prYear: { 1: 'PR3+' } },
      current: current({ owns: true, flatType: '4 ROOM', salePrice: 580000, outstandingLoan: 120000, cpfUsed: 150000, accruedInterest: 25000, yearsHeld: 12, subsidised: true }),
      btoId: null, btoFt: null, btoPrice: null,
      dates: dates({ keyCollection: '2014-03-01', children: ['2016-05-01', '2020-02-01'] }),
    },
    shortlist: [
      { blk: '304B', street: 'ANCHORVALE LINK', flatType: '5 ROOM', storey: 9, sqm: 110, price: 700000, facing: 'S', name: 'Anchorvale 5-room', leaseStart: 2000 },
      { blk: '630', street: 'SENJA RD', flatType: '5 ROOM', storey: 11, sqm: 112, price: 640000, facing: 'W', name: 'Senja 5-room', leaseStart: 2002 },
      { blk: '152', street: 'LOR 2 TOA PAYOH', flatType: '5 ROOM', storey: 15, sqm: 113, price: 950000, facing: 'N', name: 'Toa Payoh 5-room', leaseStart: 2005 },
    ],
    mapTypes: null,
  },
  {
    id: 'retiree-couple',
    name: 'Retiree couple',
    blurb: 'Singapore Citizens aged 64 and 62, one still working part-time. They own a 5-room flat and are weighing right-sizing to a 2-room Flexi flat against the Lease Buyback Scheme.',
    tryThis: 'Try: Plan for the options at 55+ and CPF in retirement; My choices to compare the smaller flats.',
    household: {
      scheme: 'family',
      buyers: [buyer({ age: 64, income: 0, cpfOa: 90000, cpfSa: 0, cpfMa: 60000, cpfRa: 210000 }), buyer({ age: 62, income: 2000, cpfOa: 70000, cpfSa: 0, cpfMa: 55000, cpfRa: 180000 })],
      cash: 120000, otherDebts: 0, firstTimer: false, propertiesOwned: 1, parents: 'none', loan: 'hdb', tenure: 10, grantsOverride: null, needsReview: false,
    },
    plan: {
      cpf: { wageGrowth: null, bonusMonths: null, prYear: {} },
      current: current({ owns: true, flatType: '5 ROOM', salePrice: 650000, outstandingLoan: 0, cpfUsed: 180000, accruedInterest: 95000, yearsHeld: 30, subsidised: true, remainingLease: 60 }),
      btoId: null, btoFt: null, btoPrice: null,
      dates: dates({ keyCollection: '1995-06-01' }),
    },
    shortlist: [
      { blk: '233A', street: 'SUMANG LANE', flatType: '2 ROOM', storey: 7, sqm: 47, price: 380000, facing: 'E', name: 'Sumang 2-room Flexi', leaseStart: 2017 },
      { blk: '450D', street: 'BT BATOK WEST AVE 6', flatType: '2 ROOM', storey: 10, sqm: 47, price: 350000, facing: 'N', name: 'Bukit Batok 2-room Flexi', leaseStart: 2017 },
      { blk: '650', street: 'ANG MO KIO ST 61', flatType: '3 ROOM', storey: 6, sqm: 68, price: 520000, facing: 'S', name: 'Ang Mo Kio 3-room', leaseStart: 2014 },
    ],
    mapTypes: ['2 ROOM', '3 ROOM', '4 ROOM', '5 ROOM'],
  },
];

export const SAMPLE_IDS = SAMPLES.map((s) => s.id);
export const sampleById = (id) => SAMPLES.find((s) => s.id === id) || null;
