---
id: renting-singles-prs
title: Renting, singles & PRs
summary: What a single or a Permanent Resident can rent and buy, how to check a rent, and when buying becomes possible.
use_case: renting
order: 5
est_minutes: 6
---
Many singles and Permanent Residents rent first. This guide sets out the rules that decide what your household can rent or buy, and where the app helps you check a rent and compare renting with buying. It explains the rules; HDB's HFE letter has the final say.

## Who you are decides the paths
target: #hhChip
Start with **Your household**: each person's age and residency (now **{live:household.buyers}** buyer(s)).

- **Singles** who are Singapore Citizens can buy a resale flat from age {policy:eligibility.single.min_age}, and a new flat from HDB only as a two-room Flexi.
- **Permanent Residents** cannot buy a new flat from HDB. A PR household can buy a resale flat once every PR has held PR long enough; a single PR cannot buy an HDB flat at all.
- **Foreigners** cannot buy HDB flats, but can rent a room or a whole flat, or buy a private home.

## Is this rent fair?
tab: rent
target: #rentFair
fallback: [#tabbtn-rent]
For a **whole flat**, pick the town (and the block, if you know it) inside the card, then type the asking rent. The app compares it with HDB's rental approvals for that block, or the whole town when the block has too few, and says which months it used.

Your rent is saved in this browser. Rent or buy, and Plan's "Your rent now", use the same figure — you type it once.

## Renting a room
tab: rent
target: #rtType
fallback: [#rentFair, #tabbtn-rent]
Choose **Room** and type the rent you pay or are offered. There is no public data on room rents, so the app never estimates a room rent and never says whether it is fair — it is **your figure**, and it is labelled that way wherever it is used.

You can still see the rent as a share of your income, and use it in Rent or buy.

## Renting as a PR or a foreigner
tab: rent
target: #rentPathways
fallback: [#tabbtn-rent]
Renting a **whole HDB flat** as a non-Malaysian non-citizen depends on the landlord's block: it must be under the **Non-Citizen Quota**. Ask the landlord to check the block with HDB before you pay a deposit. Renting a room is not limited by the quota.

A private home can be rented by anyone, for at least {policy:rental.private.min_months} consecutive months. "What your household can do" lists the renting rules that apply to you.

## Rent or buy?
tab: rent
target: #rentBuy
fallback: [#tabbtn-rent]
Rent or buy compares your net worth both ways over several years — but only for a flat your household can buy now. If you can't, it says why and lists the paths you can take instead: keep renting at your rent, a resale flat later (for example once a single reaches the singles age), a resale EC, or a private home with its stamp duty.

Paths that cost more than your **Most you can pay** are folded under "Over your budget", with how far over they are.

## When buying becomes possible
tab: afford
target: #affordVerdict
fallback: [#afPrice]
When a path opens, test a price in Afford: **Most you can pay** is now **{live:afford.max_price}**. A household without a Singapore Citizen borrows from a bank, not HDB, so Afford shows a bank loan and says why. Permanent Residents also pay Additional Buyer's Stamp Duty, which Afford counts in the cash you need.

## Quiz
### Can a single Permanent Resident buy an HDB resale flat?
- [ ] Yes, from the singles age
- [x] No — the singles scheme is for Singapore Citizens
- [ ] Yes, but only with a bank loan
explain: Only Singapore Citizen singles can buy HDB flats, from age {policy:eligibility.single.min_age}. A single PR can rent, or buy a resale EC or a private home.
term: single

### How does the app treat a room rent that you type?
- [ ] It compares it with the median rent of whole flats nearby
- [x] As your own figure — it is never estimated or judged fair
- [ ] It estimates it from other rooms in the block
explain: There is no public data on room rents, so the app uses your figure as it is and labels it "your figure" wherever it appears.

### What does the Non-Citizen Quota limit?
- [x] How many flats in a block and neighbourhood can be rented out whole to non-Malaysian non-citizens
- [ ] How many rooms one tenant may rent
- [ ] How much rent a landlord may charge
explain: The quota is about the landlord's block. Once the block reaches it, the whole flat cannot be rented to another such tenant; renting a room is not limited by it.
term: ncq

### Why does a household of Permanent Residents borrow from a bank?
- [ ] Bank loans are always cheaper
- [x] An HDB loan needs at least one Singapore Citizen buyer
- [ ] HDB loans are only for new flats
explain: HDB lends only to households with at least one Singapore Citizen buyer, so Afford shows a bank loan for a PR-only household and says why.
term: hdb-loan
