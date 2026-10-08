---
id: buying-resale
title: Buying your first resale flat
summary: From who is buying to the keys — check a price against your household, the cash you need and the grants you may get.
use_case: firstResale
order: 1
est_minutes: 7
---
This guide walks through the steps of a typical first resale purchase and points at the parts of the app that help with each one. The numbers in blue come from your own household; numbers in bold are dated rules from the app's rules file.

## Who is buying
target: #hhChip
Everything in this guide uses the household you enter in **Household**. It stays in this browser — nothing is sent anywhere.

Right now the app has **{live:household.buyers}** buyer(s), with a combined gross income of **{live:household.income}** a month.

- An HDB loan and the CPF Housing Grant need household income within {policy:eligibility.income_ceiling.family} a month (families).
- At least one buyer must be a Singapore Citizen for an HDB loan; otherwise the app shows a bank loan.

## Get your HFE letter first
target: #hhChip
The **HDB Flat Eligibility (HFE) letter** confirms in one application whether you can buy, which grants you qualify for and how much HDB would lend. If you plan to take an HDB loan, you need a valid letter before the seller can grant you the Option to Purchase.

You have chosen: **{live:household.loan_type}**. For an HDB loan:

- it covers up to {policy:loan.hdb.ltv} of the lower of the price and the valuation;
- the tenure is at most {policy:tenure.hdb.max} years (shorter if you are older or the lease is short);
- the rate is currently {policy:rate.hdb.concessionary} a year, reviewed every quarter.

## Look at what similar flats sold for
tab: explore
target: #mSearch
fallback: [#colorBy]
Search a block, street or MRT station, then tap a block to see its recent sales. In **My choices**, the compare table shows whether an asking price sits below, within or above the usual range of comparable sales.

HDB's valuation comes only after the Option to Purchase. If you pay more than the valuation, the difference — **cash over valuation (COV)** — is paid in cash and no loan or CPF covers it.

## Test a price in Afford
tab: afford
target: #afPrice
fallback: [#affordFlat, #tabbtn-afford]
Type a price, or tap **Afford this →** on a block. The app is now testing **{live:afford.flat}** at **{live:afford.price}**.

- Monthly instalment: **{live:afford.instalment}** over **{live:afford.tenure}** years.
- Lenders check the **Mortgage Servicing Ratio**: the instalment worked out at a floor rate ({policy:rate.floor.hdb} for an HDB loan, {policy:rate.floor.bank} for a bank loan) may be at most {policy:ratio.msr.cap} of gross income. Yours at the test rate: **{live:afford.msr}**.

## The most you can pay
tab: afford
target: #affordVerdict
fallback: [#afPrice]
The verdict card shows the **most you can pay**: **{live:afford.max_price}** for your household, with a loan of about **{live:afford.loan}** at the price you are testing.

It is limited either by income (the MSR cap sets the largest loan) or by your cash and CPF (the downpayment and fees). The line under the number tells you which one binds — that is the one to work on.

## Upfront: cash and CPF
tab: afford
target: #affordUpfront
fallback: [#affordVerdict]
Before you get the keys you pay the downpayment (**{live:afford.downpayment}**), Buyer's Stamp Duty (**{live:afford.bsd}**) and legal fees. After grants that is **{live:afford.upfront}**, of which **{live:afford.cash_needed}** must be cash.

- The option fee and exercise fee together are at most {policy:fees.option_exercise.max} and must be paid in cash, as must any COV.
- With a bank loan, at least {policy:downpayment.bank.cash_min} of the price must be paid in cash.
- Your cash: **{live:household.cash}**; CPF Ordinary Account: **{live:household.cpf_oa}**.

## Grants
tab: afford
target: #affordVerdict
fallback: [#afPrice]
First-timer households may get the **Enhanced CPF Housing Grant** (based on income), the **CPF Housing Grant** for resale flats (income within {policy:eligibility.income_ceiling.family} a month) and the **Proximity Housing Grant** when living with or near parents. Grants go into CPF and count towards the price.

For your household the app estimates **{live:afford.grants}**. The full Enhanced grant needs the lease to cover the youngest buyer to age {policy:cpf.lease.cover_to_age}; your HFE letter gives the actual amounts.

## Lease, timeline and what comes after
tab: afford
target: #afLease
fallback: [#afPrice]
Enter the remaining lease. CPF can be used in full only if the lease covers the youngest buyer to age {policy:cpf.lease.cover_to_age}; below that it is pro-rated, and at least {policy:cpf.lease.min_years} years must be left.

The usual order: HFE letter → Option to Purchase → exercise it within {policy:sellbuy.otp.exercise_days} days → resale application → completion within about {policy:sellbuy.resale.completion_days} days of HDB's acceptance. After that you must live in the flat for the **Minimum Occupation Period** before you can sell it or rent out the whole flat.

## Quiz
### When do you need a valid HFE letter if you take an HDB loan?
- [ ] After the flat's valuation comes in
- [x] Before the seller grants you the Option to Purchase
- [ ] Only at completion
explain: For an HDB loan, a valid HFE letter is needed before the Option to Purchase is granted — so apply before you start house-hunting.
term: hfe

### The instalment must pass the MSR test. Which rate is it worked out at?
- [ ] The rate you will actually pay
- [x] The higher of the actual rate and a floor rate
- [ ] Always the bank's board rate
explain: Lenders test the instalment at the higher of the actual rate and a floor rate ({policy:rate.floor.hdb} for an HDB loan, {policy:rate.floor.bank} for a bank loan), and it may be at most {policy:ratio.msr.cap} of gross income.
term: msr

### Which of these must be paid in cash, not CPF?
- [x] Cash over valuation (COV)
- [ ] Buyer's Stamp Duty
- [ ] The whole downpayment with an HDB loan
explain: COV, the option fee and the exercise fee are cash only. Stamp duty and, with an HDB loan, the downpayment can come from your CPF Ordinary Account.
term: cov

### When can CPF savings be used in full for a resale flat?
- [ ] Whenever the flat is an HDB flat
- [ ] Only if the flat is less than ten years old
- [x] When the remaining lease covers the youngest buyer to age {policy:cpf.lease.cover_to_age}
explain: Full CPF use needs the lease to cover the youngest buyer to {policy:cpf.lease.cover_to_age}; otherwise the amount is pro-rated, and at least {policy:cpf.lease.min_years} years of lease must be left.
term: lease-to-95
