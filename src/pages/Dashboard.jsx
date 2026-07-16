import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useRole } from '../contexts/RoleContext'
import {
  BarChart, Bar, PieChart, Pie, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  orange: '#D96B10', blue: '#2563EB', green: '#16A34A', red: '#DC2626',
  purple: '#7C3AED', teal: '#0891B2', yellow: '#D97706', pink: '#DB2777',
}
const SERIES  = ['#D96B10','#2563EB','#16A34A','#DC2626','#7C3AED','#0891B2','#D97706']
const MOS     = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const ST_CLR  = { Completed: C.green, 'In Progress': C.blue, Open: C.orange, Cancelled: '#9CA3AF' }
const PERIODS = ['Today','Yesterday','This Week','This Month','Last Month','Last 3 Months','This Quarter','Custom']

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = d => {
  if (typeof d === 'string') return d
  if (!(d instanceof Date)) return d || ''
  const y = d.getFullYear(), mo = String(d.getMonth()+1).padStart(2,'0'), dy = String(d.getDate()).padStart(2,'0')
  return `${y}-${mo}-${dy}`
}
const IN   = n  => (+(n||0)).toLocaleString('en-IN')

function periodRange(period, cFrom, cTo) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const today = fmt(now)
  const yest  = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay())
  if (period === 'Today')         return { from: today, to: today }
  if (period === 'Yesterday')     return { from: yest, to: yest }
  if (period === 'This Week')     return { from: fmt(weekStart), to: today }
  if (period === 'This Month')    return { from: fmt(new Date(y,m,1)), to: today }
  if (period === 'Last Month')    return { from: fmt(new Date(y,m-1,1)), to: fmt(new Date(y,m,0)) }
  if (period === 'Last 3 Months') return { from: fmt(new Date(y,m-3,1)), to: today }
  if (period === 'This Quarter')  return { from: fmt(new Date(y,Math.floor(m/3)*3,1)), to: today }
  if (period === 'Custom')        return { from: cFrom||fmt(new Date(y,m,1)), to: cTo||today }
  return { from: fmt(new Date(y,m,1)), to: today }
}

function prevRange(from, to) {
  const f = new Date(from), t = new Date(to)
  const span = t - f + 86400000
  const pt = new Date(f - 86400000), pf = new Date(pt - span + 86400000)
  return { from: fmt(pf), to: fmt(pt) }
}

function last6Months() {
  const n = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(n.getFullYear(), n.getMonth() - 5 + i, 1)
    return { key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, lbl: MOS[d.getMonth()] }
  })
}

function trendOf(curr, prev) {
  if (prev == null) return null
  const d = prev > 0 ? Math.round(Math.abs((curr - prev) / prev * 100)) : 0
  return { up: curr >= prev, d, color: curr >= prev ? C.green : C.red }
}

function groupBy(arr, keyFn) {
  const map = {}
  for (const item of arr) {
    const k = keyFn(item)
    if (!map[k]) map[k] = []
    map[k].push(item)
  }
  return Object.entries(map)
}

function isoWeekLabel(dateStr) {
  const d = new Date(dateStr)
  const jan = new Date(d.getFullYear(), 0, 1)
  const w = Math.ceil(((d - jan) / 86400000 + jan.getDay() + 1) / 7)
  return `W${String(w).padStart(2,'0')}`
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function niceDate() {
  const n = new Date()
  return `${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][n.getDay()]}, ${n.getDate()} ${MOS[n.getMonth()]} ${n.getFullYear()}`
}

function downloadCSV(filename, headers, rows) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── UI atoms ──────────────────────────────────────────────────────────────────
function Pulse({ h = 100 }) {
  return (
    <div style={{
      height: h, borderRadius: 8,
      background: 'linear-gradient(90deg,#f0efed 25%,#e5e3df 50%,#f0efed 75%)',
      backgroundSize: '300% 100%', animation: 'pulse-bg 1.8s ease infinite',
    }} />
  )
}

function Card({ children, accent = C.orange, id }) {
  return (
    <div id={id} className="dash-card" style={{
      background: '#fff', border: '1px solid #E5E2DC', borderRadius: 12,
      marginBottom: 20, overflow: 'hidden', borderTop: `3px solid ${accent}`,
    }}>
      {children}
    </div>
  )
}

function CardHdr({ label, accent = C.orange, right, onExport, cardId }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function outside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])
  function printSection() {
    setOpen(false)
    if (cardId) {
      document.querySelectorAll('.dash-card').forEach(el => el.classList.remove('print-target'))
      const target = document.getElementById(cardId)
      if (target) target.classList.add('print-target')
      document.body.classList.add('print-one-card')
    }
    setTimeout(() => {
      window.print()
      setTimeout(() => {
        document.body.classList.remove('print-one-card')
        document.querySelectorAll('.dash-card').forEach(el => el.classList.remove('print-target'))
      }, 500)
    }, 50)
  }
  const item = { display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', fontFamily: 'var(--cond)', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text)', letterSpacing: '.04em' }
  return (
    <div style={{
      padding: '12px 20px', borderBottom: '1px solid #E5E2DC',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{ fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: accent }}>
        {label}
      </span>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {right && <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--cond)' }}>{right}</span>}
        {onExport && (
          <div ref={ref} style={{ position: 'relative' }} className="no-print">
            <button onClick={() => setOpen(o => !o)} style={{ background: '#16A34A', color: '#fff', border: 'none', fontFamily: 'var(--cond)', fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 5, cursor: 'pointer', letterSpacing: '.06em' }}>
              ↓ EXPORT
            </button>
            {open && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 300, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.12)', minWidth: 170, overflow: 'hidden' }}>
                <button onClick={() => { onExport(); setOpen(false) }} style={{ ...item, borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  📊 Excel (CSV)
                </button>
                <button onClick={printSection} style={item}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  🖨️ Print This Section
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Sub-card box within a section
function Box({ title, children, style = {} }) {
  return (
    <div style={{
      background: '#FAFAF8', border: '1px solid #E5E2DC', borderRadius: 8,
      padding: '12px 14px', ...style,
    }}>
      {title && <div style={{ fontFamily: 'var(--cond)', fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>}
      {children}
    </div>
  )
}

function KpiCard({ label, value, tr, sub, accent = C.orange }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E2DC', borderRadius: 10, padding: '14px 16px', borderLeft: `3px solid ${accent}` }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--cond)', fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 26, color: 'var(--text)', lineHeight: 1.1, marginBottom: 4 }}>
        {value}
      </div>
      {tr && <div style={{ fontSize: 10, fontFamily: 'var(--cond)', fontWeight: 700, color: tr.color }}>
        {tr.up ? '↑' : '↓'} {tr.d}% vs prev period
      </div>}
      {sub && !tr && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )
}

// Horizontal stock flow: [Opening] + [In] - [Out] = [Closing]
function StockFlow({ opening, inLabel, inVal, outLabel, outVal, closing, unit = 'kg', accent = C.teal }) {
  const fmtV = val => unit === 'pcs'
    ? Math.round(val || 0).toLocaleString('en-IN')
    : (+(val || 0)).toFixed(1)
  const box = (lbl, val, color, big = false) => (
    <div style={{
      flex: 1, background: '#fff', border: `1px solid ${big ? color : '#E5E2DC'}`,
      borderRadius: 8, padding: '10px 12px', textAlign: 'center',
      boxShadow: big ? `0 0 0 2px ${color}22` : 'none',
    }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--cond)', fontWeight: 700, color: 'var(--muted)', letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 6 }}>{lbl}</div>
      <div style={{ fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 20, color: big ? color : 'var(--text)' }}>
        {fmtV(val)}
      </div>
      <div style={{ fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>{unit}</div>
    </div>
  )
  const op = (sym, color) => (
    <div style={{ fontSize: 20, fontFamily: 'var(--cond)', fontWeight: 700, color, flexShrink: 0, padding: '0 2px' }}>{sym}</div>
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {box('Opening', opening, accent)}
      {op('+', C.green)}
      {box(inLabel, inVal, C.green)}
      {op('−', C.red)}
      {box(outLabel, outVal, C.red)}
      {op('=', accent)}
      {box('Closing', closing, accent, true)}
    </div>
  )
}

function Empty({ msg = 'No data for this period', h = 180 }) {
  return (
    <div style={{
      height: h, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f8f7f5', borderRadius: 8, color: 'var(--dim)', fontSize: 12, fontStyle: 'italic',
    }}>
      {msg}
    </div>
  )
}

function MiniTable({ headers, rows, emptyMsg = 'No data.', footer }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ textAlign: h.right ? 'right' : 'left', padding: '5px 8px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 10, color: 'var(--muted)', letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', background: '#f5f4f2' }}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={headers.length} style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--dim)', fontStyle: 'italic', fontSize: 11 }}>{emptyMsg}</td></tr>
          )}
          {rows.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: '1px solid #f3f2f0' }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ padding: '6px 8px', textAlign: headers[ci]?.right ? 'right' : 'left', color: cell?.color || 'var(--text)', fontFamily: cell?.cond ? 'var(--cond)' : undefined, fontWeight: cell?.bold ? 700 : undefined }}>
                  {cell?.label ?? cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--border2)' }}>
              {footer.map((cell, ci) => (
                <td key={ci} style={{ padding: '6px 8px', textAlign: headers[ci]?.right ? 'right' : 'left', background: '#f5f4f2', fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 11, color: cell?.color || 'var(--text)' }}>
                  {cell?.label ?? cell}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function ProgBar({ pct, color = C.green }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: '#f0efed', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: 'var(--cond)', fontWeight: 700, color, minWidth: 30, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

const CTITLE = { fontFamily: 'var(--cond)', fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }

// ── Slicer bar ────────────────────────────────────────────────────────────────
const SEL = { fontSize: 12, padding: '5px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', outline: 'none' }
const LBL = { fontSize: 10, fontFamily: 'var(--cond)', fontWeight: 700, color: 'var(--muted)', letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }

function SlicerBar({ sl, setSl, onApply, onReset, customers, screws, machines }) {
  const s = (k, v) => setSl(p => ({ ...p, [k]: v }))
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
      padding: '10px 20px', background: '#fff', border: '1px solid #E5E2DC',
      borderRadius: 10, marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={LBL}>Period</span>
        <select value={sl.period} onChange={e => s('period', e.target.value)} style={SEL}>
          {PERIODS.map(o => <option key={o}>{o}</option>)}
        </select>
      </div>
      {sl.period === 'Custom' && <>
        <input type="date" value={sl.customFrom} onChange={e => s('customFrom', e.target.value)} style={SEL} />
        <span style={{ color: 'var(--dim)', fontSize: 12 }}>→</span>
        <input type="date" value={sl.customTo} onChange={e => s('customTo', e.target.value)} style={SEL} />
      </>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={LBL}>Customer</span>
        <select value={sl.customerId} onChange={e => s('customerId', e.target.value)} style={SEL}>
          <option value="">All</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.customer_name}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={LBL}>Product</span>
        <select value={sl.screwId} onChange={e => s('screwId', e.target.value)} style={SEL}>
          <option value="">All</option>
          {screws.map(c => <option key={c.id} value={c.id}>{c.screw_code}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={LBL}>Machine</span>
        <select value={sl.machineId} onChange={e => s('machineId', e.target.value)} style={SEL}>
          <option value="">All</option>
          {machines.map(m => <option key={m.id} value={m.id}>{m.machine_code || m.machine_name}</option>)}
        </select>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <button onClick={onReset} style={{ fontFamily: 'var(--cond)', fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 5, border: '1px solid var(--border)', background: '#fff', color: 'var(--text)', cursor: 'pointer' }}>
          Reset
        </button>
        <button onClick={onApply} style={{ fontFamily: 'var(--cond)', fontSize: 12, fontWeight: 700, padding: '7px 18px', borderRadius: 5, border: 'none', background: C.orange, color: '#fff', cursor: 'pointer' }}>
          Apply →
        </button>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
const DEF_SL = { period: 'This Month', customFrom: '', customTo: '', customerId: '', screwId: '', machineId: '' }

export default function Dashboard() {
  const { profile } = useRole()
  const [sl, setSl]           = useState(DEF_SL)
  const [applied, setApplied] = useState(DEF_SL)
  const [customers, setCustomers] = useState([])
  const [screws, setScrews]       = useState([])
  const [machines, setMachines]   = useState([])
  const [loading, setLoading] = useState(true)
  const [d, setD]             = useState(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [fgListExpanded, setFgListExpanded] = useState(false)
  const exportRef = useRef(null)

  useEffect(() => {
    function outside(e) { if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false) }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  useEffect(() => {
    Promise.all([
      supabase.from('customer_master').select('id,customer_name').eq('status','Active').order('customer_name'),
      supabase.from('output_screw_master').select('id,screw_code,screw_name').eq('status','Active').order('screw_code'),
      supabase.from('machines').select('id,machine_name,machine_code').eq('status','Active').order('machine_name'),
    ]).then(([c, s, m]) => {
      setCustomers(c.data || [])
      setScrews(s.data || [])
      setMachines(m.data || [])
    })
  }, [])

  const loadDash = useCallback(async () => {
    const machLookup = Object.fromEntries(machines.map(m => [m.id, m.machine_code || m.machine_name]))
    const screwLookup = Object.fromEntries(screws.map(s => [s.id, { code: s.screw_code, name: s.screw_name || '—' }]))
    setLoading(true)
    const { from, to } = periodRange(applied.period, applied.customFrom, applied.customTo)
    const { from: pf, to: pt } = prevRange(from, to)
    const m6     = last6Months()
    const sixAgo = m6[0].key + '-01'

    // Build fresh query each time — reusing the same builder object stacks
    // contradictory filters across Promise.all calls, returning 0 rows.
    const mkOQ = () => {
      let q = supabase.from('orders')
        .select('id,order_no,order_date,status,customer_id,due_date,customer:customer_id(customer_name)')
      if (applied.customerId) q = q.eq('customer_id', applied.customerId)
      return q
    }
    const mkPQ = () => {
      let q = supabase.from('production_entries')
        .select('entry_date,output_nos,expected_nos,wire_used_kg,machine_id,screw_id')
      if (applied.machineId) q = q.eq('machine_id', applied.machineId)
      if (applied.screwId)   q = q.eq('screw_id', applied.screwId)
      return q
    }

    const [
      oRes, cPRes, pPRes, dRes, lotRes, wireRes,
      itmRes, platRes, s6Res, aPRes, dispInRes, convRes, fgOpenRes,
    ] = await Promise.all([
      mkOQ(),
      mkPQ().gte('entry_date', from).lte('entry_date', to),
      mkPQ().gte('entry_date', pf).lte('entry_date', pt),
      supabase.from('dispatch_entries').select('dispatch_date,order_id,order_item_id,quantity_nos'),
      supabase.from('rm_lot').select('wire_id,txn_type,quantity_kg,lot_date'),
      supabase.from('rm_wire_master').select('id,diameter_mm,grade,min_stock_kg').eq('status','Active'),
      supabase.from('order_items').select('id,order_id,screw_id,order_qty,dispatched_qty,screw:screw_id(screw_code,screw_name)'),
      supabase.from('plating_entries').select('screw_id,sent_qty,received_qty,send_date,receive_date'),
      supabase.from('production_entries').select('entry_date,wire_used_kg').gte('entry_date', sixAgo),
      supabase.from('production_entries').select('screw_id,output_nos,entry_date,wire_used_kg'),
      supabase.from('dispatch_entries').select('dispatch_date,order_id,order_item_id,quantity_nos')
        .gte('dispatch_date', from).lte('dispatch_date', to),
      supabase.from('conversion_master').select('screw_id,conversion_ratio_per_kg'),
      supabase.from('fg_opening_stock').select('screw_id,quantity_nos,stock_type,entry_date,screw:screw_id(screw_code,screw_name)'),
    ])

    const allOrd  = oRes.data    || []
    const cProd   = cPRes.data   || []
    const pProd   = pPRes.data   || []
    const allDisp = dRes.data    || []
    const lots    = lotRes.data  || []
    const wires   = wireRes.data || []
    const items   = itmRes.data  || []
    const plat    = platRes.data || []
    const s6Prod  = s6Res.data   || []
    const aProd   = aPRes.data   || []
    const dispIn  = dispInRes.data || []
    const conv    = convRes.data   || []
    const fgOpen  = fgOpenRes.data || []

    // conversion_master: screw_id → pcs per kg (ratio)
    const convMap = Object.fromEntries(conv.map(c => [c.screw_id, parseFloat(c.conversion_ratio_per_kg) || 0]))
    // Convert production entries to pcs using conversion master; fall back to output_nos
    const toPcs = entries => entries.reduce((s, p) => {
      const ratio = convMap[p.screw_id] || 0
      return s + (ratio > 0 ? Math.round(parseFloat(p.wire_used_kg || 0) * ratio) : (p.output_nos || 0))
    }, 0)

    const inRange = (row, f, t, field = 'order_date') => row[field] >= f && row[field] <= t

    // ── S1: Overall KPIs ──────────────────────────────────────────────────────
    const ordCurr  = allOrd.filter(o => inRange(o, from, to))
    const ordPrev  = allOrd.filter(o => inRange(o, pf, pt))
    const pending  = allOrd.filter(o => ['Open','In Progress'].includes(o.status))
    const compCurr = allOrd.filter(o => o.status === 'Completed' && inRange(o, from, to))
    const compPrev = allOrd.filter(o => o.status === 'Completed' && inRange(o, pf, pt))
    const dCurr    = allDisp.filter(d => inRange(d, from, to, 'dispatch_date'))
    const dPrev    = allDisp.filter(d => inRange(d, pf, pt, 'dispatch_date'))

    // RM stock (all-time running total — quantity_kg is negative for outgoing txns)
    const stock = {}
    for (const l of lots) {
      stock[l.wire_id] = (stock[l.wire_id] || 0) + (parseFloat(l.quantity_kg) || 0)
    }
    const totalRm = Object.values(stock).reduce((s, v) => s + Math.max(v, 0), 0)

    // FG Stock (all-time)
    const prodBySid = {}, vendorBySid = {}, platRecvBySid = {}
    for (const p of aProd) {
      if (p.screw_id) prodBySid[p.screw_id] = (prodBySid[p.screw_id] || 0) + (p.output_nos || 0)
    }
    for (const p of plat) {
      const pend = (p.sent_qty || 0) - (p.received_qty || 0)
      if (pend > 0) vendorBySid[p.screw_id] = (vendorBySid[p.screw_id] || 0) + pend
      if (p.received_qty > 0) platRecvBySid[p.screw_id] = (platRecvBySid[p.screw_id] || 0) + (p.received_qty || 0)
    }
    const itemIdToScrew = Object.fromEntries(items.map(it => [it.id, it.screw_id]))
    const dispBySid = {}
    for (const d2 of allDisp) {
      const sid = d2.order_item_id ? itemIdToScrew[d2.order_item_id] : null
      if (sid) dispBySid[sid] = (dispBySid[sid] || 0) + (d2.quantity_nos || 0)
    }

    // Screw info lookup for FG stock list (from order_items)
    const screwInfo = {}
    for (const it of items) {
      if (it.screw_id && it.screw) {
        screwInfo[it.screw_id] = { code: it.screw.screw_code || '—', name: it.screw.screw_name || '—' }
      }
    }
    // Opening stock: add to produced + plated BEFORE fgTotal; also backfill screwInfo for OS-only screws
    for (const o of fgOpen) {
      if (!o.screw_id) continue
      prodBySid[o.screw_id] = (prodBySid[o.screw_id] || 0) + o.quantity_nos
      if (o.stock_type === 'PLATED') platRecvBySid[o.screw_id] = (platRecvBySid[o.screw_id] || 0) + o.quantity_nos
      if (o.screw && !screwInfo[o.screw_id]) screwInfo[o.screw_id] = { code: o.screw.screw_code || '—', name: o.screw.screw_name || '—' }
    }

    const fgTotal = Object.keys(prodBySid).reduce((s, sid) =>
      s + Math.max((platRecvBySid[sid]||0) - (dispBySid[sid]||0), 0), 0)

    const allFgSids = new Set([...Object.keys(prodBySid), ...Object.keys(dispBySid)])
    const fgStockList = [...allFgSids]
      .map(sid => {
        const produced   = prodBySid[sid]     || 0
        const plated     = platRecvBySid[sid] || 0
        const dispatched = dispBySid[sid]     || 0
        const unplated   = Math.max(produced - plated, 0)
        const inStock    = Math.max(plated - dispatched, 0)
        let status = 'UNPLATED'
        if (plated > 0) status = (plated + dispatched >= produced) ? 'PLATED' : 'PARTIAL'
        return {
          code: screwInfo[sid]?.code || screwLookup[sid]?.code || sid.slice(-6),
          name: screwInfo[sid]?.name || screwLookup[sid]?.name || '—',
          produced, plated, unplated, dispatched, inStock, status,
        }
      })
      .filter(r => r.produced > 0)
      .sort((a, b) => b.inStock - a.inStock)

    const lossOf = arr => {
      const out = arr.reduce((s, e) => s + (e.output_nos || 0), 0)
      const exp = arr.reduce((s, e) => s + (e.expected_nos || 0), 0)
      return { out, exp, pct: exp > 0 ? (Math.max(exp - out, 0) / exp * 100) : 0, kg: arr.reduce((s,e) => s + parseFloat(e.wire_used_kg||0), 0) }
    }
    const cLoss = lossOf(cProd), pLoss = lossOf(pProd)

    const platLossOf = arr => {
      const sent = arr.reduce((s, e) => s + (e.sent_qty || 0), 0)
      const recv = arr.reduce((s, e) => s + (e.received_qty || 0), 0)
      return sent > 0 ? (sent - recv) / sent * 100 : 0
    }
    const pCurr  = plat.filter(p => p.send_date >= from && p.send_date <= to && p.received_qty > 0)
    const pPrev2 = plat.filter(p => p.send_date >= pf   && p.send_date <= pt  && p.received_qty > 0)

    const lossComp = [
      { name: 'Prod Loss',    curr: +cLoss.pct.toFixed(1),          prev: +pLoss.pct.toFixed(1) },
      { name: 'Plating Loss', curr: +platLossOf(pCurr).toFixed(1),  prev: +platLossOf(pPrev2).toFixed(1) },
    ]

    const mKg = {}
    for (const e of s6Prod) {
      const k = e.entry_date?.substring(0, 7)
      if (k) mKg[k] = (mKg[k] || 0) + parseFloat(e.wire_used_kg || 0)
    }
    const monthlyOut = m6.map(mm => ({ month: mm.lbl, kg: +(mKg[mm.key] || 0).toFixed(1) }))

    const stMap = {}
    for (const o of allOrd) stMap[o.status] = (stMap[o.status] || 0) + 1
    const donut = Object.entries(stMap).map(([n, v]) => ({ n, v }))

    // ── S2: Order Analysis ────────────────────────────────────────────────────
    const ordByIdMap   = Object.fromEntries(allOrd.map(o => [o.id, o]))
    const itemsByOrder = {}
    for (const it of items) {
      if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = []
      itemsByOrder[it.order_id].push(it)
    }

    const custOrderMap = {}
    for (const o of ordCurr) {
      const name = o.customer?.customer_name || 'Unknown'
      custOrderMap[name] = (custOrderMap[name] || 0) + 1
    }
    const custBar = Object.entries(custOrderMap)
      .map(([name, cnt]) => ({ name: name.length > 14 ? name.slice(0,13)+'…' : name, orders: cnt }))
      .sort((a, b) => b.orders - a.orders).slice(0, 8)

    const ordInPeriodIds = new Set(ordCurr.map(o => o.id))
    const screwQtyMap = {}
    for (const it of items) {
      if (ordInPeriodIds.has(it.order_id)) {
        const code = it.screw?.screw_code || 'Unknown'
        screwQtyMap[code] = (screwQtyMap[code] || 0) + (it.order_qty || 0)
      }
    }
    const productPie = Object.entries(screwQtyMap)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty).slice(0, 6)

    const weekMap = {}
    for (const o of ordCurr) {
      const wk = isoWeekLabel(o.order_date)
      weekMap[wk] = (weekMap[wk] || 0) + 1
    }
    const weekTrend = Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, orders]) => ({ week, orders }))

    const fulfillment = pending
      .map(o => {
        const its   = itemsByOrder[o.id] || []
        const total = its.reduce((s, i) => s + (i.order_qty || 0), 0)
        const disp  = its.reduce((s, i) => s + (i.dispatched_qty || 0), 0)
        return { ...o, total, dispatched: disp, pct: total > 0 ? Math.round(disp / total * 100) : 0 }
      })
      .sort((a, b) => a.pct - b.pct).slice(0, 8)

    // ── S3: Production Analysis ───────────────────────────────────────────────
    const prodOut     = cProd.reduce((s, e) => s + (e.output_nos || 0), 0)
    const prodExp     = cProd.reduce((s, e) => s + (e.expected_nos || 0), 0)
    const prodWireKg  = cProd.reduce((s, e) => s + parseFloat(e.wire_used_kg || 0), 0)
    const prodLossPct = prodExp > 0 ? +((prodExp - prodOut) / prodExp * 100).toFixed(1) : 0
    const prodEff     = prodExp > 0 ? Math.min(+(prodOut / prodExp * 100).toFixed(1), 100) : 0

    // Screw-wise output in period (from aProd with entry_date)
    const screwIdToCode = Object.fromEntries(items.map(it => [it.screw_id, it.screw?.screw_code]).filter(([id, code]) => id && code))
    const screwProdMap = {}
    for (const e of aProd) {
      if (!e.entry_date || e.entry_date < from || e.entry_date > to) continue
      const code = screwIdToCode[e.screw_id] || e.screw_id?.slice(-6) || 'Other'
      screwProdMap[code] = (screwProdMap[code] || 0) + (e.output_nos || 0)
    }
    const screwPie = Object.entries(screwProdMap)
      .map(([name, out]) => ({ name, out }))
      .sort((a, b) => b.out - a.out).slice(0, 6)

    // Top 5 products by output (pcs) in current period
    const top5Screws = Object.entries(screwProdMap)
      .map(([name, out]) => ({ name, out }))
      .sort((a, b) => b.out - a.out)
      .slice(0, 5)

    // Machine efficiency
    const machMap = {}
    for (const e of cProd) {
      const name = machLookup[e.machine_id] || (e.machine_id ? `M-${e.machine_id.slice(-4)}` : 'Unknown')
      if (!machMap[name]) machMap[name] = { out: 0, exp: 0, kg: 0 }
      machMap[name].out += e.output_nos || 0
      machMap[name].exp += e.expected_nos || 0
      machMap[name].kg  += parseFloat(e.wire_used_kg || 0)
    }
    const machBar = Object.entries(machMap)
      .map(([name, v]) => ({
        name,
        output: v.out, expected: v.exp,
        loss: v.exp > 0 ? +((v.exp - v.out) / v.exp * 100).toFixed(1) : 0,
        eff:  v.exp > 0 ? Math.min(+(v.out / v.exp * 100).toFixed(1), 100) : 0,
        kg:   +v.kg.toFixed(1),
      }))
      .sort((a, b) => b.output - a.output)

    const dayLossMap = {}
    for (const e of cProd) {
      if (!dayLossMap[e.entry_date]) dayLossMap[e.entry_date] = { out: 0, exp: 0 }
      dayLossMap[e.entry_date].out += e.output_nos || 0
      dayLossMap[e.entry_date].exp += e.expected_nos || 0
    }
    const dailyLoss = Object.entries(dayLossMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date: date.slice(5),
        loss: v.exp > 0 ? +((v.exp - v.out) / v.exp * 100).toFixed(1) : 0,
        eff:  v.exp > 0 ? Math.min(+(v.out / v.exp * 100).toFixed(1), 100) : 0,
      }))

    // ── S4: RM Analysis + Stock Flows ─────────────────────────────────────────

    // RM Stock Flow: Opening + Procurement − Issues = Closing
    const lotsBefore   = lots.filter(l => !l.lot_date || l.lot_date < from)
    const lotsInPeriod = lots.filter(l => l.lot_date && l.lot_date >= from && l.lot_date <= to)

    const rmOpening = lotsBefore.reduce((s, l) => s + (parseFloat(l.quantity_kg) || 0), 0)
    const rmProcurement = lotsInPeriod
      .filter(l => parseFloat(l.quantity_kg) > 0)
      .reduce((s, l) => s + (parseFloat(l.quantity_kg) || 0), 0)
    const rmIssues = lotsInPeriod
      .filter(l => parseFloat(l.quantity_kg) < 0)
      .reduce((s, l) => s + Math.abs(parseFloat(l.quantity_kg) || 0), 0)
    const rmClosing = rmOpening + rmProcurement - rmIssues

    // FG Stock Flow: Opening + Production − Dispatch = Closing (all in pcs via conversion_master)
    const aProdBefore   = aProd.filter(p => p.entry_date && p.entry_date < from)
    const aProdInPeriod = aProd.filter(p => p.entry_date && p.entry_date >= from && p.entry_date <= to)
    const dispBefore    = allDisp.filter(d => d.dispatch_date && d.dispatch_date < from)
    const platBefore    = plat.filter(p => p.send_date && p.send_date < from)

    const fgProdBefore   = toPcs(aProdBefore)
    const fgDispBefore   = dispBefore.reduce((s, d) => s + (d.quantity_nos || 0), 0)
    const fgAtVendBefore = platBefore.reduce((s, p) => s + Math.max((p.sent_qty||0) - (p.received_qty||0), 0), 0)
    const fgAllOpeningPlated = fgOpen.reduce((s, o) => s + (o.stock_type === 'PLATED' ? o.quantity_nos : 0), 0)
    const fgOpening          = Math.max(fgProdBefore - fgDispBefore - fgAtVendBefore, 0) + fgAllOpeningPlated
    const fgProduced     = toPcs(aProdInPeriod)
    const fgDispatched   = dispIn.reduce((s, d) => s + (d.quantity_nos || 0), 0)
    const fgClosing      = Math.max(fgOpening + fgProduced - fgDispatched, 0)

    // Wire stock bar
    const wireStockBar = wires.map(w => ({
      name:  `${w.diameter_mm}mm ${w.grade || ''}`.trim(),
      stock: +Math.max(stock[w.id] || 0, 0).toFixed(1),
      min:   w.min_stock_kg || 0,
      low:   (stock[w.id] || 0) < (w.min_stock_kg || 0),
    })).sort((a, b) => b.stock - a.stock)

    const rmConsumptionMap = {}
    for (const l of lots) {
      if (l.txn_type === 'Issue' && l.lot_date && l.lot_date >= from && l.lot_date <= to) {
        if (!rmConsumptionMap[l.lot_date]) rmConsumptionMap[l.lot_date] = 0
        rmConsumptionMap[l.lot_date] += parseFloat(l.quantity_kg) || 0
      }
    }
    const rmConsumption = Object.entries(rmConsumptionMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, kg]) => ({ date: date.slice(5), kg: +kg.toFixed(1) }))

    const stockHealth = wires.map(w => {
      const cur = stock[w.id] || 0
      const min = w.min_stock_kg || 0
      return { wire: `${w.diameter_mm}mm – ${w.grade || ''}`.trim(), stock: +cur.toFixed(1), min, status: cur <= 0 ? 'EMPTY' : cur < min ? 'LOW' : 'OK' }
    }).sort((a, b) => ({ EMPTY: 0, LOW: 1, OK: 2 }[a.status] - ({ EMPTY: 0, LOW: 1, OK: 2 }[b.status])))

    // ── S5: Dispatch Analysis ─────────────────────────────────────────────────
    const custDispMap = {}
    for (const d2 of dispIn) {
      const o = ordByIdMap[d2.order_id]
      const name = o?.customer?.customer_name || 'Unknown'
      custDispMap[name] = (custDispMap[name] || 0) + (d2.quantity_nos || 0)
    }
    const custDispBar = Object.entries(custDispMap)
      .map(([name, qty]) => ({ name: name.length > 14 ? name.slice(0,13)+'…' : name, qty }))
      .sort((a, b) => b.qty - a.qty).slice(0, 8)

    const platInPeriod = plat.filter(p => p.send_date >= from && p.send_date <= to)
    const platScrewMap = {}
    for (const p of platInPeriod) {
      const code = items.find(it => it.screw_id === p.screw_id)?.screw?.screw_code || `S-${(p.screw_id||'').slice(-4)}`
      platScrewMap[code] = (platScrewMap[code] || 0) + (p.sent_qty || 0)
    }
    const platDonut = Object.entries(platScrewMap)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty).slice(0, 6)

    const pendingDisp = pending
      .map(o => {
        const its = itemsByOrder[o.id] || []
        const remaining = its.reduce((s, i) => s + Math.max((i.order_qty||0) - (i.dispatched_qty||0), 0), 0)
        return { ...o, remaining }
      })
      .filter(o => o.remaining > 0)
      .sort((a, b) => (a.due_date||'').localeCompare(b.due_date||''))
      .slice(0, 10)

    setD({
      from, to,
      kpi: { ordCurr: ordCurr.length, ordPrev: ordPrev.length, pending: pending.length, rmKg: totalRm, fgPcs: fgTotal, dCurr: dCurr.length, dPrev: dPrev.length, prodKg: cLoss.kg, prodKgPrev: pLoss.kg },
      donut, monthlyOut, lossComp,
      custBar, productPie, weekTrend, fulfillment,
      prod: { out: prodOut, exp: prodExp, wireKg: prodWireKg, lossPct: prodLossPct, eff: prodEff },
      screwPie, top5Screws, machBar, dailyLoss,
      rmFlow: { opening: rmOpening, procurement: rmProcurement, issues: rmIssues, closing: rmClosing },
      fgFlow: { opening: fgOpening, produced: fgProduced, dispatched: fgDispatched, closing: fgClosing },
      wireStockBar, rmConsumption, stockHealth,
      custDispBar, platDonut, pendingDisp,
      fgStockList,
    })
    setLoading(false)
  }, [applied, machines])

  useEffect(() => { loadDash() }, [loadDash])

  const apply = () => setApplied({ ...sl })
  const reset = () => { setSl(DEF_SL); setApplied(DEF_SL) }

  const G2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }
  const G3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }

  return (
    <div className="main page-enter">

      {/* Greeting */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }} className="no-print">
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--cond)', letterSpacing: '.04em' }}>{greeting()},</div>
          <h1 style={{ fontFamily: 'var(--cond)', fontSize: 26, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, margin: '2px 0 0' }}>
            {profile?.display_name || 'there'}
          </h1>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{niceDate()}</div>
        </div>
        <div ref={exportRef} style={{ position: 'relative' }}>
          <button onClick={() => setExportOpen(o => !o)} style={{ background: '#16A34A', color: '#fff', border: 'none', fontFamily: 'var(--cond)', fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 6, cursor: 'pointer', letterSpacing: '.06em' }}>
            ↓ EXPORT
          </button>
          {exportOpen && (
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 300, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.12)', minWidth: 170, overflow: 'hidden' }}>
              {(() => {
                const item = { display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', fontFamily: 'var(--cond)', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--text)', letterSpacing: '.04em' }
                return <>
                  <button onClick={() => {
                    if (!d) return
                    downloadCSV('dashboard-summary.csv',
                      ['Section', 'Metric', 'Value'],
                      [
                        ['Overall', 'Period', `${d.from} to ${d.to}`],
                        ['Overall', 'Total Orders', d.kpi.ordCurr],
                        ['Overall', 'Pending Orders', d.kpi.pending],
                        ['Overall', 'Produced (kg)', d.kpi.prodKg.toFixed(1)],
                        ['Overall', 'RM Stock (kg)', d.kpi.rmKg.toFixed(1)],
                        ['Overall', 'FG Stock (pcs)', d.kpi.fgPcs],
                        ['Overall', 'Dispatches', d.kpi.dCurr],
                        ...d.stockHealth.map(w => ['RM', w.wire, `${w.stock} kg (${w.status})`]),
                        ...d.fgStockList.map(r => ['FG Stock', `${r.code} – ${r.name}`, `${r.inStock} pcs`]),
                        ...d.machBar.map(m => ['Production', m.name, `${m.output} pcs | ${m.kg} kg | Loss ${m.loss}%`]),
                        ...d.pendingDisp.map(o => ['Dispatch', o.order_no, `${o.remaining} pcs remaining`]),
                      ]
                    )
                    setExportOpen(false)
                  }} style={{ ...item, borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    📊 Excel (CSV)
                  </button>
                  <button onClick={() => { setExportOpen(false); setTimeout(() => window.print(), 50) }} style={item}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    🖨️ Print / PDF
                  </button>
                </>
              })()}
            </div>
          )}
        </div>
      </div>

      <SlicerBar sl={sl} setSl={setSl} onApply={apply} onReset={reset} customers={customers} screws={screws} machines={machines} />

      {/* ═══════ SECTION 1 — OVERALL ANALYSIS ════════════════════════════════ */}
      <Card accent={C.orange} id="card-overall">
        <CardHdr label="Overall Analysis" accent={C.orange} right={d ? `${d.from} → ${d.to}` : 'Loading…'} cardId="card-overall"
          onExport={d ? () => downloadCSV('overall-analysis.csv',
            ['Metric', 'Value'],
            [
              ['Period', `${d.from} to ${d.to}`],
              ['Total Orders', d.kpi.ordCurr],
              ['Pending Orders', d.kpi.pending],
              ['Produced (kg)', d.kpi.prodKg.toFixed(1)],
              ['RM Stock (kg)', d.kpi.rmKg.toFixed(1)],
              ['FG Stock (pcs)', d.kpi.fgPcs],
              ['Dispatches', d.kpi.dCurr],
              ...d.monthlyOut.map(m => [`Monthly Output - ${m.month} (kg)`, m.kg]),
            ]
          ) : undefined}
        />
        <div style={{ padding: '16px 20px' }}>
          {loading && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 16 }}>
                {Array(6).fill(0).map((_, i) => <Pulse key={i} h={90} />)}
              </div>
              <div style={G3}>{Array(3).fill(0).map((_, i) => <Pulse key={i} h={220} />)}</div>
            </>
          )}
          {!loading && d && <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 16 }}>
              <KpiCard label="Total Orders"   value={IN(d.kpi.ordCurr)}          tr={trendOf(d.kpi.ordCurr, d.kpi.ordPrev)}     accent={C.orange} />
              <KpiCard label="Pending Orders" value={IN(d.kpi.pending)}          sub="open + in progress"                        accent={C.blue} />
              <KpiCard label="Produced (kg)"  value={d.kpi.prodKg.toFixed(1)}    tr={trendOf(d.kpi.prodKg, d.kpi.prodKgPrev)}   accent={C.green} />
              <KpiCard label="RM Stock (kg)"  value={d.kpi.rmKg.toFixed(1)}     sub="current closing stock"                     accent={C.teal} />
              <KpiCard label="FG Stock (pcs)" value={IN(d.kpi.fgPcs)}       sub="ready to dispatch"                       accent={C.purple} />
              <KpiCard label="Dispatches"     value={IN(d.kpi.dCurr)}        tr={trendOf(d.kpi.dCurr, d.kpi.dPrev)}       accent={C.red} />
            </div>
            <div style={G3}>
              <Box title="Order Status">
                {d.donut.length > 0 ? (
                  <ResponsiveContainer width="100%" height={210}>
                    <PieChart>
                      <Pie data={d.donut} dataKey="v" nameKey="n" innerRadius={50} outerRadius={78} paddingAngle={2}>
                        {d.donut.map((e, i) => <Cell key={e.n} fill={ST_CLR[e.n] || SERIES[i % SERIES.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v, n]} />
                      <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" iconSize={8}
                        formatter={v => <span style={{ fontSize: 11, color: 'var(--text)' }}>{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <Empty h={210} msg="No orders found" />}
              </Box>
              <Box title="Monthly Output (kg) — Last 6 Months">
                {d.monthlyOut.some(m => m.kg > 0) ? (
                  <ResponsiveContainer width="100%" height={210}>
                    <BarChart data={d.monthlyOut} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                      <Tooltip formatter={v => [`${v} kg`, 'Wire Used']} />
                      <Bar dataKey="kg" fill={C.orange} radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty h={210} msg="No production data" />}
              </Box>
              <Box title="Loss % — Current vs Previous Period">
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={d.lossComp} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} unit="%" domain={[0, 'auto']} />
                    <Tooltip formatter={(v, n) => [`${v}%`, n]} />
                    <Legend iconType="square" iconSize={8} formatter={v => <span style={{ fontSize: 11, color: 'var(--text)' }}>{v}</span>} />
                    <Bar dataKey="curr" name="Current"  fill={C.orange} radius={[3,3,0,0]} />
                    <Bar dataKey="prev" name="Previous" fill="#F5E6D8" stroke={C.orange} strokeWidth={1} radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </div>
          </>}
        </div>
      </Card>

      {/* ═══════ SECTION 2 — ORDER ANALYSIS ══════════════════════════════════ */}
      <Card accent={C.blue} id="card-orders">
        <CardHdr label="Order Analysis" accent={C.blue} right={d ? `${d.from} → ${d.to}` : ''} cardId="card-orders"
          onExport={d ? () => downloadCSV('order-analysis.csv',
            ['Order No', 'Customer', 'Status', 'Order Date', 'Due Date', 'Total Qty (pcs)', 'Dispatched (pcs)', 'Fulfillment %'],
            d.fulfillment.map(o => [o.order_no, o.customer?.customer_name || '—', o.status, o.order_date, o.due_date || '—', o.total, o.dispatched, o.pct])
          ) : undefined}
        />
        <div style={{ padding: '16px 20px' }}>
          {loading && <div style={G2}>{Array(4).fill(0).map((_, i) => <Pulse key={i} h={200} />)}</div>}
          {!loading && d && <>
            <div style={{ ...G2, marginBottom: 12 }}>
              <Box title="Orders by Customer">
                {d.custBar.length > 0 ? (
                  <ResponsiveContainer width="100%" height={210}>
                    <BarChart data={d.custBar} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text)' }} width={58} />
                      <Tooltip formatter={v => [v, 'Orders']} />
                      <Bar dataKey="orders" fill={C.blue} radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty h={210} msg="No orders in this period" />}
              </Box>
              <Box title="Product Mix (order qty)">
                {d.productPie.length > 0 ? (
                  <ResponsiveContainer width="100%" height={210}>
                    <PieChart>
                      <Pie data={d.productPie} dataKey="qty" nameKey="name" innerRadius={45} outerRadius={78} paddingAngle={2}>
                        {d.productPie.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [IN(v) + ' pcs', n]} />
                      <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" iconSize={8}
                        formatter={v => <span style={{ fontSize: 11, color: 'var(--text)' }}>{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <Empty h={210} msg="No items in this period" />}
              </Box>
            </div>
            <div style={G2}>
              <Box title="Weekly Order Trend">
                {d.weekTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height={170}>
                    <BarChart data={d.weekTrend} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} />
                      <Tooltip formatter={v => [v, 'Orders']} />
                      <Bar dataKey="orders" fill={C.blue} radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty h={170} msg="No orders this period" />}
              </Box>
              <Box title="Fulfillment — Pending Orders">
                <MiniTable
                  headers={[{ label: 'Order' }, { label: 'Customer' }, { label: 'Qty', right: true }, { label: 'Progress' }]}
                  rows={d.fulfillment.map(o => [
                    { label: o.order_no, cond: true, bold: true },
                    { label: o.customer?.customer_name?.slice(0,16) || '—' },
                    { label: IN(o.total), right: true },
                    <ProgBar key={o.id} pct={o.pct} color={o.pct >= 80 ? C.green : o.pct >= 40 ? C.yellow : C.red} />,
                  ])}
                  emptyMsg="No pending orders"
                />
              </Box>
            </div>
          </>}
        </div>
      </Card>

      {/* ═══════ SECTION 3 — PRODUCTION ANALYSIS ════════════════════════════ */}
      <Card accent={C.green} id="card-prod">
        <CardHdr label="Production Analysis" accent={C.green} right={d ? `${d.from} → ${d.to}` : ''} cardId="card-prod"
          onExport={d ? () => downloadCSV('production-analysis.csv',
            ['Machine', 'Output (pcs)', 'Wire Used (kg)', 'Loss %', 'Efficiency %'],
            d.machBar.map(m => [m.name, m.output, m.kg, m.loss, m.eff])
          ) : undefined}
        />
        <div style={{ padding: '16px 20px' }}>
          {loading && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 12 }}>
                {Array(4).fill(0).map((_, i) => <Pulse key={i} h={80} />)}
              </div>
              <div style={G2}>{Array(3).fill(0).map((_, i) => <Pulse key={i} h={200} />)}</div>
            </>
          )}
          {!loading && d && <>
            {/* 4 KPI mini-cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 12 }}>
              <KpiCard label="Output (pcs)"  value={IN(d.prod.out)}            sub="total produced"        accent={C.green} />
              <KpiCard label="Wire Used"     value={`${d.prod.wireKg.toFixed(1)} kg`} sub="RM consumed"   accent={C.teal} />
              <KpiCard label="Efficiency"    value={`${d.prod.eff}%`}           sub="output / expected"    accent={C.blue} />
              <KpiCard label="Production Loss" value={`${d.prod.lossPct}%`}    sub="loss rate"             accent={d.prod.lossPct > 5 ? C.red : C.green} />
            </div>

            <div style={{ ...G2, marginBottom: 12 }}>
              <Box title="Top 5 Products by Output (pcs)">
                {d.top5Screws.length > 0 ? (
                  <ResponsiveContainer width="100%" height={210}>
                    <BarChart data={d.top5Screws} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                      <Tooltip formatter={v => [IN(v) + ' pcs', 'Output']} />
                      <Bar dataKey="out" fill={C.green} radius={[4,4,0,0]}>
                        {d.top5Screws.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty h={210} msg="No production in this period" />}
              </Box>
              <Box title="Output by Screw Type">
                {d.screwPie.length > 0 ? (
                  <ResponsiveContainer width="100%" height={210}>
                    <PieChart>
                      <Pie data={d.screwPie} dataKey="out" nameKey="name" innerRadius={45} outerRadius={78} paddingAngle={2}>
                        {d.screwPie.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [IN(v) + ' pcs', n]} />
                      <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" iconSize={8}
                        formatter={v => <span style={{ fontSize: 11, color: 'var(--text)' }}>{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <Empty h={210} msg="No screw output data" />}
              </Box>
            </div>

            <div style={G2}>
              <Box title="Daily Loss % Trend">
                {d.dailyLoss.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={d.dailyLoss} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} unit="%" domain={[0, 'auto']} />
                      <Tooltip formatter={(v, n) => [`${v}%`, n]} />
                      <Legend iconType="square" iconSize={8} formatter={v => <span style={{ fontSize: 11, color: 'var(--text)' }}>{v}</span>} />
                      <Line type="monotone" dataKey="loss" name="Loss %"       stroke={C.red}   strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="eff"  name="Efficiency %" stroke={C.green} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <Empty h={180} msg="No production in this period" />}
              </Box>
              <Box title="Machine Performance">
                <MiniTable
                  headers={[{ label: 'Machine' }, { label: 'Output', right: true }, { label: 'Wire (kg)', right: true }, { label: 'Loss%', right: true }, { label: 'Eff%', right: true }]}
                  rows={d.machBar.map(m => [
                    { label: m.name, cond: true, bold: true },
                    { label: IN(m.output), right: true },
                    { label: `${m.kg}`, right: true, color: 'var(--muted)' },
                    { label: `${m.loss}%`, right: true, color: m.loss > 5 ? C.red : m.loss > 2 ? C.yellow : C.green },
                    { label: `${m.eff}%`,  right: true, color: m.eff >= 95 ? C.green : m.eff >= 85 ? C.yellow : C.red },
                  ])}
                  emptyMsg="No machine data in this period."
                />
              </Box>
            </div>
          </>}
        </div>
      </Card>

      {/* ═══════ SECTION 4 — RAW MATERIAL ANALYSIS ══════════════════════════ */}
      <Card accent={C.teal} id="card-rm">
        <CardHdr label="Raw Material Analysis" accent={C.teal} cardId="card-rm"
          onExport={d ? () => downloadCSV('rm-fg-analysis.csv',
            ['Type', 'Wire / Screw', 'Current Stock', 'Min Stock / At Vendor', 'Dispatched', 'Status / In Stock'],
            [
              ...d.stockHealth.map(w => ['Wire', w.wire, w.stock, w.min, '—', w.status]),
              ...d.fgStockList.map(r => ['FG', `${r.code} – ${r.name}`, r.produced, r.atVendor, r.dispatched, r.inStock]),
            ]
          ) : undefined}
        />
        <div style={{ padding: '16px 20px' }}>
          {loading && <div style={G2}>{Array(4).fill(0).map((_, i) => <Pulse key={i} h={180} />)}</div>}
          {!loading && d && <>
            {/* Stock Flows */}
            <div style={G2}>
              <Box title="RM Stock Flow (kg)" style={{ marginBottom: 12 }}>
                <StockFlow
                  opening={d.rmFlow.opening}
                  inLabel="Procurement" inVal={d.rmFlow.procurement}
                  outLabel="Issues"     outVal={d.rmFlow.issues}
                  closing={d.rmFlow.closing}
                  unit="kg" accent={C.teal}
                />
              </Box>
              <Box title="FG Stock Flow (pcs)" style={{ marginBottom: 12 }}>
                <StockFlow
                  opening={d.fgFlow.opening}
                  inLabel="Produced"    inVal={d.fgFlow.produced}
                  outLabel="Dispatched" outVal={d.fgFlow.dispatched}
                  closing={d.fgFlow.closing}
                  unit="pcs" accent={C.purple}
                />
              </Box>
            </div>

            {/* FG Stock List */}
            {(() => {
              const list = d.fgStockList || []
              const SHOW = 10
              const shown = fgListExpanded ? list : list.slice(0, SHOW)
              const tot = list.reduce((acc, r) => ({
                produced: acc.produced + r.produced,
                plated: acc.plated + r.plated,
                unplated: acc.unplated + r.unplated,
                dispatched: acc.dispatched + r.dispatched,
                inStock: acc.inStock + r.inStock,
              }), { produced: 0, plated: 0, unplated: 0, dispatched: 0, inStock: 0 })
              return (
                <Box title={`FG Stock — Plating Status by Screw (${list.length} items)`} style={{ marginBottom: 12 }}>
                  <MiniTable
                    headers={[
                      { label: 'Screw Code' }, { label: 'Screw Name' },
                      { label: 'Produced', right: true }, { label: 'Plated', right: true },
                      { label: 'Unplated', right: true }, { label: 'Dispatched', right: true },
                      { label: 'FG Stock', right: true }, { label: 'Status' },
                    ]}
                    rows={shown.map(r => {
                      const stColor = r.status === 'PLATED' ? C.green : r.status === 'PARTIAL' ? C.yellow : C.red
                      return [
                        { label: r.code, cond: true, bold: true },
                        { label: r.name },
                        { label: IN(r.produced), right: true, color: 'var(--muted)' },
                        { label: r.plated > 0 ? IN(r.plated) : '—', right: true, color: r.plated > 0 ? C.green : 'var(--dim)' },
                        { label: r.unplated > 0 ? IN(r.unplated) : '—', right: true, color: r.unplated > 0 ? C.red : 'var(--dim)' },
                        { label: r.dispatched > 0 ? IN(r.dispatched) : '—', right: true, color: 'var(--muted)' },
                        { label: r.inStock > 0 ? IN(r.inStock) : '—', right: true, bold: true, color: r.inStock > 0 ? C.green : 'var(--dim)' },
                        <span key={r.code} style={{ fontSize: 9, fontFamily: 'var(--cond)', fontWeight: 700, letterSpacing: '.06em', padding: '2px 7px', borderRadius: 10, background: stColor + '18', color: stColor, border: `1px solid ${stColor}44` }}>{r.status}</span>,
                      ]
                    })}
                    footer={list.length > 0 ? [
                      { label: `TOTAL (${list.length})` },
                      { label: '' },
                      { label: IN(tot.produced), bold: true },
                      { label: IN(tot.plated), bold: true, color: C.green },
                      { label: tot.unplated > 0 ? IN(tot.unplated) : '—', bold: true, color: tot.unplated > 0 ? C.red : 'var(--dim)' },
                      { label: tot.dispatched > 0 ? IN(tot.dispatched) : '—', bold: true, color: 'var(--muted)' },
                      { label: IN(tot.inStock), bold: true, color: C.green },
                      { label: '' },
                    ] : undefined}
                    emptyMsg="No finished goods produced yet."
                  />
                  {list.length > SHOW && (
                    <button
                      onClick={() => setFgListExpanded(e => !e)}
                      className="no-print"
                      style={{ display: 'block', width: '100%', marginTop: 8, padding: '7px', background: 'none', border: '1px dashed var(--border)', borderRadius: 6, color: 'var(--muted)', fontFamily: 'var(--cond)', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '.04em', transition: 'all .15s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
                    >
                      {fgListExpanded ? '▲ COLLAPSE TABLE' : `▼ SHOW ALL ${list.length} SCREWS`}
                    </button>
                  )}
                </Box>
              )
            })()}

            <Box title="Stock Health">
              <MiniTable
                headers={[{ label: 'Wire Type' }, { label: 'Current Stock (kg)', right: true }, { label: 'Min Stock (kg)', right: true }, { label: 'Status' }]}
                rows={d.stockHealth.map(w => [
                  { label: w.wire, cond: true, bold: true },
                  { label: w.stock.toFixed(1), right: true, color: w.stock <= 0 ? C.red : w.stock < w.min ? C.yellow : C.green },
                  { label: w.min || '—', right: true, color: 'var(--muted)' },
                  <span key={w.wire} className={`badge ${w.status === 'OK' ? 'b-ok' : w.status === 'LOW' ? 'b-warn' : 'b-red'}`}>{w.status}</span>,
                ])}
                emptyMsg="No wire stock data."
              />
            </Box>
          </>}
        </div>
      </Card>

      {/* ═══════ SECTION 5 — DISPATCH ANALYSIS ══════════════════════════════ */}
      <Card accent={C.purple} id="card-dispatch">
        <CardHdr label="Dispatch Analysis" accent={C.purple} right={d ? `${d.from} → ${d.to}` : ''} cardId="card-dispatch"
          onExport={d ? () => downloadCSV('dispatch-analysis.csv',
            ['Order No', 'Customer', 'Status', 'Due Date', 'Remaining (pcs)'],
            d.pendingDisp.map(o => [o.order_no, o.customer?.customer_name || '—', o.status, o.due_date || '—', o.remaining])
          ) : undefined}
        />
        <div style={{ padding: '16px 20px' }}>
          {loading && <div style={G2}>{Array(3).fill(0).map((_, i) => <Pulse key={i} h={200} />)}</div>}
          {!loading && d && <>
            <div style={{ ...G2, marginBottom: 12 }}>
              <Box title="Dispatched Qty by Customer (pcs)">
                {d.custDispBar.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={d.custDispBar} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text)' }} width={58} />
                      <Tooltip formatter={v => [IN(v) + ' pcs', 'Dispatched']} />
                      <Bar dataKey="qty" fill={C.purple} radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Empty h={220} msg="No dispatches in this period" />}
              </Box>
              <Box title="Plating Split by Screw (sent qty)">
                {d.platDonut.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={d.platDonut} dataKey="qty" nameKey="name" innerRadius={45} outerRadius={78} paddingAngle={2}>
                        {d.platDonut.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [IN(v) + ' pcs', n]} />
                      <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" iconSize={8}
                        formatter={v => <span style={{ fontSize: 11, color: 'var(--text)' }}>{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <Empty h={220} msg="No plating in this period" />}
              </Box>
            </div>
            <Box title="Pending Dispatch — Open Orders">
              {d.pendingDisp.length === 0
                ? <Empty h={80} msg="No pending dispatch — all clear!" />
                : <MiniTable
                    headers={[{ label: 'Order No' }, { label: 'Customer' }, { label: 'Status' }, { label: 'Due Date' }, { label: 'Remaining (pcs)', right: true }]}
                    rows={d.pendingDisp.map(o => [
                      { label: o.order_no, cond: true, bold: true },
                      { label: o.customer?.customer_name || '—' },
                      <span key={o.id} style={{ fontSize: 10, fontFamily: 'var(--cond)', fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: o.status === 'Open' ? '#FFF7ED' : '#EFF6FF', color: o.status === 'Open' ? C.orange : C.blue }}>{o.status}</span>,
                      { label: o.due_date || '—', color: o.due_date && o.due_date < d.to ? C.red : 'var(--text)' },
                      { label: IN(o.remaining), right: true, bold: true, color: C.red },
                    ])}
                  />
              }
            </Box>
          </>}
        </div>
      </Card>

    </div>
  )
}
