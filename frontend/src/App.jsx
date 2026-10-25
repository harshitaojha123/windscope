import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, Clock3, Download, Wind } from 'lucide-react'

const fmt = (v) => v == null ? '—' : Number(v).toLocaleString('en-GB', { maximumFractionDigits: 1 })
const fmtTime = (v) => new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function App() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [start, setStart] = useState('2026-01-01')
  const [end, setEnd] = useState('2026-01-02')
 const [mode, setMode] = useState('elexon')
  async function load() {
    setLoading(true); setError('')
    try {
      const response = await fetch(`http://localhost:8000/api/dashboard?start=${start}&end=${end}&mode=${mode}`)
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.detail || `Request failed (${response.status})`)
      }
      setData(await response.json())
    } catch (e) { setError(e.message); setData(null) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const chartData = useMemo(() => (data?.rows || []).map(r => ({
    ...r, label: new Date(r.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    errorMW: r.forecastMW == null || r.actualMW == null ? null : +(r.forecastMW - r.actualMW).toFixed(1),
  })), [data])

  function exportCsv() {
    const rows = data?.rows || []
    const header = ['startTime','publishTime','actualMW','forecastMW','source']
    const csv = [header.join(','), ...rows.map(r => header.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a'); a.href = url; a.download = 'wind-forecast-data.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const m = data?.metrics || {}
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Wind size={22}/></div><div><strong>WindScope</strong><span>FORECAST INTELLIGENCE</span></div></div>
      <div className="nav-label">WORKSPACE</div>
      <div className="nav-item active"><Activity size={17}/> Overview</div>
      <div className="nav-item"><CalendarDays size={17}/> Forecast analysis <span className="soon">MVP</span></div>
      <div className="sidebar-bottom"><div className="status-dot"></div><div><b>Data connection</b><span>{mode === 'demo' ? 'Demo mode enabled' : 'Elexon API mode'}</span></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>Wind generation</b></div><div className="top-right"><span className="live-dot"></span> UK NATIONAL VIEW <div className="avatar">UK</div></div></header>
      <section className="page-heading">
        <div><div className="eyebrow">DAY-AHEAD PROCUREMENT · UK</div><h1>Wind generation overview</h1><p>Understand forecast availability and quantify forecast error before procurement decisions.</p></div>
        <button className="button secondary" onClick={exportCsv} disabled={!data?.rows?.length}><Download size={16}/> Export CSV</button>
      </section>
      {data?.notice && <div className={`notice ${data.mode === 'demo' ? 'warning' : ''}`}><AlertTriangle size={17}/><span>{data.notice}</span></div>}
      <section className="filter-bar">
        <div className="filter-title"><CalendarDays size={17}/> Analysis period</div>
        <label>From <input type="date" value={start} max="2026-01-31" min="2026-01-01" onChange={e=>setStart(e.target.value)}/></label>
        <label>To <input type="date" value={end} max="2026-01-31" min="2026-01-01" onChange={e=>setEnd(e.target.value)}/></label>
        <label>Data source <select value={mode} onChange={e=>setMode(e.target.value)}><option value="demo">Demo data</option><option value="elexon">Elexon API (integration scaffold)</option></select></label>
        <button className="button primary" onClick={load}><Activity size={15}/> Apply filters</button>
      </section>
      {error && <div className="error-box"><AlertTriangle size={18}/><div><b>Could not load dashboard</b><p>{error}</p></div></div>}
      <section className="kpi-grid">
        <Kpi icon={<Wind size={18}/>} label="Mean actual generation" value={data?.rows?.length ? fmt(data.rows.reduce((s,r)=>s+(r.actualMW||0),0)/data.rows.length) : '—'} unit="MW" hint="Across loaded intervals" />
        <Kpi icon={<Activity size={18}/>} label="Mean absolute error" value={fmt(m.maeMW)} unit="MW" hint="Average absolute forecast miss" />
        <Kpi icon={<AlertTriangle size={18}/>} label="Root mean square error" value={fmt(m.rmseMW)} unit="MW" hint="Penalizes larger misses" />
        <Kpi icon={<Clock3 size={18}/>} label="Matched intervals" value={fmt(m.intervals)} unit="intervals" hint="30-minute periods" />
      </section>
      <section className="content-grid">
        <div className="panel chart-panel">
          <div className="panel-heading"><div><h2>Forecast vs actual generation</h2><p>30-minute resolution · Power in MW</p></div><span className="tag"><span className="tag-dot"></span> {mode === 'demo' ? 'SAMPLE' : 'API'}</span></div>
          {loading ? <div className="empty-state">Loading dashboard data…</div> : chartData.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{top:12,right:12,left:4,bottom:2}}><CartesianGrid strokeDasharray="3 3" stroke="#e8edf4"/><XAxis dataKey="label" tick={{fontSize:11,fill:'#778397'}} tickLine={false} axisLine={false}/><YAxis tick={{fontSize:11,fill:'#778397'}} tickLine={false} axisLine={false} tickFormatter={v=>`${Math.round(v/1000)}k`}/><Tooltip labelFormatter={(v)=>`Time: ${v}`} formatter={(v,n)=>[`${fmt(v)} MW`,n]}/><Legend/><Line type="monotone" dataKey="actualMW" name="Actual generation" stroke="#2878d0" strokeWidth={2.5} dot={false}/><Line type="monotone" dataKey="forecastMW" name="Forecast generation" stroke="#17a88a" strokeWidth={2.5} dot={false} strokeDasharray="5 4"/></LineChart></ResponsiveContainer></div> : <div className="empty-state">No normalized interval data available. Demo mode shows the starter chart.</div>}
          <div className="chart-footer"><span><i className="legend-blue"></i> Actual</span><span><i className="legend-green"></i> Forecast</span><span className="muted">All times shown in API timestamp timezone</span></div>
        </div>
        <div className="panel error-panel">
          <div className="panel-heading"><div><h2>Forecast quality</h2><p>Forecast minus actual</p></div></div>
          <div className="quality-score"><div className="score-icon"><CheckCircle2 size={22}/></div><div><strong>{fmt(m.meanErrorMW)} <small>MW</small></strong><span>Mean signed error</span></div></div>
          <div className="metric-row"><span>Mean absolute percentage error</span><b>{m.mapePercent == null ? '—' : `${fmt(m.mapePercent)}%`}</b></div>
          <div className="metric-row"><span>Intervals analyzed</span><b>{fmt(m.intervals)}</b></div>
          <div className="explain"><b>How to read this</b><p>Positive signed error means the forecast was higher than actual generation. Negative means the forecast underestimated generation.</p></div>
        </div>
      </section>
      <section className="panel table-panel">
        <div className="panel-heading"><div><h2>Generation intervals</h2><p>Sample of matched forecast and actual records</p></div><span className="count-pill">{data?.rows?.length || 0} rows</span></div>
        <div className="table-scroll"><table><thead><tr><th>Target time</th><th>Forecast published</th><th>Actual (MW)</th><th>Forecast (MW)</th><th>Error (MW)</th><th>Source</th></tr></thead><tbody>
          {(data?.rows || []).slice(0,12).map((r,i)=><tr key={r.startTime+i}><td className="time-cell">{fmtTime(r.startTime)}</td><td>{r.publishTime ? fmtTime(r.publishTime) : '—'}</td><td>{fmt(r.actualMW)}</td><td>{fmt(r.forecastMW)}</td><td className={(r.forecastMW-r.actualMW)>0?'positive':'negative'}>{fmt(r.forecastMW-r.actualMW)}</td><td><span className="source-pill">{r.source || 'ELEXON'}</span></td></tr>)}
          {!data?.rows?.length && <tr><td colSpan="6" className="empty-cell">{loading ? 'Loading…' : 'No matched records to display.'}</td></tr>}
        </tbody></table></div>
        <div className="table-note">Showing up to 12 intervals. Demo values are illustrative only and must not be used for procurement decisions.</div>
      </section>
      <footer>WindScope · REint challenge prototype <span>Data period: January 2026 · Not for live trading</span></footer>
    </main>
  </div>
}

function Kpi({icon,label,value,unit,hint}) { return <div className="kpi-card"><div className="kpi-top"><span className="kpi-icon">{icon}</span><span className="kpi-unit">{unit}</span></div><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-hint">{hint}</div></div> }
