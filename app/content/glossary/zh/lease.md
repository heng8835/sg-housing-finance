---
id: lease
term: 99年屋契
short: 组屋以租赁地契出售——屋契为期 {policy:lease.term.years} 年，从屋契生效日期起算——届满后组屋归还建屋发展局。
formula: "剩余屋契 = 屋契年限 − 屋契生效至今的年数"
policy_keys: [lease.term.years]
related: [remaining-lease, lease-decay, lease-to-95, mop]
level: basic
source: https://www.hdb.gov.sg/
---
购买组屋，买的是在 {policy:lease.term.years} 年屋契的剩余期间内居住的权利，而不是完全拥有土地。屋契从该座组屋的屋契生效日期起算，而不是从现任屋主购买的日期起算。

转售买家承接的是剩下的屋契。屋契届满时，组屋归还建屋发展局，屋主不会因此获得任何补偿。这就是为什么屋契长短会影响组屋的价值、融资和公积金规定。

示例：例如一间屋契在 `40` 年前生效的组屋，剩余屋契为 {policy:lease.term.years} 减去 `40` 年。

提示：屋契生效日期会随建屋局的转售成交数据一起公布；它与组屋上一次出售的年份不同。
