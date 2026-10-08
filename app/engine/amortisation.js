// Repayment schedule for a monthly-instalment loan, summarised per year. Pure.
import { pmt } from './mortgage.js';

/**
 * @returns {{ monthly: number, totalInterest: number, rows: {year:number, interest:number, principal:number, balance:number}[] }}
 */
export function schedule(loan, annualRate, years) {
  const monthly = pmt(loan, annualRate, years), r = annualRate / 12, months = years * 12;
  const rows = [];
  let balance = loan, totalInterest = 0, yr = { year: 1, interest: 0, principal: 0, balance };
  for (let m = 1; m <= months; m++) {
    const interest = balance * r;
    const principal = m === months ? balance : monthly - interest; // last payment clears rounding
    balance -= principal; totalInterest += interest;
    yr.interest += interest; yr.principal += principal; yr.balance = Math.max(0, balance);
    if (m % 12 === 0 || m === months) { rows.push(yr); yr = { year: yr.year + 1, interest: 0, principal: 0, balance: yr.balance }; }
  }
  return { monthly, totalInterest, rows };
}
