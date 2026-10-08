---
id: remaining-lease
term: Remaining lease
short: The number of years left on a flat's lease at a given date — a key driver of price, loan size and how much CPF can be used.
formula: "Remaining lease = lease commencement year + lease term − current year"
policy_keys: [lease.term.years, cpf.lease.cover_to_age, cpf.lease.min_years, tenure.hdb.lease_buffer]
related: [lease, lease-decay, lease-to-95, tenure, cpf-housing, psf]
level: basic
source: https://www.cpf.gov.sg/service/article/how-much-cpf-savings-can-i-use-to-buy-a-property-if-its-lease-does-not-cover-the-youngest-buyer-to-age-95
---
Remaining lease counts down from {policy:lease.term.years} years from the lease commencement date. Two otherwise similar flats can differ by decades in remaining lease, and the difference shows up in price, financing and resale prospects.

Several rules depend on it. CPF savings can be used in full only if the remaining lease covers the youngest buyer to age {policy:cpf.lease.cover_to_age}, and not at all below {policy:cpf.lease.min_years} years. An HDB loan's tenure cannot run beyond the remaining lease minus {policy:tenure.hdb.lease_buffer} years.

Worked example: e.g. a flat whose lease began `41` years ago has the full lease term minus `41` years remaining, and that figure falls by one every year the owner lives there.

Tip: The lease that will be left when the flat is eventually sold matters as much as the lease left today.
