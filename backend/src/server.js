require('dotenv').config(); const express = require('express'), cors = require('cors'), { Pool } = require('pg');
const { runWaterfall, buildRps } = require('./waterfall'); const db = new Pool(); const app = express(); app.use(cors(), express.json({ limit: '25mb' }));
const q = (s, p) => db.query(s, p).then(r => r.rows); const wrap = f => (req, res) => f(req, res).catch(e => res.status(500).json({ error: e.message }));
const csv = rows => rows.length ? [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).map(v => JSON.stringify(v ?? '')).join(','))].join('\n') : '';

app.get('/api/dashboard', wrap(async (_, res) => {
  const [[m]] = [await q(`SELECT COALESCE(SUM(principal),0) principal, COUNT(*) loans, COUNT(*) FILTER (WHERE dpd>0) delinquent, COUNT(*) FILTER (WHERE dpd>=90) npa FROM loans`)];
  const [[dl]] = [await q(`SELECT COUNT(*) FILTER (WHERE status='ACTIVE') active, COALESCE(AVG(target_irr),0) irr FROM deals`)];
  const [[rec]] = [await q(`SELECT COALESCE(SUM(expected),0) expected, COALESCE(SUM(actual),0) actual FROM collections`)];
  const cashflow = await q(`SELECT month, SUM(expected)::float expected, SUM(actual)::float actual FROM collections GROUP BY month ORDER BY month`);
  const payout = await q(`SELECT month, SUM((detail->>'seniorPrincipal')::float+(detail->>'subPrincipal')::float) principal, SUM((detail->>'seniorInterest')::float+(detail->>'subInterest')::float) interest FROM payouts GROUP BY month ORDER BY month`);
  const buckets = await q(`SELECT CASE WHEN dpd BETWEEN 1 AND 29 THEN '1-30' WHEN dpd BETWEEN 30 AND 59 THEN '30-60' WHEN dpd BETWEEN 60 AND 89 THEN '60+' WHEN dpd>=90 THEN 'NPA' END bucket, COUNT(*)::int n, SUM(principal)::float amount FROM loans WHERE dpd>0 GROUP BY 1 ORDER BY 1`);
  res.json({ metrics: { ...m, ...dl, ...rec, delinquencyRate: m.loans ? m.delinquent / m.loans : 0 }, cashflow, payout, buckets });
}));
app.get('/api/pools', wrap(async (_, res) => res.json(await q(`SELECT p.*, COUNT(l.*)::int loans, COALESCE(SUM(l.principal),0)::float principal FROM pools p LEFT JOIN loans l ON l.pool_id=p.id GROUP BY p.id ORDER BY p.id`))));
app.get('/api/loans', wrap(async (req, res) => {
  const { pool_id, search = '', region = '', sort = 'loan_id', dir = 'asc', page = 0 } = req.query;
  const cols = ['loan_id', 'borrower', 'principal', 'rate', 'tenor', 'region', 'credit_score', 'dpd'];
  const s = cols.includes(sort) ? sort : 'loan_id', d = dir === 'desc' ? 'DESC' : 'ASC';
  const rows = await q(`SELECT *, COUNT(*) OVER()::int total FROM loans WHERE ($1::int IS NULL OR pool_id=$1) AND (loan_id ILIKE $2 OR borrower ILIKE $2) AND ($3='' OR region=$3) ORDER BY ${s} ${d} LIMIT 25 OFFSET $4`, [pool_id || null, `%${search}%`, region, +page * 25]);
  res.json(rows);
}));
// Pre-flight validation: missing fields, bad types, duplicate IDs (in file and in DB).
const REQ = ['loan_id', 'borrower', 'principal', 'rate', 'tenor', 'region', 'credit_score'];
async function validate(rows) {
  const errors = [], seen = new Set(), existing = new Set((await q('SELECT loan_id FROM loans')).map(r => r.loan_id));
  rows.forEach((r, i) => {
    const row = i + 2; REQ.forEach(f => { if (r[f] === undefined || String(r[f]).trim() === '') errors.push({ row, field: f, error: 'Missing value' }); });
    ['principal', 'rate', 'tenor', 'credit_score'].forEach(f => { if (r[f] !== '' && r[f] !== undefined && isNaN(+r[f])) errors.push({ row, field: f, error: 'Must be a number' }); });
    if (seen.has(r.loan_id)) errors.push({ row, field: 'loan_id', error: 'Duplicate in file' }); else seen.add(r.loan_id);
    if (existing.has(r.loan_id)) errors.push({ row, field: 'loan_id', error: 'Already in database' });
  }); return errors;
}
app.post('/api/pools/validate', wrap(async (req, res) => { const errors = await validate(req.body.rows); res.json({ ok: !errors.length, errors, count: req.body.rows.length }); }));
app.post('/api/pools', wrap(async (req, res) => {
  const { name, originator, rows } = req.body, errors = await validate(rows); if (errors.length) return res.status(422).json({ errors });
  const c = await db.connect(); try { await c.query('BEGIN'); const { rows: [p] } = await c.query('INSERT INTO pools(name,originator) VALUES($1,$2) RETURNING id', [name, originator || 'NBFC']);
    for (const r of rows) await c.query('INSERT INTO loans(loan_id,pool_id,borrower,principal,rate,tenor,region,credit_score) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [r.loan_id, p.id, r.borrower, +r.principal, +r.rate, +r.tenor, r.region, +r.credit_score]);
    await c.query('COMMIT'); res.json({ id: p.id, count: rows.length }); } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}));
// Deal wizard submit: creates deal and generates RPS on finalization.
app.post('/api/deals', wrap(async (req, res) => {
  const d = req.body, loans = await q('SELECT * FROM loans WHERE pool_id=$1', [d.pool_id]); if (!loans.length) return res.status(400).json({ error: 'Pool has no loans' });
  const { rows: [deal] } = await db.query(`INSERT INTO deals(name,pool_id,deal_value,tenure,senior_pct,senior_rate,sub_rate,target_irr) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [d.name, d.pool_id, d.deal_value, d.tenure, d.senior_pct, d.senior_rate, d.sub_rate, d.target_irr]);
  for (const r of buildRps(loans, d.tenure)) await db.query(`INSERT INTO rps VALUES($1,$2,CURRENT_DATE+($2||' month')::interval,$3,$4)`, [deal.id, r.month, r.principal, r.interest]);
  res.json(deal);
}));
app.get('/api/deals', wrap(async (_, res) => res.json(await q(`SELECT d.*, (SELECT COUNT(*)::int FROM payouts p WHERE p.deal_id=d.id) months_paid, COALESCE((SELECT SUM(actual)/NULLIF(SUM(expected),0) FROM collections c WHERE c.deal_id=d.id),0)::float efficiency FROM deals d ORDER BY id`))));
app.get('/api/deals/:id/rps', wrap(async (req, res) => res.json(await q('SELECT * FROM rps WHERE deal_id=$1 ORDER BY month', [req.params.id]))));
app.get('/api/deals/:id/ledger', wrap(async (req, res) => res.json(await q(`SELECT c.month, c.expected::float, c.actual::float, c.flag, p.detail FROM collections c LEFT JOIN payouts p USING(deal_id,month) WHERE deal_id=$1 ORDER BY month`, [req.params.id]))));
// Collection verification + waterfall run for one month. rows: [{loan_id, amount}] or {total}.
app.post('/api/deals/:id/collections', wrap(async (req, res) => {
  const id = +req.params.id, month = +req.body.month, actual = req.body.total ?? req.body.rows.reduce((s, r) => s + +r.amount, 0);
  const [deal] = await q('SELECT * FROM deals WHERE id=$1', [id]); const [r] = await q('SELECT * FROM rps WHERE deal_id=$1 AND month=$2', [id, month]); if (!deal || !r) return res.status(404).json({ error: 'Deal or month not found' });
  const prev = await q(`SELECT detail FROM payouts WHERE deal_id=$1 AND month<$2 ORDER BY month DESC LIMIT 1`, [id, month]), p = prev[0]?.detail;
  const expected = +r.principal + +r.interest, flag = actual < expected * 0.98 ? 'SHORTFALL' : actual > expected * 1.02 ? 'PREPAYMENT' : 'OK';
  const ic = Math.min(actual, +r.interest), senior = p ? p.seniorBal : deal.deal_value * deal.senior_pct / 100, sub = p ? p.subBal : deal.deal_value * (100 - deal.senior_pct) / 100;
  const w = runWaterfall({ interestCollected: ic, principalCollected: actual - ic, poolBal: senior + sub, senior: { bal: senior, rate: +deal.senior_rate }, sub: { bal: sub, rate: +deal.sub_rate }, servicerFeePct: +deal.servicer_fee_pct, carry: p?.carry });
  await q(`INSERT INTO collections VALUES($1,$2,$3,$4,$5) ON CONFLICT (deal_id,month) DO UPDATE SET actual=$4, flag=$5`, [id, month, expected, actual, flag]);
  await q(`INSERT INTO payouts VALUES($1,$2,$3) ON CONFLICT (deal_id,month) DO UPDATE SET detail=$3`, [id, month, w]);
  res.json({ expected, actual, flag, variance: actual - expected, waterfall: w });
}));
// Reports: servicer | payout | quality. ?format=csv downloads; JSON otherwise (UI prints to PDF).
app.get('/api/reports/:deal/:type', wrap(async (req, res) => {
  const { deal, type } = req.params; let rows;
  if (type === 'servicer') rows = await q(`SELECT month, expected, actual, flag FROM collections WHERE deal_id=$1 ORDER BY month`, [deal]);
  else if (type === 'payout') rows = (await q(`SELECT month, detail FROM payouts WHERE deal_id=$1 ORDER BY month`, [deal])).map(r => ({ month: r.month, expenses: r.detail.expenses, senior_interest: r.detail.seniorInterest, senior_principal: r.detail.seniorPrincipal, sub_interest: r.detail.subInterest, sub_principal: r.detail.subPrincipal, eis: r.detail.eis }));
  else rows = await q(`SELECT CASE WHEN dpd=0 THEN 'Current' WHEN dpd<30 THEN '1-30' WHEN dpd<60 THEN '30-60' WHEN dpd<90 THEN '60+' ELSE 'NPA' END bucket, COUNT(*)::int loans, SUM(principal)::float principal FROM loans WHERE pool_id=(SELECT pool_id FROM deals WHERE id=$1) GROUP BY 1`, [deal]);
  if (req.query.format === 'csv') { res.type('text/csv').attachment(`${type}-deal${deal}.csv`).send(csv(rows)); } else res.json(rows);
}));
// AI assistant: intent -> parameterised SQL (no free-form SQL from the model or user).
app.post('/api/chat', wrap(async (req, res) => {
  const t = (req.body.q || '').toLowerCase(), regions = (await q('SELECT DISTINCT region FROM loans')).map(r => r.region), reg = regions.find(r => t.includes(r.toLowerCase()));
  const inr = n => '₹' + (+n / 1e7).toFixed(2) + ' Cr'; let a;
  if (reg && /principal|outstanding|exposure/.test(t)) { const [r] = await q('SELECT SUM(principal) s, COUNT(*)::int n FROM loans WHERE region=$1', [reg]); a = { text: `${reg}: ${inr(r.s)} principal outstanding across ${r.n} loans.` }; }
  else if (/collection efficiency/.test(t)) { const th = +(t.match(/(\d+)\s*%?/)?.[1] || 85) / 100; const rows = (await q(`SELECT d.name, ROUND((SUM(actual)/SUM(expected)*100)::numeric,1)::float efficiency FROM deals d JOIN collections c ON c.deal_id=d.id GROUP BY d.id HAVING SUM(actual)/SUM(expected) < $1`, [th])); a = { text: rows.length ? `${rows.length} deal(s) below ${th * 100}%:` : `No deals below ${th * 100}% collection efficiency.`, rows }; }
  else if (/npa|delinq/.test(t)) { const [r] = await q(`SELECT COUNT(*) FILTER (WHERE dpd>=90)::int npa, COUNT(*) FILTER (WHERE dpd>0)::int dq, COUNT(*)::int n FROM loans`); a = { text: `${r.dq} of ${r.n} loans are delinquent (${(r.dq / r.n * 100).toFixed(1)}%); ${r.npa} are NPA (90+ DPD).` }; }
  else if (/average|credit score/.test(t)) { const [r] = await q('SELECT AVG(credit_score)::int s FROM loans'); a = { text: `Average credit score across all loans is ${r.s}.` }; }
  else a = { text: 'Try: "Total principal outstanding in Maharashtra", "Deals with collection efficiency below 90%", "How many loans are NPA?"' };
  res.json(a);
}));
app.listen(process.env.PORT || 4000, () => console.log('SecureFlow API on', process.env.PORT || 4000));
