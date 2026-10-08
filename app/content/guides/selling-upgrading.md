---
id: selling-upgrading
title: Selling and upgrading
summary: Sell your flat and fund the next one — where the sale money goes, the CPF refund with accrued interest, and the order of steps.
use_case: sellBuy
order: 3
est_minutes: 8
---
Selling your flat and buying the next one means two transactions that depend on each other. This guide explains where the sale money goes, why part of it returns to CPF rather than to you, and the orders in which you can do things. It explains the rules and trade-offs; it does not recommend a choice.

## Second-timers
target: #hhChip
If you have bought an HDB flat before, you are a **second-timer**: set "First-time buyers?" in **Household**, because grants and loans differ. Second-timers do not get the CPF Housing Grant for a resale flat; the Proximity Housing Grant is open to second-timers too, once per household.

Right now the app has **{live:household.buyers}** buyer(s) and you have chosen a **{live:household.loan_type}**.

Want to see this guide's steps filled in first? Open **Learn** → **Try a sample household** → **Upgrading family**. Your own data is kept safe and comes back when you choose **Exit sample**.

## Where the sale money goes
tab: plan
target: #planSellBuy
fallback: [#tabbtn-plan]
In **Plan → Sell then buy**, tick "I own a home now and will sell it", then enter the expected sale price, the loan left, and the CPF used for the flat with its accrued interest — both are on your CPF housing withdrawal statement.

The sale price is used in this order:

- the outstanding loan is repaid first;
- then the CPF refund — the principal you used plus accrued interest — goes back to your CPF;
- then the costs: agent commission (negotiable; the app assumes {policy:sellbuy.assumption.agent_fee_rate} of the price), legal fees and, if it applies, a resale levy;
- what is left comes to you as cash.

## The CPF refund and accrued interest
tab: plan
target: #planSellBuy
fallback: [#tabbtn-plan]
CPF used for a flat stops earning interest in your Ordinary Account. CPF keeps count of what it would have earned — at {policy:cpf.housing.accrued_rate} a year, compounded — as **accrued interest**. On sale, the principal and the accrued interest go back to CPF: to your Ordinary Account if you are below {policy:sellbuy.cpf.ra_first_age}; from that age your Retirement Account is topped up first.

It is still your savings, and it can pay for the next flat — but it is CPF money, not cash. If an HDB flat is sold at market value and the proceeds fall short of the full refund, you do not top up the difference in cash.

Illustrative example only (the Upgrading family sample's inputs, not a quote): sale price `S$580,000`, loan left `S$120,000`, CPF used `S$150,000` and accrued interest `S$25,000`. The CPF refund is `S$175,000`, and the cash left is about `S$285,000` before agent commission and legal fees.

## Funding the next flat
tab: plan
target: #planSellBuy
fallback: [#tabbtn-plan]
Pick the next flat on the map and tap **Afford this →**. The card then shows the cash from the sale, the CPF back to your OA, what is **available for the next flat**, the **next loan**, and whether you are covered or short.

For a second HDB loan, HDB asks you to put the full CPF refund and part of the cash proceeds into the next flat first. You may keep the greater of {policy:sellbuy.hdb_loan.cash_retain_min} or {policy:sellbuy.hdb_loan.cash_retain_ratio} of the cash proceeds — so the next loan can be smaller than you expect.

## Sell first, buy first, or both at once
tab: plan
target: #planSellBuy
fallback: [#tabbtn-plan]
Choose the **Order** in the card to see the steps and the typical time each takes:

- **Sell and buy at the same time (contra)**: both completions are lined up, so the sale money funds the purchase and you move once.
- **Sell first, then buy**: you know exactly how much you have, but you need somewhere to stay. A temporary extension of stay lasts at most {policy:sellbuy.extension_of_stay.max_months} months after the sale completes, only if you have committed to buy a completed home, and only if your buyer agrees.
- **Buy first, then sell**: you secure the next home first. If you still own a flat or other home when you buy an HDB resale flat, you must dispose of it within {policy:sellbuy.dispose_existing.months} months of the purchase completing — and you may need cash to bridge the gap.

## Owning two homes for a while
tab: plan
target: #planSellBuy
fallback: [#tabbtn-plan]
If you buy the next home before the first is sold, you own two residential properties for a while, and **Additional Buyer's Stamp Duty (ABSD)** may apply at the second-property rate.

A married couple buying jointly, with at least one Singapore Citizen, can get that ABSD refunded if the first home is sold within {policy:sellbuy.absd_refund.sell_within_months} months of buying the second (completed) home, and the refund is claimed within {policy:sellbuy.absd_refund.claim_within_months} months after the sale. There are no extensions. When this applies, the card shows the ABSD and the deadline.

These two time limits are marked **corroborated** in the rules file — taken from secondary sources because the official page could not be read. Check them with IRAS before relying on them.

## Key dates in your calendar
tab: plan
target: #planDates
fallback: [#tabbtn-plan]
**Key dates** collects the dates that matter for a move: when the MOP of the flat you live in ends (you can sell on the open market only after it), the completion of the next purchase and the deadline to sell the old home, and — if you add children — the Primary One registration years.

**Download calendar (.ics)** saves them into your own calendar. The file is made in your browser and nothing is sent anywhere. The dates are approximate; check them with HDB, IRAS and MOE.

## Compare options with Scenarios
tab: afford
target: #affordScenarios
fallback: [#affordVerdict, #afPrice]
In **Afford**, save up to four **Scenarios** (A–D) and compare them side by side — for example two different next flats, a higher and a lower price, or an HDB loan against a bank loan. The best value in each row is marked.

For the flat Afford is testing now: the most you can pay is **{live:afford.max_price}**, with a monthly instalment of **{live:afford.instalment}**. Scenarios are kept in this browser only.

## Quiz
### You sell a flat that you paid for partly with CPF. Where does the CPF refund go?
- [ ] To you, as cash
- [x] Back to your CPF — the principal used plus accrued interest
- [ ] To HDB, to repay the subsidy
explain: After the loan is repaid, the CPF principal and the accrued interest go back to CPF — to the Ordinary Account below {policy:sellbuy.cpf.ra_first_age}; from that age the Retirement Account is topped up first. It is still your savings and can go into the next flat.
term: accrued-interest

### What is the accrued interest on CPF used for a flat?
- [ ] Interest the bank charges on your housing loan
- [x] The interest that CPF money would have earned in the Ordinary Account
- [ ] A penalty for selling before the MOP ends
explain: CPF counts the interest your housing withdrawals would have earned in the Ordinary Account, at {policy:cpf.housing.accrued_rate} a year, compounded. It is refunded to CPF with the principal when you sell.
term: accrued-interest

### You buy an HDB resale flat while you still own your old home. What deadline applies?
- [ ] None, as long as you pay ABSD
- [x] The old home must be disposed of within {policy:sellbuy.dispose_existing.months} months of the purchase completing
- [ ] The old home must be sold before you exercise the Option to Purchase
explain: HDB's resale conditions require any other flat or home you own to be disposed of within {policy:sellbuy.dispose_existing.months} months from the resale completion date. Key dates can put this deadline in your calendar.

### With a second HDB loan, how much of the cash from your sale may you keep?
- [ ] All of it — only the CPF refund goes into the next flat
- [x] The greater of {policy:sellbuy.hdb_loan.cash_retain_min} or {policy:sellbuy.hdb_loan.cash_retain_ratio} of the cash proceeds
- [ ] None of it
explain: HDB asks you to put the full CPF refund and the rest of the cash proceeds into the next flat first; you may keep the greater of the two amounts. That is why the next loan can come out smaller than you expect.
term: hdb-loan

### A married couple of Singapore Citizens buy the next home before selling the first. When can their ABSD be refunded?
- [ ] Never — ABSD is not refundable
- [x] If the first home is sold within {policy:sellbuy.absd_refund.sell_within_months} months and the refund is claimed in time
- [ ] Automatically, whenever the first home is eventually sold
explain: IRAS refunds the ABSD if the first home is sold within {policy:sellbuy.absd_refund.sell_within_months} months of buying the second (completed) home and the claim is made within {policy:sellbuy.absd_refund.claim_within_months} months after the sale. These limits are corroborated, not yet read on the official page — check with IRAS.
term: absd
