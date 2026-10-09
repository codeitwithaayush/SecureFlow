require('dotenv').config(); const { Pool } = require('pg'); const db = new Pool(); const { buildRps, runWaterfall } = require('../src/waterfall');
const regions = ['Maharashtra','Gujarat','Karnataka','Tamil Nadu','Uttar Pradesh','Rajasthan','Delhi NCR','West Bengal'];
const first = ['Rahul','Priya','Amit','Sneha','Vikram','Anjali','Suresh','Kavita','Rohan','Neha'], last = ['Sharma','Patil','Mehta','Iyer','Singh','Reddy','Joshi','Nair','Gupta','Shah'];
const pick = a => a[Math.floor(Math.random() * a.length)];
(async () => {
  for (const [pi, [name, n]] of [['MF-Vehicle-Q1', 400], ['MF-Tractor-Q2', 300]].entries()) {
    const { rows: [p] } = await db.query('INSERT INTO pools(name,originator) VALUES($1,$2) RETURNING id', [name, 'Mahindra Finance']); const loans = [];
    for (let i = 0; i < n; i++) {
      const l = { loan_id: `MMFS${pi + 1}${100000 + i}`, borrower: `${pick(first)} ${pick(last)}`, principal: 150000 + Math.floor(Math.random() * 1100000), rate: +(11 + Math.random() * 8).toFixed(2), tenor: pick([24, 36, 48, 60]), region: pick(regions), credit_score: 600 + Math.floor(Math.random() * 280), dpd: Math.random() < 0.82 ? 0 : pick([12, 25, 45, 70, 95, 130]) };
      loans.push(l); await db.query('INSERT INTO loans VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [l.loan_id, p.id, l.borrower, l.principal, l.rate, l.tenor, l.region, l.credit_score, l.dpd]);
    }
    const tot = loans.reduce((s, l) => s + l.principal, 0);
    const { rows: [d] } = await db.query(`INSERT INTO deals(name,pool_id,deal_value,tenure,senior_pct,senior_rate,sub_rate,target_irr,start_date) VALUES($1,$2,$3,60,88,9.25,13,10.5,now()-interval '7 months') RETURNING id`, [`PTC ${name}`, p.id, tot]);
    const rps = buildRps(loans, 60); let s = tot * .88, b = tot * .12, pool = tot, carry = { sInt: 0, bInt: 0 };
        for (const r of rps) await db.query(`INSERT INTO rps VALUES($1,$2,(now()-interval '7 months')::date + make_interval(months => $2),$3,$4)`, [d.id, r.month, r.principal, r.interest]);
    for (const r of rps.slice(0, 6)) {
      const eff = .86 + Math.random() * .12, exp = r.principal + r.interest, act = exp * eff, ic = Math.min(act, r.interest);
      const w = runWaterfall({ interestCollected: ic, principalCollected: act - ic, poolBal: pool, senior: { bal: s, rate: 9.25 }, sub: { bal: b, rate: 13 }, servicerFeePct: .5, carry });
      s = w.seniorBal; b = w.subBal; carry = w.carry; pool -= act - ic;
      await db.query('INSERT INTO collections VALUES($1,$2,$3,$4,$5)', [d.id, r.month, exp, act.toFixed(2), eff < .9 ? 'SHORTFALL' : 'OK']);
      await db.query('INSERT INTO payouts VALUES($1,$2,$3)', [d.id, r.month, w]);
    }
  }
  console.log('seeded'); process.exit();
})();
