---
id: bto-vs-resale
title: BTO vs resale
summary: Wait for a new flat or buy one now — compare the waiting time, rent meanwhile, grants, lease and price side by side.
use_case: firstResale
order: 2
est_minutes: 7
---
A new Build-To-Order (BTO) flat from HDB and a resale flat from its owner are two routes to the same goal. This guide sets out what each route costs you — in money and in time — and where the app helps you compare them. It explains the trade-offs; it does not pick a route for you.

## Two routes, two timelines
target: #hhChip
- **BTO**: you apply in an HDB sales exercise, wait for the ballot and the booking, then wait again while the flat is built. Key collection is usually some years away; each project's expected completion date tells you roughly when.
- **Resale**: you buy a finished flat. After the seller grants the Option to Purchase you have {policy:sellbuy.otp.exercise_days} days to exercise it, and completion is about {policy:sellbuy.resale.completion_days} days after HDB accepts the resale application.

Both routes start with an **HFE letter**, so start with your household: **{live:household.buyers}** buyer(s), with a combined gross income of **{live:household.income}** a month.

## Waiting time and rent meanwhile
tab: plan
target: [data-p="plan.btoId"]
fallback: [#planBto, #tabbtn-plan]
if_missing: BTO project data may not be part of this version of the app. Take the expected completion date and the price from HDB's sales brochure, and check rents in Rent & Buy.
The **BTO or resale?** card in Plan picks a BTO project near the flat you are looking at. Choose the flat type and type the price from HDB's sales brochure. The card then shows:

- **Wait for the keys** — the months from today to the expected completion;
- **Rent while waiting** — those months at the median rent nearby, if you would rent meanwhile;
- **BTO: price + rent**, next to what resale flats of that type sold for nearby recently.

It compares only the cash paid out by the key date: grants, loan interest and price changes are left out. If you can stay with family while you wait, the rent line may not apply to you.

## Is the rent fair?
tab: rent
target: #rentFair
fallback: [#tabbtn-rent]
If you would rent while waiting, the rent is a real cost of the BTO route, and it adds up month by month. In **Rent & Buy**, enter an asking rent to compare it with HDB's rental approvals for the block or town.

Further down, **Rent or buy?** compares your net worth both ways over several years. Its growth and return figures are assumptions you can change, not forecasts.

## The grants are not the same
tab: afford
target: #affordVerdict
fallback: [#afPrice]
- **Enhanced CPF Housing Grant (EHG)** — for first-timers on both routes, based on income. For a resale flat the full amount needs the lease to cover the youngest buyer to age {policy:cpf.lease.cover_to_age}.
- **CPF Housing Grant** — resale flats only, for household income within {policy:eligibility.income_ceiling.family} a month.
- **Proximity Housing Grant** — resale flats only, when you live with or near your parents or married child.

BTO prices are set by HDB with the subsidy built in, so the grant totals alone do not tell you which route costs less. Afford treats every price as a resale purchase: for the price it is testing (**{live:afford.price}**) it estimates **{live:afford.grants}** in grants. Your HFE letter gives the actual amounts.

## Price against resale nearby
tab: explore
target: #mSearch
fallback: [#colorBy]
Search the area around the BTO project and tap the blocks nearby to see what similar resale flats sold for. BTO launch prices are usually set below the resale prices around them, but the gap differs from project to project — and on the BTO route you pay for it with time.

Compare like with like: the same flat type, a similar floor area, and blocks within a short walk of the project. The Plan card does this for you with the median of recent sales of that flat type nearby.

## Lease and the Minimum Occupation Period
tab: plan
target: #planDates
fallback: [#tabbtn-plan]
- **Lease**: a BTO flat comes with a fresh lease, while a resale flat has fewer years left. The remaining lease decides how much CPF you can use (in full only if it covers the youngest buyer to age {policy:cpf.lease.cover_to_age}) and how long an HDB loan can run (at most the remaining lease minus {policy:tenure.hdb.lease_buffer} years).
- **MOP**: on both routes you must live in the flat for the Minimum Occupation Period, counted from key collection, before you can sell it or rent out the whole flat. New BTO flats are classed Standard, Plus or Prime; Plus and Prime flats have a longer MOP and tighter resale and rental conditions.

In **Key dates**, pick the flat class and enter the key collection date to see when the MOP would end.

## What to compare
tab: afford
target: #affordScenarios
fallback: [#affordVerdict, #afPrice]
Afford can keep up to four **Scenarios** (A–D). One way to use them: save the resale flat you are considering as one scenario, then type the BTO price for your flat type and save it as another. The table puts the loan, the monthly instalment (now **{live:afford.instalment}**) and the cash needed side by side — remember that the grant estimate assumes a resale flat.

A short checklist for the two routes:

- the price, and what you pay while waiting (rent, or nothing if you stay with family);
- the grants each route gets;
- the years of lease left, the MOP and any conditions that come with the flat class;
- the location — commute, schools, parents — and how firm the completion date is.

## Quiz
### In the BTO or resale? card, what does "Rent while waiting" add to the BTO route?
- [x] The months until the expected key date, times the median rent nearby
- [ ] The rent you could earn by renting out the new flat
- [ ] The loan interest you pay while the flat is being built
explain: The card multiplies the months to the expected completion by the median rent nearby. It counts cash only — grants, interest and price changes are left out — and if you can stay with family, the rent may not apply.

### Which grant can a first-timer household get for a resale flat but not for a BTO flat?
- [ ] The Enhanced CPF Housing Grant
- [x] The CPF Housing Grant
- [ ] None — the grants are the same on both routes
explain: The EHG is for first-timers on both routes. The CPF Housing Grant (household income within {policy:eligibility.income_ceiling.family} a month) and the Proximity Housing Grant are for resale flats; BTO prices already have the subsidy built in.
term: chg

### When does the Minimum Occupation Period start?
- [ ] When you book the BTO flat or sign the Option to Purchase
- [x] When you collect the keys, on either route
- [ ] When the loan is approved
explain: The MOP is counted from key collection for both BTO and resale flats. The years spent waiting for a BTO flat to be built do not count towards it.
term: mop

### Why does the remaining lease matter more for a resale flat than for a new BTO flat?
- [ ] It sets the flat's property tax
- [x] It limits how much CPF you can use and how long an HDB loan can run
- [ ] It decides whether you can get an HFE letter
explain: CPF can be used in full only if the lease covers the youngest buyer to age {policy:cpf.lease.cover_to_age}, and an HDB loan can run at most to the remaining lease minus {policy:tenure.hdb.lease_buffer} years. A new BTO flat starts with a fresh lease.
term: remaining-lease
