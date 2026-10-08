// Household figures every calculator needs, derived from the store's household slice. Pure.

const num = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);

/**
 * @returns {{ buyers: object[], income: number|null, youngestAge: number|null, averageAge: number|null,
 *            cpfOa: number, cash: number, funds: number, citizenships: string[] }}
 */
export function summarise(h) {
  const buyers = (h.buyers || []).filter((b) => b && (num(b.age) != null || num(b.income) != null || num(b.cpfOa) != null));
  const incomes = buyers.map((b) => num(b.income)).filter((v) => v != null);
  const ages = buyers.map((b) => num(b.age)).filter((v) => v != null);
  const cpfOa = buyers.reduce((t, b) => t + (num(b.cpfOa) || 0), 0);
  const cash = num(h.cash) || 0;
  return {
    buyers,
    income: incomes.length ? incomes.reduce((t, v) => t + v, 0) : null,
    youngestAge: ages.length ? Math.min(...ages) : null,
    averageAge: ages.length ? ages.reduce((t, v) => t + v, 0) / ages.length : null,
    cpfOa, cash, funds: cash + cpfOa,
    citizenships: buyers.map((b) => b.citizenship || 'SC'),
  };
}
