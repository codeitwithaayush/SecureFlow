const a = require('assert'), { runWaterfall } = require('./waterfall');
const o = runWaterfall({ interestCollected: 1e6, principalCollected: 4e6, poolBal: 1e8, senior: { bal: 8e7, rate: 9 }, sub: { bal: 1e7, rate: 12 }, servicerFeePct: 0.5 });
a.strictEqual(+(o.expenses + o.seniorInterest + o.seniorPrincipal + o.subInterest + o.subPrincipal + o.eis).toFixed(2), 5e6);
console.log('waterfall ok', o);
