// Who pays what at purchase: cash vs CPF Ordinary Account (BR-L1 cash minimum, CPF usage rules).
// Pure. Grants are credited to CPF OA and can only be spent on the purchase, so they join the CPF pool.

/**
 * @param {{ price:number, loan:number, loanType:'hdb'|'bank', lowerTier?:boolean, duty:number, absd?:number, fees?:number, hdbFees?:number,
 *           cov?:number, grants?:number, cash:number, cpfOa:number }} x
 * @returns {{ items: {id:string, amount:number, cpf:boolean}[], total:number, net:number, cpfUsed:number,
 *             cashNeeded:number, cashShort:number, fundsShort:number }}
 */
export function funding(x, policy) {
  const down = Math.max(0, x.price - x.loan);
  const cashMinRatio = x.loanType === 'bank' ? policy.get(x.lowerTier ? 'downpayment.bank.cash_min.lower_tier' : 'downpayment.bank.cash_min') : 0;
  // option + exercise fees are part of the downpayment and cash-only for every loan type
  const cashMin = Math.min(down, Math.max(x.price * cashMinRatio, policy.get('fees.option_exercise.max')));
  const items = [
    { id: 'down-cash', amount: cashMin, cpf: false },
    { id: 'down', amount: down - cashMin, cpf: true },
    { id: 'bsd', amount: x.duty || 0, cpf: policy.get('cpf.usage.bsd') },
    { id: 'absd', amount: x.absd || 0, cpf: policy.get('cpf.usage.absd') },
    { id: 'fees', amount: x.fees || 0, cpf: policy.get('cpf.usage.legal_fees') },
    { id: 'hdb-fees', amount: x.hdbFees || 0, cpf: false },
    { id: 'cov', amount: x.cov || 0, cpf: false },
  ].filter((i) => i.amount > 0);

  const grants = x.grants || 0;
  const total = items.reduce((t, i) => t + i.amount, 0);
  const cashOnly = items.filter((i) => !i.cpf).reduce((t, i) => t + i.amount, 0);
  const cpfAble = total - cashOnly;
  const cpfPool = (x.cpfOa || 0) + grants;
  const cpfUsed = Math.min(cpfAble, cpfPool);
  const cashNeeded = cashOnly + (cpfAble - cpfUsed);
  const cash = x.cash || 0;
  return {
    items, total, net: Math.max(0, total - grants), cpfUsed, cashNeeded,
    cashShort: Math.max(0, cashNeeded - cash),
    fundsShort: Math.max(0, total - grants - cash - (x.cpfOa || 0)),
  };
}
