import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import ExportButton from '../components/ExportButton'

const COLORS = ['#1a6eb5', '#d96b10', '#1e8c52', '#c0392b']
const today = () => new Date().toISOString().slice(0, 10)
const monthAgo = () => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10) }

export default function Summary() {
  const [from, setFrom] = useState(monthAgo())
  const [to, setTo]     = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [from, to])

  async function load() {
    setLoading(true)
    const [ordRes, prodRes, dispRes, lotRes, wireRes] = await Promise.all([
      supabase.from('orders').select('status, created_at, quantity_nos'),
      supabase.from('production_entries').select('entry_date, output_nos, expected_nos, wire_used_kg').gte('entry_date', from).lte('entry_date', to),
      supabase.from('dispatch_entries').select('dispatch_date, quantity_nos').gte('dispatch_date', from).lte('dispatch_date', to),
      supabase.from('rm_lot').select('wire_id, txn_type, quantity_kg'),
      supabase.from('rm_wire_master').select('id, diameter_mm, grade, min_stock_kg').eq('status', 'Active'),
    ])

    const orders = ordRes.data || []
    const prod   = prodRes.data || []
    const disp   = dispRes.data || []
    const lots   = lotRes.data || []
    const wires  = wireRes.data || []

    // order stats
    const ordersByStatus = [
      { name: 'Open',        value: orders.filter(o => o.status === 'Open').length },
      { name: 'In Progress', value: orders.filter(o => o.status === 'In Progress').length },
      { name: 'Completed',   value: orders.filter(o => o.status === 'Completed').length },
      { name: 'Cancelled',   value: orders.filter(o => o.status === 'Cancelled').length },
    ].filter(s => s.value > 0)

    // production KPIs
    const totalOutput   = prod.reduce((s, e) => s + (e.output_nos || 0), 0)
    const totalExpected = prod.reduce((s, e) => s + (e.expected_nos || 0), 0)
    const totalWireKg   = prod.reduce((s, e) => s + parseFloat(e.wire_used_kg || 0), 0)
    const totalLoss     = Math.max(totalExpected - totalOutput, 0)
    const lossPct       = totalExpected > 0 ? ((totalLoss / totalExpected) * 100).toFixed(1) : '0.0'

    // dispatch KPIs
    const totalDisp = disp.reduce((s, e) => s + (e.quantity_nos || 0), 0)

    // wire stock
    const stockMap = {}
    for (const e of lots) {
      if (!stockMap[e.wire_id]) stockMap[e.wire_id] = 0
      stockMap[e.wire_id] += e.txn_type === 'Issue' ? -parseFloat(e.quantity_kg) : parseFloat(e.quantity_kg)
    }
    const wireStock = wires.map(w => ({
      name:     `${w.diameter_mm}mm`,
      grade:    w.grade,
      stock:    +(stockMap[w.id] || 0).toFixed(2),
      min:      w.min_stock_kg || 0,
      low:      (stockMap[w.id] || 0) < (w.min_stock_kg || 0),
    }))

    // daily production chart (last 14 days within range)
    const prodByDate = {}
    for (const e of prod) {
      prodByDate[e.entry_date] = (prodByDate[e.entry_date] || 0) + (e.output_nos || 0)
    }
    const prodChart = Object.entries(prodByDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, nos]) => ({
      date: date.slice(5), nos,
    }))

    setData({ orders, ordersByStatus, totalOutput, totalWireKg, lossPct, totalLoss, totalDisp, wireStock, prodChart })
    setLoading(false)
  }

  const KPI = ({ label, value, unit, color }) => (
    <div className="stat" style={{ borderLeftColor: color || 'var(--accent)' }}>
      <div className="stat-n" style={{ color: color || 'var(--accent)', fontSize: 20 }}>{value}</div>
      {unit && <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--cond)' }}>{unit}</div>}
      <div className="stat-l">{label}</div>
    </div>
  )

  return (
    <div className="main page-enter">
      <div className="sh">
        <span className="sh-num">07</span>
        <span className="sh-title">SUMMARY</span>
        <span className="sh-desc">Business-wide KPIs</span>
      </div>

      <div className="dash-date-bar">
        <label>FROM</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        <label>TO</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} />
        {loading && <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--cond)', marginLeft: 8 }}>Loading…</span>}
      </div>

      {data && (
        <>
          {/* KPI Row */}
          <div className="stats">
            <KPI label="Total Orders" value={data.orders.length} color="var(--blue)" />
            <KPI label="Open Orders" value={data.orders.filter(o => o.status === 'Open').length} color="var(--accent)" />
            <KPI label="Completed Orders" value={data.orders.filter(o => o.status === 'Completed').length} color="var(--green)" />
            <KPI label="Dispatched (nos)" value={data.totalDisp.toLocaleString()} color="var(--purple)" />
          </div>
          <div className="stats" style={{ marginTop: 8 }}>
            <KPI label="Production Output" value={data.totalOutput.toLocaleString()} unit="nos" color="var(--green)" />
            <KPI label="Wire Consumed" value={data.totalWireKg.toFixed(1)} unit="kg" color="var(--accent)" />
            <KPI label="Total Loss" value={data.totalLoss.toLocaleString()} unit="nos" color="var(--red)" />
            <KPI label="Avg Loss %" value={`${data.lossPct}%`} color={parseFloat(data.lossPct) > 5 ? 'var(--red)' : 'var(--green)'} />
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
            <div className="dash-section">
              <div className="dash-section-header">
                <span className="dash-section-title">ORDERS BY STATUS</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.ordersByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
                    {data.ordersByStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="dash-section">
              <div className="dash-section-header">
                <span className="dash-section-title">DAILY PRODUCTION (nos)</span>
                <span className="dash-section-sub">{from} → {to}</span>
              </div>
              {data.prodChart.length === 0
                ? <div className="empty">No production in selected range.</div>
                : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.prodChart} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="nos" fill="#1e8c52" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )
              }
            </div>
          </div>

          {/* Wire Stock */}
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="sum-section-title" style={{ margin: 0, border: 'none', paddingBottom: 0 }}>WIRE STOCK LEVELS</div>
              <div className="no-print" style={{ marginBottom: 8 }}><ExportButton filename="wire-stock-summary" /></div>
            </div>
            <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 10 }} />
            <div className="tbl-wrap">
              <table data-export>
                <thead>
                  <tr>
                    <th>Wire Type</th>
                    <th>Grade</th>
                    <th style={{ textAlign: 'right' }}>Current Stock (kg)</th>
                    <th style={{ textAlign: 'right' }}>Min Stock (kg)</th>
                    <th>Level</th>
                  </tr>
                </thead>
                <tbody>
                  {data.wireStock.length === 0 && <tr><td colSpan={5} className="empty">No RM lot entries.</td></tr>}
                  {data.wireStock.map((w, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'var(--cond)', fontWeight: 700 }}>{w.name}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{w.grade}</td>
                      <td className="num-cell" style={{ textAlign: 'right', color: w.low ? 'var(--red)' : 'var(--green)' }}>{w.stock}<span className="unit">kg</span></td>
                      <td className="num-cell" style={{ textAlign: 'right', color: 'var(--muted)' }}>{w.min || '—'}</td>
                      <td>
                        {w.stock <= 0
                          ? <span className="badge b-red">EMPTY</span>
                          : w.low
                            ? <span className="badge b-warn">LOW</span>
                            : <span className="badge b-ok">OK</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
