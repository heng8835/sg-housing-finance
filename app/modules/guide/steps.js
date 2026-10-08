// Guided tour content (spec phase5-feedback-design.md §6.4) — plain data, no imports, so node tests can read it.
// English strings are the t() keys (中文 in i18n/zh-guide.json).
//
// Use case: { id, title, blurb, steps: [step] }
// Step: { target, tab?, fallback?, ifMissing?, when?, title, body }
//   target    CSS selector of the element to spotlight
//   tab       switch to this side-panel tab first (bus 'nav:goto')
//   fallback  selector, or list of selectors tried in order, when the target is missing or hidden
//   ifMissing extra sentence shown when the target itself is missing (e.g. Pro-only parts in Simple mode)
//   bodyIfMissing  replaces the body when the target itself is missing (a switched-off feature, 7b B5)
//   when      'desktop' = only on wide screens (skipped where the element does not exist)

export const USE_CASES = [
  {
    id: 'firstResale',
    title: "I'm buying my first resale flat",
    blurb: 'Check a price against your budget and compare listings.',
    steps: [
      { target: '#hhChip', title: 'Your household',
        body: 'Start here: who is buying — ages, incomes, CPF and cash. It stays in this browser.' },
      { target: '#colorBy', tab: 'explore', title: 'Colour the map',
        body: 'Colour the map by price, or by “Within my budget” once Afford has your budget.' },
      { target: '#mSearch', title: 'Find a block',
        body: 'Search a block, street or MRT. Click a block for recent sales, then “Afford this →”.' },
      { target: '#afPrice', tab: 'afford', title: 'Afford',
        body: 'Afford checks a price against your household: instalment, cash vs CPF, grants.' },
      { target: '#affordVerdict', tab: 'afford', fallback: ['#afPrice'], title: 'Can you afford it?',
        body: 'The verdict and “Most you can pay” — then show flats within budget on the map.' },
      { target: '#cAddr', tab: 'choices', title: 'Save listings',
        body: 'Found a listing? Add it here to compare flats side by side.' },
      { target: '#learnBtn', fallback: ['#phoneMenu'], title: 'Learn the terms', // phones: Learn is in the Menu
        body: 'Unsure what MSR, COV or MOP mean? Open Learn, or tap the ⓘ next to a term.',
        bodyIfMissing: 'Unsure what MSR, COV or MOP mean? Open Learn from the Menu, or tap the ⓘ next to a term.' },
    ],
  },
  {
    // 7b B5: goal "Choose between BTO and resale". btoData off (public build): the project picker is a switched-off
    // target (core/features.js FEATURE_TARGETS) → the card itself, with bodyIfMissing instead of the body
    id: 'btoVsResale',
    title: 'Choosing between BTO and resale',
    blurb: 'Flat types you can apply for, the wait, rent meanwhile and the cash by the key date.',
    steps: [
      { target: '#hhChip', title: 'Who is applying',
        body: 'Ages and citizenship decide which BTO flat types you can apply for.' },
      { target: '[data-p="plan.btoId"]', tab: 'plan', fallback: ['#planBto', '#tabbtn-plan'], title: 'BTO or resale?',
        body: "Pick a BTO project near where you'd like to live.",
        bodyIfMissing: "Type the BTO price from HDB's sales brochure — project details aren't in this version." },
      { target: '[data-p="plan.btoFt"]', tab: 'plan', fallback: ['#planBto', '#tabbtn-plan'], title: 'Flat types you can apply for',
        body: "Types you can't apply for are greyed, with the reason." },
      { target: '[data-p="plan.btoWait"]', tab: 'plan', fallback: ['#planBto', '#tabbtn-plan'], title: 'How long will you wait?',
        body: "No comparison until you set the wait. For a future launch it's your guess." },
      { target: '[data-p="plan.rentNow"]', tab: 'plan', fallback: ['#planBto', '#tabbtn-plan'], title: 'Your rent while you wait',
        body: 'Rent while waiting is part of what BTO costs.' },
      { target: '#planBto .kpis', tab: 'plan', fallback: ['#planBto', '#tabbtn-plan'], ifMissing: 'Pick a flat on the map first.', title: 'The comparison',
        body: 'Cash you pay by the key date: BTO vs a resale flat nearby.' },
      { target: '#learnBtn', fallback: ['#phoneMenu'], title: 'Read the guide',
        body: 'The BTO or resale guide explains the wait, grants and payments.',
        bodyIfMissing: 'The BTO or resale guide explains the wait, grants and payments. Open it from Menu → Learn.' },
    ],
  },
  {
    id: 'sellBuy',
    title: 'Selling and buying again',
    blurb: 'Sell your current home and fund the next one.',
    steps: [
      { target: '#hhChip', title: 'Second-timers',
        body: 'Set “First-time buyers?” to second-timers if you bought an HDB flat before — grants and loans differ.' },
      { target: '#planSellBuy', tab: 'plan', fallback: ['#tabbtn-plan'], title: 'Sell then buy',
        body: 'Tick “I own a home now and will sell it”.' },
      { target: '[data-p="plan.current.salePrice"]', tab: 'plan', fallback: ['#planSellBuy', '#tabbtn-plan'], title: 'Your sale',
        body: 'Enter the sale price, loan left and CPF used (from your CPF housing withdrawal statement).' },
      { target: '#mSearch', title: 'Your next flat',
        body: 'Pick the next flat on the map → “Afford this →”. Plan then shows the gap and the order of steps.' },
      { target: '#planDates', tab: 'plan', fallback: ['#tabbtn-plan'], title: 'Key dates',
        body: 'Key dates: MOP end and selling deadlines. Download them to your calendar.' },
    ],
  },
  {
    id: 'renting',
    title: 'Renting a home', // not 'Renting' — that key already means renting OUT (出租方式) in zh.json
    blurb: 'Check a rent and see whether buying would be better.',
    steps: [
      { target: '#tabbtn-rent', title: 'Rent & Buy',
        body: 'Rent & Buy: is a rent fair, and rent or buy.' },
      { target: '#mSearch', title: 'Find the block',
        body: 'Find the block, click it and choose “Rent check →”.' },
      { target: '#rtAsk', tab: 'rent', fallback: ['#rentFair', '#tabbtn-rent'], title: 'Is this rent fair?',
        body: 'Enter the asking rent: we compare it with HDB rental approvals for the block or town.' },
      { target: '#rtType', tab: 'rent', fallback: ['#rentFair', '#tabbtn-rent'], title: 'Whole flat or room',
        body: 'Renting a room? Type your own rent. There is no public data on room rents, so it is never judged.' },
      { target: '#rentBuy', tab: 'rent', fallback: ['#tabbtn-rent'], title: 'Rent or buy?',
        body: 'Rent or buy? compares your net worth both ways over 5, 10 or 20 years.' },
      { target: '#rentPathways', tab: 'rent', fallback: ['#tabbtn-rent'], title: 'The rules',
        body: 'The rules — what your household may buy, borrow or rent — are folded here.' },
    ],
  },
  {
    id: 'retire',
    title: 'Planning for retirement / 55+',
    blurb: 'See your CPF at 55 and options for older owners.',
    steps: [
      { target: '#hhChip', title: 'Your CPF balances',
        body: "Add each buyer's age, income and CPF balances (Pro shows SA, MediSave and RA)." },
      { target: '#planCpf', tab: 'plan', fallback: ['#tabbtn-plan'], title: 'CPF at 55',
        body: 'Retirement Account at 55 and the CPF LIFE estimate, with and without the flat you picked.' },
      { target: '#planSeniors', tab: 'plan', ifMissing: 'Switch to Pro to see all options.', title: 'Options at 55+',
        body: 'Options at 55+: Lease Buyback, Silver Housing Bonus, 2-room Flexi, renting out a room.' },
      { target: '.mode-switch', fallback: ['#phoneMenu'], title: 'Simple or Pro', // phones: the switch is in the Menu
        body: 'Pro shows the year-by-year table and pay-rise / bonus settings.',
        bodyIfMissing: 'Pro shows the year-by-year table and pay-rise / bonus settings. Switch to Pro in the Menu.' },
      { target: '#planDates', tab: 'plan', fallback: ['#tabbtn-plan'], title: 'Lease milestones',
        body: "Key dates include your flat's lease milestones." },
    ],
  },
  {
    id: 'shortlist',
    title: 'Comparing my shortlist',
    blurb: 'Add listings and compare them side by side.',
    steps: [
      { target: '#cAddr', tab: 'choices', title: 'Add a listing',
        body: 'Paste the block and street from a listing, or click a block → “Add a flat from this block…”.' },
      { target: '#cPrice', tab: 'choices', title: 'Price and size',
        body: 'Add asking price and size; the comparison checks them against recent sales nearby.' },
      { target: '#workForm', tab: 'choices', title: 'Daily places',
        body: 'Add daily places (office, childcare, parents); every flat gets distances to them.' },
      { target: '#choiceList', tab: 'choices', fallback: ['#tab-choices .section:has(#choiceList)', '#shareChoices'], title: 'Your shortlist',
        body: 'Your shortlist. Use Afford on a flat to test it against your budget.' },
      { target: '#drawerBar', tab: 'choices', fallback: ['#choicesView'], title: 'Compare', // phones: no drawer, List | Compare
        body: 'Open Compare for the side-by-side table. Copy table pastes into Excel; Print saves a PDF.',
        bodyIfMissing: 'Tap Compare to see your flats side by side, one card per flat.' },
      { target: '#shareChoices', tab: 'choices', title: 'Share safely',
        body: 'Share link sends the flats only — never names, income or CPF.' },
    ],
  },
  {
    id: 'map',
    title: 'Using the map',
    blurb: 'Search, colour and read the map.',
    steps: [
      { target: '#mSearch', title: 'Search',
        body: 'Search a block, street, town, MRT station or school.' },
      { target: '#colorBy', tab: 'explore', title: 'What the colours mean',
        body: 'Choose what the colours mean; the legend below shows the scale.' },
      { target: '#ftChips', tab: 'explore', title: 'Flat types',
        body: 'Pick flat types; colours and stats use only those.' },
      { target: '#areaBox', title: 'Prices in view',
        body: 'Prices in view update as you move. Use circle or draw for one area.' },
      { target: '#secLayers', tab: 'explore', fallback: ['.mode-switch', '#phoneMenu'], ifMissing: 'Switch to Pro for map layers — schools, MRT, parks.', title: 'Map layers',
        body: 'Turn map layers on and off.' },
      { target: '#panelResizer', when: 'desktop', title: 'Panel width',
        body: 'Drag this edge to widen the panel; double-click to reset. Press \\ to hide it.' },
    ],
  },
];

/** Steps that apply on this screen (`desktop` = wide layout where the side panel can be resized). */
export const stepsFor = (useCase, desktop) => useCase.steps.filter((s) => s.when !== 'desktop' || desktop);

/** Every English string in the tour content (for the zh coverage test). */
export const contentStrings = () => USE_CASES.flatMap((u) => [u.title, u.blurb,
  ...u.steps.flatMap((s) => [s.title, s.body, s.ifMissing, s.bodyIfMissing].filter(Boolean))]);
