---
id: remaining-lease
term: 剩余屋契
short: 在某个日期组屋屋契还剩下的年数——这是影响价格、贷款额和可动用公积金数额的关键因素。
formula: "剩余屋契 = 屋契生效年份 + 屋契年限 − 当前年份"
policy_keys: [lease.term.years, cpf.lease.cover_to_age, cpf.lease.min_years, tenure.hdb.lease_buffer]
related: [lease, lease-decay, lease-to-95, tenure, cpf-housing, psf]
level: basic
source: https://www.cpf.gov.sg/service/article/how-much-cpf-savings-can-i-use-to-buy-a-property-if-its-lease-does-not-cover-the-youngest-buyer-to-age-95
---
剩余屋契从屋契生效日期起，由 {policy:lease.term.years} 年开始倒数。两间其他方面相似的组屋，剩余屋契可能相差几十年，这个差距会反映在价格、融资和日后转售的前景上。

多项规定都取决于剩余屋契。只有当剩余屋契足以覆盖最年轻的买方至 {policy:cpf.lease.cover_to_age} 岁时，才能全额动用公积金；剩余屋契少于 {policy:cpf.lease.min_years} 年则完全不能动用。建屋局贷款的期限不能超过剩余屋契减去 {policy:tenure.hdb.lease_buffer} 年。

示例：例如一间屋契在 `41` 年前生效的组屋，剩余屋契为完整屋契年限减去 `41` 年，而且屋主每多住一年，这个数字就减少一年。

提示：日后出售组屋时剩下的屋契，与今天剩下的屋契同样重要。
