---
id: retirement-housing
title: Retirement & housing
summary: What changes in your CPF later in life, how your home can support retirement, and the options for older owners — Lease Buyback, Silver Housing Bonus, two-room Flexi.
use_case: retire
order: 4
est_minutes: 8
---
Later in life your home and your CPF become one plan: the flat is where you live, and often your largest asset. This guide explains the CPF milestones, the housing options for older owners, and where the app shows them. The app's figures are estimates; CPF and HDB give the actual numbers.

## Your CPF balances
target: #hhChip
Enter each buyer's age, income and CPF balances in **Household** (Pro also shows the Special Account, MediSave and the Retirement Account). The youngest buyer in the app now is **{live:household.youngest_age}**, with combined CPF Ordinary Account savings of **{live:household.cpf_oa}**.

Want to see it filled in first? Open **Learn** → **Try a sample household** → **Retiree couple**: two owners of a larger flat weighing right-sizing against the Lease Buyback Scheme. Your own data is kept safe and comes back when you choose **Exit sample**.

## What happens at the Retirement Account age
tab: plan
target: #planCpf
fallback: [#tabbtn-plan]
At age {policy:cpf.age.ra_formation}, CPF creates your **Retirement Account (RA)** from your Special Account and then your Ordinary Account, up to the **Full Retirement Sum (FRS)**. There are three levels:

- the **Basic Retirement Sum (BRS)**;
- the **Full Retirement Sum (FRS)**, above the BRS;
- the **Enhanced Retirement Sum (ERS)**, {policy:cpf.retirement_sums.ers_multiple} times the FRS — the most you can put in.

The sums depend on the year you turn {policy:cpf.age.ra_formation} and stay fixed from then. The BRS and FRS by the year you turn {policy:cpf.age.ra_formation}:

{policy:cpf.retirement_sums}

In **Plan → CPF & retirement**, each buyer's card shows the RA at that age with a tick for each sum met — with and without the flat you picked, because CPF used for a home is not there to form the RA.

## CPF LIFE is an estimate
tab: plan
target: #planCpf
fallback: [#tabbtn-plan]
CPF LIFE turns your RA into a monthly payout for life, from age {policy:cpf.age.life_payout}. A larger RA means a larger payout.

The card's CPF LIFE figure is **approximate**: the app scales CPF's published examples to your projected RA. CPF LIFE premiums, top-ups, the plan you choose and starting the payout later are not modelled. Use CPF's own planner before making a decision.

## Pledging your property
tab: plan
target: #planCpf
fallback: [#tabbtn-plan]
If you own a property with enough lease left — CPF sets the conditions — you can **pledge** it at the Retirement Account age. You then need to set aside only the BRS in your RA instead of the FRS, and you may be able to withdraw part of the savings above it.

The trade-off: less in your RA means **lower CPF LIFE payouts** for life. The app does not model a pledge; CPF's website explains when one is possible.

## Options at the seniors' age
tab: plan
target: #planSeniors
fallback: [#planCpf, #tabbtn-plan]
if_missing: This card shows in Simple mode once a buyer is old enough; otherwise switch to Pro to see it.
The **Options** card in Plan lists what older owners can do — stay and age in place, rent out a room, the Lease Buyback Scheme, right-sizing with the Silver Housing Bonus, a Community Care Apartment and a short-lease two-room Flexi flat — with whether you are eligible and any cash now.

It appears once a buyer is {policy:seniors.shb.min_age} or older (Community Care Apartments: from {policy:seniors.cca.min_age}). Enter the remaining lease of the flat you own; the card uses the flat type, sale price and loan from **Sell then buy**, and the flat you picked as the smaller next home.

## Lease Buyback Scheme
tab: plan
target: #planSeniors
fallback: [#planCpf, #tabbtn-plan]
if_missing: This card shows in Simple mode once a buyer is old enough; otherwise switch to Pro to see it.
With the **Lease Buyback Scheme (LBS)** you sell the tail end of your lease to HDB and keep living in your flat. Every owner must be at least {policy:seniors.lbs.min_age}, and household income within {policy:seniors.lbs.income_ceiling} a month.

- How many years you keep depends on the youngest owner's age — older owners may keep fewer years.
- The proceeds first top up each owner's RA. Owners below {policy:seniors.lbs.cpf_life_below_age} with at least {policy:seniors.lbs.cpf_life_min_ra} in the RA afterwards join CPF LIFE.
- After the top-ups you can keep up to {policy:seniors.lbs.cash_retention} in cash (combined); above that, the RA is topped up further before the rest is paid in cash.
- There is an LBS bonus, larger for smaller flats; the full bonus needs top-ups of at least {policy:seniors.lbs.bonus_full_topup}.

HDB works out the proceeds, so the app does not estimate them — use HDB's estimator.

## Right-sizing: Silver Housing Bonus and two-room Flexi
tab: plan
target: #planSeniors
fallback: [#planCpf, #tabbtn-plan]
if_missing: This card shows in Simple mode once a buyer is old enough; otherwise switch to Pro to see it.
**Silver Housing Bonus (SHB)**: when you sell and move to a smaller flat, at least one owner must be a Singapore Citizen aged {policy:seniors.shb.min_age} or above, with household income within {policy:seniors.shb.income_ceiling} a month. A net increase in your RA of up to {policy:seniors.shb.full_topup} (CPF refunds count) earns a bonus of up to {policy:seniors.shb.bonus_max}, plus {policy:seniors.shb.two_room_extra} for a two-room or smaller flat — at most {policy:seniors.shb.total_max} in all. Buy the next flat before the sale or within {policy:seniors.shb.purchase_window_months} months of completing it.

**Short-lease two-room Flexi**: every buyer and spouse at least {policy:seniors.flexi.min_age}, income within {policy:seniors.flexi.income_ceiling} a month. You choose a shorter lease, which must cover the youngest owner to at least age {policy:seniors.flexi.cover_to_age} — a shorter lease costs less.

## Weighing it up
tab: plan
target: #planDates
fallback: [#tabbtn-plan]
Some trade-offs to think through:

- **Cash now or income later**: money released from the flat into the RA becomes monthly CPF LIFE payouts rather than a lump sum.
- **Stay or move**: staying keeps your home and neighbours; a smaller flat costs less to run but means moving, renovating and a new neighbourhood.
- **Lease left**: the fewer years left, the harder a flat is to sell later, because buyers' CPF use and loans depend on the lease. **Key dates** shows the lease milestones of your flat.

Several Lease Buyback and Silver Housing Bonus values — such as the income ceilings, the lease you keep and the purchase window — are marked **corroborated**: they come from secondary sources because the official page could not be read. **Rules and recent changes** in Learn lists the status of each value; confirm with HDB and CPF.

## Quiz
### What happens to your CPF at the Retirement Account age?
- [x] A Retirement Account is formed from your Special and Ordinary Accounts, up to the FRS
- [ ] All your CPF savings are paid out to you as cash
- [ ] Your Ordinary Account is closed
explain: At {policy:cpf.age.ra_formation}, CPF forms the RA from the Special Account first, then the Ordinary Account, up to the Full Retirement Sum. The Enhanced Retirement Sum is {policy:cpf.retirement_sums.ers_multiple} times the FRS.

### How exact is the CPF LIFE figure in Plan?
- [ ] It is CPF's official quote
- [x] An estimate scaled from CPF's published examples — use CPF's planner for decisions
- [ ] Exact to the dollar for the Standard Plan
explain: The app scales CPF's published examples to your projected RA. Premiums, top-ups, the plan you choose and a later start are not modelled. Payouts start from age {policy:cpf.age.life_payout}.

### What is the main trade-off of pledging your property at the Retirement Account age?
- [x] You keep less in your RA, so your CPF LIFE payouts are lower
- [ ] You can no longer live in the flat
- [ ] You must sell the flat when the payouts start
explain: A pledge lets you set aside the BRS instead of the FRS and possibly withdraw part of the rest — but a smaller RA means smaller monthly payouts for life.
term: cpf-housing

### What does the Lease Buyback Scheme let you do?
- [ ] Sell your flat to HDB and move out
- [x] Sell part of your remaining lease to HDB and keep living in the flat
- [ ] Borrow against your flat from a bank
explain: With the LBS you keep a shorter lease and stay in your flat. The proceeds first top up your RA for CPF LIFE payouts, and part can be paid in cash. Every owner must be at least {policy:seniors.lbs.min_age}.
term: remaining-lease

### What earns the Silver Housing Bonus?
- [ ] Buying a bigger flat after retirement
- [x] Moving to a smaller flat and putting part of the proceeds into your RA
- [ ] Renting out a room in your flat
explain: The SHB rewards right-sizing: a net RA increase of up to {policy:seniors.shb.full_topup} earns up to {policy:seniors.shb.bonus_max}, with {policy:seniors.shb.two_room_extra} more for a two-room or smaller flat.
