// Pure waterfall engine. Amounts in INR.
const r2 = n => Math.round(n * 100) / 100;
function runWaterfall({ interestCollected, principalCollected, poolBal, senior, sub, servicerFeePct, carry = { sInt: 0, bInt: 0 } }) {
  let cash = interestCollected + principalCollected; const out = {};
  const pay = due => { const p = Math.min(cash, due); cash -= p; return p; };
  out.expenses = r2(pay((poolBal * servicerFeePct) / 100 / 12));
  const sIntDue = (senior.bal * senior.rate) / 1200 + carry.sInt;
  out.seniorInterest = r2(pay(sIntDue));
  out.seniorPrincipal = r2(pay(Math.min(senior.bal, principalCollected)));
  const bIntDue = (sub.bal * sub.rate) / 1200 + carry.bInt;
  out.subInterest = r2(pay(bIntDue));
  out.subPrincipal = r2(pay(Math.min(sub.bal, Math.max(0, principalCollected - out.seniorPrincipal))));
  out.eis = r2(cash);
  out.carry = { sInt: r2(sIntDue - out.seniorInterest), bInt: r2(bIntDue - out.subInterest) };
  out.seniorBal = r2(senior.bal - out.seniorPrincipal); out.subBal = r2(sub.bal - out.subPrincipal);
  return out;
}
// Aggregate monthly RPS (EMI amortisation) across loans.
function buildRps(loans, tenure) {
  const rows = Array.from({ length: tenure }, (_, i) => ({ month: i + 1, principal: 0, interest: 0 }));
  for (const l of loans) {
    const i = l.rate / 1200, n = l.tenor, P = +l.principal;
    const emi = i ? (P * i * (1 + i) ** n) / ((1 + i) ** n - 1) : P / n; let bal = P;
    for (let m = 0; m < Math.min(n, tenure); m++) { const int = bal * i, pr = Math.min(bal, emi - int); rows[m].interest += int; rows[m].principal += pr; bal -= pr; }
  }
  return rows.map(r => ({ ...r, principal: r2(r.principal), interest: r2(r.interest) }));
}
module.exports = { runWaterfall, buildRps };
