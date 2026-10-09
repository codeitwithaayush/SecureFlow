'use client';
import { useEffect, useState, useCallback } from 'react';
import { LayoutDashboard, Upload, Layers, ClipboardCheck, FileText, MessageSquare, Moon, Sun } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

const API = process.env.NEXT_PUBLIC_API || 'http://localhost:4000';
const api = (p: string, o?: any) => fetch(API + p, o && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) }).then(r => r.json());
const cr = (n: number) => '₹' + (n / 1e7).toFixed(2) + ' Cr';
const TABS = [['Dashboard', LayoutDashboard], ['Pools', Upload], ['Deals', Layers], ['Collections', ClipboardCheck], ['Reports', FileText], ['Assistant', MessageSquare]] as const;

function parseCsv(text: string) {
  const [h, ...ls] = text.trim().split(/\r?\n/); const cols = h.split(',').map(s => s.trim().toLowerCase().replace(/\s+/g, '_'));
  return ls.map(l => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v.trim()])));
}
const Badge = ({ t }: { t: string }) => <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${t === 'OK' ? 'bg-emerald-100 text-emerald-800' : t === 'SHORTFALL' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{t}</span>;

export default function App() {
  const [tab, setTab] = useState('Dashboard'), [dark, setDark] = useState(false), [deals, setDeals] = useState<any[]>([]), [pools, setPools] = useState<any[]>([]);
  const refresh = useCallback(() => { api('/api/deals').then(setDeals); api('/api/pools').then(setPools); }, []);
  useEffect(refresh, [refresh]);
  return (<div className={dark ? 'dark' : ''}><div className="min-h-screen flex">
    <aside className="w-52 shrink-0 border-r border-slate-200 dark:border-slate-800 p-3 space-y-1">
      <div className="font-semibold text-lg px-2 pb-3">SecureFlow</div>
      {TABS.map(([n, I]) => <button key={n} onClick={() => setTab(n)} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm ${tab === n ? 'bg-teal text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-800'}`}><I size={16} />{n}</button>)}
      <button onClick={() => setDark(!dark)} className="btn2 w-full flex items-center gap-2 mt-4">{dark ? <Sun size={14} /> : <Moon size={14} />}{dark ? 'Light mode' : 'Dark mode'}</button>
    </aside>
    <main className="flex-1 p-5 overflow-x-auto">
      {tab === 'Dashboard' && <Dashboard />}{tab === 'Pools' && <Pools pools={pools} onChange={refresh} />}
      {tab === 'Deals' && <Deals deals={deals} pools={pools} onChange={refresh} />}{tab === 'Collections' && <Collections deals={deals} onChange={refresh} />}
      {tab === 'Reports' && <Reports deals={deals} />}{tab === 'Assistant' && <Assistant />}
    </main></div></div>);
}

function Dashboard() {
  const [d, setD] = useState<any>(null); useEffect(() => { api('/api/dashboard').then(setD); }, []); if (!d) return <p>Loading…</p>;
  const m = d.metrics, rec = m.expected ? (m.actual / m.expected) * 100 : 0;
  const cards = [['Pool principal', cr(+m.principal)], ['Active deals', m.active], ['Weighted target IRR', (+m.irr).toFixed(2) + '%'], ['Recovery vs expected', `${cr(+m.actual)} / ${cr(+m.expected)} (${rec.toFixed(1)}%)`], ['Delinquency rate', (m.delinquencyRate * 100).toFixed(1) + '% · NPA ' + m.npa]];
  return (<div className="space-y-4"><div className="grid grid-cols-2 xl:grid-cols-5 gap-3">{cards.map(([k, v]) => <div key={k as string} className="card p-3"><div className="text-xs text-slate-500">{k}</div><div className="text-lg font-semibold mt-1">{v}</div></div>)}</div>
    <div className="grid xl:grid-cols-2 gap-3">
      <Chart title="Monthly cash flow: expected vs actual"><LineChart data={d.cashflow}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis tickFormatter={(v: number) => (v / 1e5).toFixed(0) + 'L'} /><Tooltip formatter={(v: number) => cr(v)} /><Legend /><Line dataKey="expected" stroke="#64748b" dot={false} /><Line dataKey="actual" stroke="#0F766E" strokeWidth={2} dot={false} /></LineChart></Chart>
      <Chart title="Waterfall payouts: principal vs interest"><BarChart data={d.payout}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis tickFormatter={(v: number) => (v / 1e5).toFixed(0) + 'L'} /><Tooltip formatter={(v: number) => cr(v)} /><Legend /><Bar dataKey="principal" stackId="a" fill="#0F766E" /><Bar dataKey="interest" stackId="a" fill="#B45309" /></BarChart></Chart>
      <Chart title="Delinquency buckets (principal)"><BarChart data={d.buckets}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="bucket" /><YAxis tickFormatter={(v: number) => (v / 1e7).toFixed(0) + 'Cr'} /><Tooltip formatter={(v: number) => cr(v)} /><Bar dataKey="amount" fill="#B42318" /></BarChart></Chart>
    </div></div>);
}
const Chart = ({ title, children }: any) => <div className="card p-3"><div className="text-sm font-medium mb-2">{title}</div><div className="h-64"><ResponsiveContainer>{children}</ResponsiveContainer></div></div>;

function Pools({ pools, onChange }: any) {
  const [rows, setRows] = useState<any[]>([]), [res, setRes] = useState<any>(null), [name, setName] = useState(''), [sel, setSel] = useState(''), [search, setSearch] = useState(''), [region, setRegion] = useState(''), [sort, setSort] = useState('loan_id'), [dir, setDir] = useState('asc'), [page, setPage] = useState(0), [loans, setLoans] = useState<any[]>([]);
  useEffect(() => { api(`/api/loans?pool_id=${sel}&search=${search}&region=${region}&sort=${sort}&dir=${dir}&page=${page}`).then(setLoans); }, [sel, search, region, sort, dir, page, pools]);
  const onFile = async (f?: File) => { if (!f) return; const r = parseCsv(await f.text()); setRows(r); setName(f.name.replace(/\.csv$/i, '')); setRes(await api('/api/pools/validate', { rows: r })); };
  const commit = async () => { const r = await api('/api/pools', { name, originator: 'Uploaded', rows }); if (r.id) { setRows([]); setRes(null); onChange(); } else setRes({ ok: false, errors: r.errors }); };
  const th = (c: string, l: string) => <th onClick={() => { setDir(sort === c && dir === 'asc' ? 'desc' : 'asc'); setSort(c); }} className="cursor-pointer">{l}{sort === c ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>;
  return (<div className="space-y-4">
    <label onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }} className="card p-6 border-dashed text-center block cursor-pointer text-sm">
      Drop a loan-pool CSV here or click to browse<br /><span className="text-slate-500">Columns: loan_id, borrower, principal, rate, tenor, region, credit_score</span>
      <input type="file" accept=".csv" hidden onChange={e => onFile(e.target.files?.[0])} /></label>
    {res && <div className="card p-3 text-sm space-y-2"><div>{res.ok ? `${res.count} rows passed validation.` : `${res.errors.length} issue(s) found. Fix the file and upload again.`}</div>
      {!res.ok && <div className="max-h-40 overflow-auto">{res.errors.slice(0, 50).map((e: any, i: number) => <div key={i}>Row {e.row} · {e.field}: {e.error}</div>)}</div>}
      {res.ok && <div className="flex gap-2"><input className="inp max-w-xs" value={name} onChange={e => setName(e.target.value)} /><button className="btn" onClick={commit}>Add pool</button></div>}</div>}
    <div className="flex gap-2 flex-wrap"><select className="inp max-w-48" value={sel} onChange={e => { setSel(e.target.value); setPage(0); }}><option value="">All pools</option>{pools.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.loans})</option>)}</select>
      <input className="inp max-w-64" placeholder="Search loan ID or borrower" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
      <select className="inp max-w-40" value={region} onChange={e => { setRegion(e.target.value); setPage(0); }}><option value="">All regions</option>{['Maharashtra', 'Gujarat', 'Karnataka', 'Tamil Nadu', 'Uttar Pradesh', 'Rajasthan', 'Delhi NCR', 'West Bengal'].map(r => <option key={r}>{r}</option>)}</select></div>
    <div className="card overflow-auto"><table className="w-full"><thead><tr>{th('loan_id', 'Loan ID')}{th('borrower', 'Borrower')}{th('principal', 'Principal')}{th('rate', 'Rate %')}{th('tenor', 'Tenor')}{th('region', 'Region')}{th('credit_score', 'Score')}{th('dpd', 'DPD')}</tr></thead>
      <tbody>{loans.map(l => <tr key={l.loan_id}><td>{l.loan_id}</td><td>{l.borrower}</td><td>₹{(+l.principal).toLocaleString('en-IN')}</td><td>{l.rate}</td><td>{l.tenor}</td><td>{l.region}</td><td>{l.credit_score}</td><td><Badge t={l.dpd == 0 ? 'OK' : l.dpd >= 90 ? 'SHORTFALL' : 'WATCH'} /> {l.dpd}</td></tr>)}</tbody></table></div>
    <div className="flex gap-2 items-center text-sm"><button className="btn2" disabled={!page} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} · {loans[0]?.total ?? 0} loans</span><button className="btn2" disabled={(page + 1) * 25 >= (loans[0]?.total ?? 0)} onClick={() => setPage(page + 1)}>Next</button></div></div>);
}

function Deals({ deals, pools, onChange }: any) {
  const [step, setStep] = useState(0), [f, setF] = useState<any>({ name: '', pool_id: '', deal_value: '', tenure: 60, senior_pct: 88, senior_rate: 9.25, sub_rate: 13, target_irr: 10.5 }), [msg, setMsg] = useState('');
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value }); const steps = ['Pool', 'Value & tenure', 'Tranches', 'Target IRR'];
  const pool = pools.find((p: any) => p.id == f.pool_id);
  const ok = [f.pool_id, f.deal_value > 0 && f.tenure > 0, f.senior_pct > 0 && f.senior_pct < 100, f.target_irr > 0][step];
  const create = async () => { const r = await api('/api/deals', { ...f, name: f.name || `PTC ${pool?.name}` }); setMsg(r.id ? `Deal "${r.name}" created and ${f.tenure}-month RPS generated.` : r.error); if (r.id) { setStep(0); onChange(); } };
  return (<div className="space-y-4"><div className="card p-4 max-w-xl space-y-3"><div className="flex gap-3 text-sm">{steps.map((s, i) => <span key={s} className={i === step ? 'font-semibold text-teal' : 'text-slate-500'}>{i + 1}. {s}</span>)}</div>
    {step === 0 && <select className="inp" value={f.pool_id} onChange={e => setF({ ...f, pool_id: e.target.value, deal_value: pools.find((p: any) => p.id == e.target.value)?.principal || '' })}><option value="">Select loan pool</option>{pools.map((p: any) => <option key={p.id} value={p.id}>{p.name} · {cr(p.principal)}</option>)}</select>}
    {step === 1 && <><label className="text-sm">Deal value (₹)<input className="inp" type="number" value={f.deal_value} onChange={set('deal_value')} /></label><label className="text-sm">Tenure (months)<input className="inp" type="number" value={f.tenure} onChange={set('tenure')} /></label></>}
    {step === 2 && <div className="grid grid-cols-3 gap-2 text-sm"><label>Senior %<input className="inp" type="number" value={f.senior_pct} onChange={set('senior_pct')} /></label><label>Senior rate %<input className="inp" type="number" value={f.senior_rate} onChange={set('senior_rate')} /></label><label>Sub rate %<input className="inp" type="number" value={f.sub_rate} onChange={set('sub_rate')} /></label><p className="col-span-3 text-slate-500">Subordinated tranche: {100 - f.senior_pct}% of deal value.</p></div>}
    {step === 3 && <><label className="text-sm">Target IRR %<input className="inp" type="number" value={f.target_irr} onChange={set('target_irr')} /></label><input className="inp" placeholder="Deal name (optional)" value={f.name} onChange={set('name')} /></>}
    <div className="flex gap-2"><button className="btn2" disabled={!step} onClick={() => setStep(step - 1)}>Back</button>{step < 3 ? <button className="btn" disabled={!ok} onClick={() => setStep(step + 1)}>Next</button> : <button className="btn" disabled={!ok} onClick={create}>Finalize deal</button>}</div>{msg && <p className="text-sm">{msg}</p>}</div>
    <div className="card overflow-auto"><table className="w-full"><thead><tr><th>Deal</th><th>Value</th><th>Senior %</th><th>Target IRR</th><th>Months paid</th><th>Collection efficiency</th></tr></thead><tbody>{deals.map((d: any) => <tr key={d.id}><td>{d.name}</td><td>{cr(+d.deal_value)}</td><td>{d.senior_pct}</td><td>{d.target_irr}%</td><td>{d.months_paid}/{d.tenure}</td><td>{(d.efficiency * 100).toFixed(1)}%</td></tr>)}</tbody></table></div></div>);
}

function Collections({ deals, onChange }: any) {
  const [id, setId] = useState(''), [ledger, setLedger] = useState<any[]>([]), [month, setMonth] = useState(1), [total, setTotal] = useState(''), [out, setOut] = useState<any>(null);
  const load = (i = id) => i && api(`/api/deals/${i}/ledger`).then(l => { setLedger(l); setMonth(l.length + 1); });
  const run = async (rows?: any[]) => { const r = await api(`/api/deals/${id}/collections`, rows ? { month, rows } : { month, total: +total }); setOut(r); load(); onChange(); };
  const onFile = async (f?: File) => f && run(parseCsv(await f.text()));
  return (<div className="space-y-4"><select className="inp max-w-xs" value={id} onChange={e => { setId(e.target.value); load(e.target.value); setOut(null); }}><option value="">Select deal</option>{deals.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
    {id && <div className="card p-4 space-y-2 max-w-xl text-sm"><div>Post collections for month <input className="inp inline w-16" type="number" value={month} onChange={e => setMonth(+e.target.value)} /></div>
      <div className="flex gap-2 items-center"><input className="inp max-w-48" placeholder="Total collected (₹)" value={total} onChange={e => setTotal(e.target.value)} /><button className="btn" disabled={!total} onClick={() => run()}>Verify & run waterfall</button><span>or</span><label className="btn2 cursor-pointer">Upload CSV (loan_id, amount)<input type="file" accept=".csv" hidden onChange={e => onFile(e.target.files?.[0])} /></label></div>
      {out?.error && <p className="text-red-700">{out.error}</p>}
      {out?.waterfall && <div><Badge t={out.flag} /> expected {cr(out.expected)}, actual {cr(out.actual)}, variance {cr(out.variance)}<div className="mt-2 grid grid-cols-2 gap-x-6">{Object.entries(out.waterfall).filter(([, v]) => typeof v === 'number').map(([k, v]) => <div key={k} className="flex justify-between"><span>{k}</span><span>₹{(v as number).toLocaleString('en-IN')}</span></div>)}</div></div>}</div>}
    {ledger.length > 0 && <div className="card overflow-auto"><table className="w-full"><thead><tr><th>Month</th><th>Expected</th><th>Actual</th><th>Status</th><th>EIS to originator</th></tr></thead><tbody>{ledger.map(l => <tr key={l.month}><td>{l.month}</td><td>{cr(l.expected)}</td><td>{cr(l.actual)}</td><td><Badge t={l.flag} /></td><td>₹{(l.detail?.eis ?? 0).toLocaleString('en-IN')}</td></tr>)}</tbody></table></div>}</div>);
}

function Reports({ deals }: any) {
  const [id, setId] = useState(''), [type, setType] = useState('servicer'), [rows, setRows] = useState<any[]>([]);
  useEffect(() => { if (id) api(`/api/reports/${id}/${type}`).then(setRows); }, [id, type]);
  return (<div className="space-y-3"><div className="flex gap-2 print:hidden"><select className="inp max-w-xs" value={id} onChange={e => setId(e.target.value)}><option value="">Select deal</option>{deals.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
    <select className="inp max-w-48" value={type} onChange={e => setType(e.target.value)}><option value="servicer">Servicer report</option><option value="payout">Investor payout statement</option><option value="quality">Asset quality summary</option></select>
    <button className="btn2" disabled={!id} onClick={() => window.open(`${API}/api/reports/${id}/${type}?format=csv`)}>Export CSV</button><button className="btn2" disabled={!id} onClick={() => window.print()}>Export PDF</button></div>
    {rows.length > 0 && <div className="card overflow-auto"><table className="w-full"><thead><tr>{Object.keys(rows[0]).map(k => <th key={k}>{k}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{Object.values(r).map((v: any, j) => <td key={j}>{typeof v === 'number' ? v.toLocaleString('en-IN') : String(v)}</td>)}</tr>)}</tbody></table></div>}</div>);
}

function Assistant() {
  const [log, setLog] = useState<any[]>([{ r: 'bot', text: 'Ask about principal by region, collection efficiency, or delinquency.' }]), [t, setT] = useState('');
  const ask = async (text = t) => { if (!text) return; setT(''); setLog(l => [...l, { r: 'me', text }]); const a = await api('/api/chat', { q: text }); setLog(l => [...l, { r: 'bot', ...a }]); };
  return (<div className="card max-w-2xl p-4 space-y-3"><div className="space-y-2 max-h-96 overflow-auto text-sm">{log.map((m, i) => <div key={i} className={m.r === 'me' ? 'text-right' : ''}><div className={`inline-block px-3 py-1.5 rounded ${m.r === 'me' ? 'bg-teal text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>{m.text}{m.rows?.map((r: any, j: number) => <div key={j}>{r.name}: {r.efficiency}%</div>)}</div></div>)}</div>
    <div className="flex flex-wrap gap-2">{['Total principal outstanding in Maharashtra', 'Deals with collection efficiency below 90%', 'How many loans are NPA?'].map(s => <button key={s} className="btn2" onClick={() => ask(s)}>{s}</button>)}</div>
    <div className="flex gap-2"><input className="inp" value={t} onChange={e => setT(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()} placeholder="Ask a question" /><button className="btn" onClick={() => ask()}>Ask</button></div></div>);
}
