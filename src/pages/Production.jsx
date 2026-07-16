import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import ExportButton from '../components/ExportButton'

const today = () => new Date().toISOString().slice(0, 10)

const EMPTY = {
  customer_id: '', order_id: '',
  machine_id: '', wire_id: '',
  order_item_id: '', screw_id: '',
  actual_output_kg: '', wire_issued_kg: '',
  notes: '',
}

function newMultiRow() {
  return {
    _id: Date.now() + Math.random(),
    order_id: '', machine_id: '', wire_id: '', screw_id: '',
    actual_output_kg: '', wire_issued_kg: '', notes: '',
  }
}

// ── Open Orders Brief ────────────────────────────────────────────
const BRIEF_BG      = '#0F172A'   // deep navy
const BRIEF_BORDER  = '#1E3A5F'
const BRIEF_HDR_BG  = '#0F172A'
const BRIEF_ROW_BG  = '#111D2E'
const BRIEF_ROW_ALT = '#162133'
const BRIEF_TEXT    = '#CBD5E1'
const BRIEF_MUTED   = '#64748B'
const BRIEF_DIM     = '#334155'
const BRIEF_ACCENT  = '#38BDF8'   // sky blue

function ScrewSearch({ items, value, onChange, hasError }) {
  const label = (id) => { const s = items.find(s => s.id === id); return s ? `${s.screw_code} – ${s.screw_name}` : '' }
  const [text, setText] = useState(() => label(value))
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => { setText(label(value)) }, [value, items.length])

  useEffect(() => {
    function outside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
        setText(label(value))
      }
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [value, items])

  const isTyping = text.length > 0 && text !== label(value)
  const filtered = isTyping
    ? items.filter(s => `${s.screw_code} ${s.screw_name}`.toLowerCase().includes(text.toLowerCase()))
    : items

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={text}
        onChange={e => { setText(e.target.value); onChange(''); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={items.length ? 'Type to search screw…' : 'No screws in open orders'}
        className={hasError ? 'error' : ''}
        style={{ width: '100%' }}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 300,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 7,
          maxHeight: 220, overflowY: 'auto', boxShadow: '0 6px 20px rgba(0,0,0,.13)',
        }}>
          {filtered.map(s => (
            <div key={s.id}
              onMouseDown={() => { onChange(s.id); setText(`${s.screw_code} – ${s.screw_name}`); setOpen(false) }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <span style={{ fontFamily: 'var(--cond)', fontWeight: 700 }}>{s.screw_code}</span>
              <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 11 }}>{s.screw_name}</span>
              {s.suffix && <span style={{ marginLeft: 10, color: 'var(--accent)', fontSize: 10, fontWeight: 600 }}>{s.suffix}</span>}
            </div>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && text && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 300,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 7,
          padding: '8px 12px', fontSize: 12, color: 'var(--muted)',
          boxShadow: '0 6px 20px rgba(0,0,0,.13)',
        }}>
          No match for "{text}"
        </div>
      )}
    </div>
  )
}

function WireSearch({ items, value, onChange, hasError }) {
  const label = (id) => { const w = items.find(w => w.id === id); return w ? `${w.diameter_mm}mm · ${w.grade}` : '' }
  const [text, setText] = useState(() => label(value))
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => { setText(label(value)) }, [value, items.length])

  useEffect(() => {
    function outside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
        setText(label(value))
      }
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [value, items])

  const isTyping = text.length > 0 && text !== label(value)
  const filtered = isTyping
    ? items.filter(w => `${w.diameter_mm}mm ${w.grade}`.toLowerCase().includes(text.toLowerCase()))
    : items

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={text}
        onChange={e => { setText(e.target.value); onChange(''); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={items.length ? 'Type to search wire…' : 'Select screw/order first'}
        className={hasError ? 'error' : ''}
        style={{ width: '100%' }}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 300,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 7,
          maxHeight: 200, overflowY: 'auto', boxShadow: '0 6px 20px rgba(0,0,0,.13)',
        }}>
          {filtered.map(w => (
            <div key={w.id}
              onMouseDown={() => { onChange(w.id); setText(`${w.diameter_mm}mm · ${w.grade}`); setOpen(false) }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <span style={{ fontFamily: 'var(--cond)', fontWeight: 700 }}>{w.diameter_mm}mm</span>
              <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 11 }}>{w.grade}</span>
            </div>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && text && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 300,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 7,
          padding: '8px 12px', fontSize: 12, color: 'var(--muted)',
          boxShadow: '0 6px 20px rgba(0,0,0,.13)',
        }}>
          No match for "{text}"
        </div>
      )}
    </div>
  )
}

function OrdersBrief({ openOrders, openItemsMap, customers, wires, convMap, wireStockMap, fgAvailable }) {
  const [collapsed, setCollapsed] = useState(false)

  const custMap = Object.fromEntries(customers.map(c => [c.id, c.customer_name]))
  const wireMap = Object.fromEntries(wires.map(w => [w.id, `${w.diameter_mm}mm · ${w.grade}`]))

  const totalPending = openOrders.reduce((s, o) => s + (openItemsMap[o.id] || []).length, 0)

  if (!openOrders.length) return null

  return (
    <div style={{ marginTop: 36, marginBottom: 8 }}>
      {/* Header bar */}
      <div
        onClick={() => setCollapsed(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 18px',
          background: BRIEF_BG,
          border: `1.5px solid ${BRIEF_BORDER}`,
          borderRadius: collapsed ? 10 : '10px 10px 0 0',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontFamily: 'var(--cond)', fontSize: 13, fontWeight: 800,
            letterSpacing: '.1em', color: '#F1F5F9',
          }}>OPEN ORDERS BRIEF</span>
          <span style={{
            fontSize: 10, fontFamily: 'var(--cond)', fontWeight: 700,
            background: BRIEF_ACCENT, color: '#0F172A',
            padding: '2px 9px', borderRadius: 4, letterSpacing: '.05em',
          }}>
            {openOrders.length} ORDER{openOrders.length !== 1 ? 'S' : ''} · {totalPending} ITEM{totalPending !== 1 ? 'S' : ''} PENDING
          </span>
        </div>
        <span style={{ fontSize: 11, color: BRIEF_MUTED, fontFamily: 'var(--cond)', fontWeight: 600 }}>
          {collapsed ? '▼ EXPAND' : '▲ COLLAPSE'}
        </span>
      </div>

      {!collapsed && (
        <div style={{
          border: `1.5px solid ${BRIEF_BORDER}`, borderTop: 'none',
          borderRadius: '0 0 10px 10px', overflow: 'hidden',
          background: BRIEF_ROW_BG,
        }}>
          {openOrders.map((order, oi) => {
            const items    = openItemsMap[order.id] || []
            const custName = custMap[order.customer_id] || '—'
            const isOverdue = order.due_date && new Date(order.due_date) < new Date()
            const dueSoon   = !isOverdue && order.due_date &&
              (new Date(order.due_date) - new Date()) < 7 * 86400 * 1000
            const dueColor  = isOverdue ? '#F87171' : dueSoon ? '#FCD34D' : BRIEF_MUTED
            const totalRem  = items.reduce((s, it) => s + Math.max(0, (it.order_qty || 0) - (it.dispatched_qty || 0)), 0)

            return (
              <div key={order.id} style={{
                borderTop: oi > 0 ? `1px solid ${BRIEF_BORDER}` : 'none',
              }}>
                {/* Order header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                  padding: '10px 18px', background: BRIEF_HDR_BG,
                  borderBottom: `1px solid ${BRIEF_BORDER}`,
                }}>
                  <span style={{ fontFamily: 'var(--cond)', fontSize: 15, fontWeight: 800, color: BRIEF_ACCENT, letterSpacing: '.03em' }}>
                    {order.order_no}
                  </span>
                  <span style={{ fontFamily: 'var(--cond)', fontSize: 13, fontWeight: 700, color: '#F1F5F9' }}>
                    {custName}
                  </span>
                  <span style={{
                    fontSize: 10, fontFamily: 'var(--cond)', fontWeight: 700,
                    padding: '2px 8px', borderRadius: 4,
                    background: order.status === 'In Progress' ? '#1D4ED822' : '#92400E22',
                    color: order.status === 'In Progress' ? '#60A5FA' : '#FCD34D',
                    border: `1px solid ${order.status === 'In Progress' ? '#1D4ED855' : '#92400E55'}`,
                  }}>
                    {order.status.toUpperCase()}
                  </span>
                  {order.due_date && (
                    <span style={{ fontSize: 11, fontFamily: 'var(--cond)', fontWeight: 700, color: dueColor }}>
                      {isOverdue ? '⚠ OVERDUE' : dueSoon ? '⚡ DUE SOON' : 'DUE'}{' '}
                      {new Date(order.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'var(--cond)', color: BRIEF_MUTED }}>
                    Total remaining:{' '}
                    <strong style={{ color: '#F1F5F9' }}>{totalRem.toLocaleString()} pcs</strong>
                  </span>
                </div>

                {/* Items table */}
                {items.length === 0 ? (
                  <div style={{ padding: '12px 20px', fontSize: 12, color: BRIEF_MUTED, fontStyle: 'italic' }}>
                    No pending items.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#0A1628', borderBottom: `1px solid ${BRIEF_BORDER}` }}>
                          {[
                            ['#', 'left'], ['Screw', 'left'], ['Ordered (pcs)', 'right'],
                            ['Dispatched', 'right'], ['Remaining', 'right'],
                            ['FG in Stock', 'right'], ['Net to Produce', 'right'],
                            ['Wire Needed', 'left'], ['Wire Stock', 'right'], ['Est. Wire Req. (kg)', 'right'],
                          ].map(([h, align]) => (
                            <th key={h} style={{
                              padding: '7px 14px', textAlign: align,
                              fontFamily: 'var(--cond)', fontSize: 10, fontWeight: 700,
                              letterSpacing: '.08em', color: BRIEF_MUTED, whiteSpace: 'nowrap',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, ii) => {
                          const remaining  = Math.max(0, (item.order_qty || 0) - (item.dispatched_qty || 0))
                          const fgStock    = fgAvailable?.[item.screw_id] || 0
                          const netToProd  = Math.max(0, remaining - fgStock)
                          const ratio      = convMap[item.screw_id]?.conversion_ratio_per_kg || 0
                          const wireNeeded = item.screw?.rm_wire_id || convMap[item.screw_id]?.wire_id || ''
                          const wireLabel  = wireNeeded ? (wireMap[wireNeeded] || '—') : '—'
                          const wireStock  = wireNeeded ? (wireStockMap[wireNeeded] ?? null) : null
                          const estWireKg  = ratio > 0 && netToProd > 0 ? (netToProd / ratio).toFixed(2) : '—'
                          const stockShort = wireStock !== null && ratio > 0 && netToProd > 0 && wireStock < (netToProd / ratio)
                          const pctDone    = item.order_qty > 0
                            ? Math.min(100, Math.round((item.dispatched_qty || 0) / item.order_qty * 100)) : 0

                          return (
                            <tr key={item.id} style={{
                              borderBottom: `1px solid ${BRIEF_BORDER}`,
                              background: ii % 2 === 0 ? BRIEF_ROW_BG : BRIEF_ROW_ALT,
                            }}>
                              <td style={{ padding: '9px 14px', color: BRIEF_DIM, fontSize: 11 }}>{ii + 1}</td>
                              <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                                <span style={{ fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 13, color: '#F1F5F9' }}>
                                  {item.screw?.screw_code}
                                </span>
                                <span style={{ color: BRIEF_MUTED, fontSize: 11, marginLeft: 7 }}>
                                  {item.screw?.screw_name}
                                </span>
                              </td>
                              <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--cond)', fontWeight: 600, color: BRIEF_TEXT }}>
                                {(item.order_qty || 0).toLocaleString()}
                              </td>
                              <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--cond)', fontWeight: 600 }}>
                                <div style={{ color: '#4ADE80' }}>{(item.dispatched_qty || 0).toLocaleString()}</div>
                                <div style={{ fontSize: 10, color: BRIEF_MUTED, fontWeight: 400 }}>{pctDone}% done</div>
                              </td>
                              <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                                <span style={{
                                  fontFamily: 'var(--cond)', fontWeight: 800, fontSize: 13,
                                  color: remaining > 0 ? '#FB923C' : '#4ADE80',
                                }}>
                                  {remaining.toLocaleString()}
                                </span>
                              </td>
                              <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                                <span style={{ fontFamily: 'var(--cond)', fontWeight: 700, color: fgStock > 0 ? '#4ADE80' : BRIEF_DIM }}>
                                  {fgStock > 0 ? fgStock.toLocaleString() : '—'}
                                </span>
                              </td>
                              <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                                <span style={{
                                  fontFamily: 'var(--cond)', fontWeight: 800, fontSize: 13,
                                  color: netToProd === 0 ? '#4ADE80' : '#F87171',
                                }}>
                                  {netToProd === 0 ? '✓ Covered' : netToProd.toLocaleString()}
                                </span>
                              </td>
                              <td style={{ padding: '9px 14px', color: wireNeeded ? BRIEF_TEXT : BRIEF_DIM, whiteSpace: 'nowrap' }}>
                                {wireLabel}
                              </td>
                              <td style={{ padding: '9px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                {wireStock !== null ? (
                                  <span style={{ fontFamily: 'var(--cond)', fontWeight: 700, color: stockShort ? '#F87171' : '#4ADE80' }}>
                                    {wireStock.toFixed(2)} kg
                                    {stockShort && <span style={{ fontSize: 10, display: 'block', fontWeight: 400 }}>⚠ Short</span>}
                                  </span>
                                ) : <span style={{ color: BRIEF_DIM }}>—</span>}
                              </td>
                              <td style={{ padding: '9px 14px', textAlign: 'right', fontFamily: 'var(--cond)', fontWeight: 700, color: BRIEF_ACCENT }}>
                                {estWireKg !== '—' ? `${estWireKg} kg` : '—'}
                                {ratio === 0 && <span style={{ fontSize: 10, color: BRIEF_MUTED, fontWeight: 400, display: 'block' }}>no ratio set</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────

export default function Production() {
  const { user } = useAuth()

  // ── master data ──
  const [entries, setEntries]       = useState([])
  const [customers, setCust]        = useState([])
  const [openOrders, setOpenOrders] = useState([])
  const [openItemsMap, setItemsMap] = useState({})   // order_id → [order_items]
  const [machines, setMachines]     = useState([])
  const [wires, setWires]           = useState([])
  const [screws, setScrews]         = useState([])
  const [convMap, setConvMap]       = useState({})   // screw_id → { wire_id, conversion_ratio_per_kg }
  const [wireStockMap, setWireStock]= useState({})   // wire_id → total_kg
  const [fgAvailable, setFgAvail]   = useState({})   // screw_id → available pcs
  const [loading, setLoading]       = useState(true)

  // ── form ──
  const [tab, setTab]               = useState('single')
  const [showForm, setShowForm]     = useState(false)
  const [single, setSingle]         = useState(EMPTY)
  const [errors, setErrors]         = useState({})
  const [saving, setSaving]         = useState(false)
  const [multiRows, setMulti]       = useState([newMultiRow(), newMultiRow()])
  const [editEntryId, setEditEntryId] = useState(null)
  const [origWireKg, setOrigWireKg]   = useState(0)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [eRes, mRes, wRes, sRes, cRes, custRes, oRes, oiRes, lotRes, prodAllRes, dispAllRes] = await Promise.all([
      supabase.from('production_entries')
        .select('*, order:order_id(order_no), machine:machine_id(machine_name,machine_code), wire:wire_id(diameter_mm,grade), screw:screw_id(screw_code,screw_name)')
        .order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(100),
      supabase.from('machines').select('id,machine_name,machine_code,machine_type').eq('status','Active').order('machine_name'),
      supabase.from('rm_wire_master').select('id,diameter_mm,grade').eq('status','Active').order('diameter_mm'),
      supabase.from('output_screw_master').select('id,screw_code,screw_name,rm_wire_id').eq('status','Active').order('screw_code'),
      supabase.from('conversion_master').select('screw_id,wire_id,conversion_ratio_per_kg').eq('status','Active'),
      supabase.from('customer_master').select('id,customer_name').eq('status','Active').order('customer_name'),
      supabase.from('orders').select('id,order_no,customer_id,due_date,status').in('status',['Open','In Progress','Partial']).order('order_no'),
      supabase.from('order_items')
        .select('id,order_id,screw_id,wire_id,order_qty,dispatched_qty,status,screw:screw_id(screw_code,screw_name,rm_wire_id)')
        .in('status',['Pending','In Progress']),
      supabase.from('rm_lot').select('wire_id,quantity_kg'),
      supabase.from('production_entries').select('screw_id,output_nos'),
      supabase.from('order_items').select('screw_id,dispatched_qty'),
    ])

    setEntries(eRes.data || [])
    setMachines(mRes.data || [])
    setWires(wRes.data || [])
    setScrews(sRes.data || [])

    const cm = {}
    for (const c of (cRes.data || [])) {
      if (!cm[c.screw_id]) cm[c.screw_id] = c
    }
    setConvMap(cm)

    setCust(custRes.data || [])
    setOpenOrders(oRes.data || [])

    const oim = {}
    for (const oi of (oiRes.data || [])) {
      if (!oim[oi.order_id]) oim[oi.order_id] = []
      oim[oi.order_id].push(oi)
    }
    setItemsMap(oim)

    const wsm = {}
    for (const lot of (lotRes.data || [])) {
      wsm[lot.wire_id] = (wsm[lot.wire_id] || 0) + parseFloat(lot.quantity_kg || 0)
    }
    setWireStock(wsm)

    // FG available per screw = total produced - total dispatched
    const fgProd = {}
    for (const p of (prodAllRes.data || [])) {
      fgProd[p.screw_id] = (fgProd[p.screw_id] || 0) + (p.output_nos || 0)
    }
    const fgDisp = {}
    for (const i of (dispAllRes.data || [])) {
      fgDisp[i.screw_id] = (fgDisp[i.screw_id] || 0) + (i.dispatched_qty || 0)
    }
    const fgMap = {}
    const allScrewIds = new Set([...Object.keys(fgProd), ...Object.keys(fgDisp)])
    for (const sid of allScrewIds) {
      fgMap[sid] = Math.max(0, (fgProd[sid] || 0) - (fgDisp[sid] || 0))
    }
    setFgAvail(fgMap)
    setLoading(false)
  }

  // ── helpers ──

  function custWithOrders() {
    const ids = new Set(openOrders.map(o => o.customer_id))
    return customers.filter(c => ids.has(c.id))
  }

  function formatOrderOption(o) {
    const items = openItemsMap[o.id] || []
    const due = o.due_date
      ? new Date(o.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      : null
    return `${o.order_no}${due ? ` · Due: ${due}` : ''} · ${items.length} item${items.length !== 1 ? 's' : ''} open`
  }

  function machineLabel(m) {
    if (m.machine_code && m.machine_type) return `${m.machine_code} · ${m.machine_type}`
    return m.machine_name
  }

  function avgLossRate(screw_id, machine_id) {
    if (!screw_id || !machine_id) return 0.03
    const hist = entries.filter(e =>
      e.screw_id === screw_id && e.machine_id === machine_id &&
      (e.expected_nos || 0) > 0 && (e.output_nos || 0) >= 0
    ).slice(0, 10)
    if (!hist.length) return 0.03
    const rate = hist.reduce((s, e) =>
      s + Math.max(0, (e.expected_nos - e.output_nos) / e.expected_nos), 0) / hist.length
    return Math.min(0.3, rate)
  }

  function wireIdForScrew(screw_id) {
    return screws.find(s => s.id === screw_id)?.rm_wire_id || ''
  }

  // ── single form field change ──

  function setSingleField(field, val) {
    setSingle(prev => {
      const s = { ...prev, [field]: val }

      if (field === 'customer_id') {
        s.order_id = ''; s.order_item_id = ''; s.screw_id = ''; s.wire_id = ''
      }
      if (field === 'order_id') {
        s.order_item_id = ''; s.screw_id = ''; s.wire_id = ''
        const items = openItemsMap[val] || []
        if (items.length === 1) {
          s.order_item_id = items[0].id
          s.screw_id      = items[0].screw_id
          s.wire_id       = items[0].screw?.rm_wire_id || wireIdForScrew(items[0].screw_id)
        }
      }
      if (field === 'order_item_id') {
        const items = openItemsMap[s.order_id] || []
        const item = items.find(i => i.id === val)
        if (item) {
          s.screw_id = item.screw_id
          s.wire_id  = item.screw?.rm_wire_id || wireIdForScrew(item.screw_id)
        }
      }
      if (field === 'screw_id') {
        s.wire_id = wireIdForScrew(val)
      }
      if (field === 'actual_output_kg' && val && parseFloat(val) > 0) {
        if (!prev.wire_issued_kg || parseFloat(prev.wire_issued_kg) === parseFloat(prev.actual_output_kg)) {
          s.wire_issued_kg = val
        }
      }
      return s
    })
  }

  // ── derived live calculations ──

  const convRatio   = convMap[single.screw_id]?.conversion_ratio_per_kg || 0
  const outKg       = parseFloat(single.actual_output_kg) || 0
  const wireKg      = parseFloat(single.wire_issued_kg) || 0
  const outputPcs   = convRatio > 0 && outKg > 0 ? Math.round(outKg * convRatio) : 0
  const expectedPcs = convRatio > 0 && wireKg > 0 ? Math.round(wireKg * convRatio) : 0
  const lossKg      = Math.max(0, wireKg - outKg)
  const lossPct     = wireKg > 0 ? (lossKg / wireKg * 100) : 0
  const lossStatus  = lossPct < 3 ? 'ok' : lossPct < 7 ? 'watch' : 'high'
  const lossColor   = { ok: 'var(--green)', watch: '#B45309', high: 'var(--red)' }[lossStatus]
  const lossLabel   = { ok: '✓ Normal', watch: '⚠ Watch', high: '✗ High Loss' }[lossStatus]
  const availStock  = single.wire_id != null ? (wireStockMap[single.wire_id] ?? null) : null
  const stockOk     = availStock === null || wireKg <= availStock

  // ── validate ──

  function validateSingle() {
    const e = {}
    if (!single.machine_id) e.machine_id = 'Select machine.'
    if (!single.screw_id) e.screw_id = 'Select screw type.'
    if (!single.wire_id) e.wire_id = 'Select wire type.'
    const outVal = parseFloat(single.actual_output_kg)
    if (!single.actual_output_kg || isNaN(outVal) || outVal <= 0) e.actual_output_kg = 'Enter actual output (kg).'
    const wireVal = parseFloat(single.wire_issued_kg)
    if (!single.wire_issued_kg || isNaN(wireVal) || wireVal <= 0) e.wire_issued_kg = 'Enter wire issued (kg).'
    else if (wireVal < outVal) e.wire_issued_kg = 'Wire issued must be ≥ actual output weight.'
    else if (availStock !== null && wireVal > availStock) {
      e.wire_issued_kg = `Insufficient stock. Available: ${availStock.toFixed(2)} kg, Requested: ${wireVal.toFixed(2)} kg.`
    }
    return e
  }

  // ── save single ──

  async function saveSingle(ev) {
    ev.preventDefault()
    const errs = validateSingle()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)

    const wireVal      = parseFloat(single.wire_issued_kg)
    const output_nos   = outputPcs || 0
    const expected_nos = expectedPcs || null

    if (editEntryId) {
      const { error } = await supabase.from('production_entries').update({
        machine_id:   single.machine_id,
        wire_id:      single.wire_id,
        screw_id:     single.screw_id,
        wire_used_kg: wireVal,
        expected_nos,
        output_nos,
        notes:        single.notes.trim() || null,
      }).eq('id', editEntryId)

      if (!error && single.wire_id) {
        const diff = wireVal - origWireKg
        if (Math.abs(diff) > 0.001) {
          await supabase.from('rm_lot').insert({
            lot_date:    today(),
            wire_id:     single.wire_id,
            txn_type:    'Production',
            quantity_kg: -diff,
            notes:       'Wire adjustment — production entry edited',
            created_by:  user?.id,
          })
        }
      }

      setSaving(false)
      if (error) { setErrors({ _: error.message }); return }
    } else {
      const { error } = await supabase.from('production_entries').insert({
        entry_date:   today(),
        order_id:     single.order_id || null,
        machine_id:   single.machine_id,
        wire_id:      single.wire_id,
        screw_id:     single.screw_id,
        wire_used_kg: wireVal,
        expected_nos,
        output_nos,
        notes:        single.notes.trim() || null,
        created_by:   user?.id,
      })

      if (!error && single.wire_id && wireVal > 0) {
        await supabase.from('rm_lot').insert({
          lot_date:    today(),
          wire_id:     single.wire_id,
          txn_type:    'Production',
          quantity_kg: -wireVal,
          order_id:    single.order_id || null,
          notes:       'Wire deducted for production',
          created_by:  user?.id,
        })
      }

      setSaving(false)
      if (error) { setErrors({ _: error.message }); return }
    }

    setEditEntryId(null)
    setOrigWireKg(0)
    setSingle(EMPTY)
    setShowForm(false)
    setErrors({})
    load()
  }

  function openEditEntry(entry) {
    const ratio = convMap[entry.screw_id]?.conversion_ratio_per_kg || 0
    const outKgCalc = ratio > 0 ? (entry.output_nos / ratio).toFixed(2) : ''
    setSingle({
      customer_id:   '',
      order_id:      entry.order_id || '',
      machine_id:    entry.machine_id || '',
      wire_id:       entry.wire_id || '',
      order_item_id: '',
      screw_id:      entry.screw_id || '',
      actual_output_kg: outKgCalc,
      wire_issued_kg:   parseFloat(entry.wire_used_kg || 0).toFixed(2),
      notes:         entry.notes || '',
    })
    setOrigWireKg(parseFloat(entry.wire_used_kg || 0))
    setEditEntryId(entry.id)
    setTab('single')
    setShowForm(true)
    setErrors({})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteEntry(entry) {
    if (!window.confirm('Delete this production entry? The wire quantity will be restored to stock.')) return
    await supabase.from('production_entries').delete().eq('id', entry.id)
    const wireKgVal = parseFloat(entry.wire_used_kg || 0)
    if (entry.wire_id && wireKgVal > 0) {
      await supabase.from('rm_lot').insert({
        lot_date:    today(),
        wire_id:     entry.wire_id,
        txn_type:    'Production',
        quantity_kg: wireKgVal,
        notes:       'Wire restored — production entry deleted',
        created_by:  user?.id,
      })
    }
    load()
  }

  // ── multi-row helpers ──

  function setMultiField(idx, field, val) {
    setMulti(rows => rows.map((r, i) => {
      if (i !== idx) return r
      const updated = { ...r, [field]: val }
      if (field === 'screw_id') {
        updated.wire_id = wireIdForScrew(val)
      }
      if (field === 'actual_output_kg' && val && parseFloat(val) > 0) {
        if (!r.wire_issued_kg || parseFloat(r.wire_issued_kg) === parseFloat(r.actual_output_kg)) {
          updated.wire_issued_kg = val
        }
      }
      if (field === 'order_id') {
        updated.screw_id = ''; updated.wire_id = ''
        const items = openItemsMap[val] || []
        if (items.length === 1) {
          updated.screw_id = items[0].screw_id
          updated.wire_id  = wireIdForScrew(items[0].screw_id)
        }
      }
      return updated
    }))
  }

  function calcMultiOutputNos(r) {
    const ratio = convMap[r.screw_id]?.conversion_ratio_per_kg || 0
    const kg = parseFloat(r.actual_output_kg) || 0
    return ratio > 0 && kg > 0 ? Math.round(kg * ratio) : null
  }

  async function saveMulti() {
    const valid = multiRows.filter(r =>
      r.machine_id && r.wire_id && r.screw_id &&
      parseFloat(r.actual_output_kg) > 0 && parseFloat(r.wire_issued_kg) > 0
    )
    if (!valid.length) return
    setSaving(true)
    for (const r of valid) {
      const wireVal = parseFloat(r.wire_issued_kg)
      const outKgR  = parseFloat(r.actual_output_kg)
      const ratio   = convMap[r.screw_id]?.conversion_ratio_per_kg || 0
      const output_nos   = ratio > 0 ? Math.round(outKgR * ratio) : 0
      const expected_nos = ratio > 0 ? Math.round(wireVal * ratio) : null

      const { error } = await supabase.from('production_entries').insert({
        entry_date:   today(),
        order_id:     r.order_id || null,
        machine_id:   r.machine_id,
        wire_id:      r.wire_id,
        screw_id:     r.screw_id,
        wire_used_kg: wireVal,
        expected_nos,
        output_nos,
        notes:        r.notes?.trim() || null,
        created_by:   user?.id,
      })
      if (!error && r.wire_id && wireVal > 0) {
        await supabase.from('rm_lot').insert({
          lot_date: today(), wire_id: r.wire_id, txn_type: 'Production',
          quantity_kg: -wireVal, order_id: r.order_id || null,
          notes: 'Wire deducted for production', created_by: user?.id,
        })
      }
    }
    setSaving(false)
    setMulti([newMultiRow(), newMultiRow()])
    load()
  }

  // ── stats ──

  const totalOutput = entries.reduce((s, e) => s + (e.output_nos || 0), 0)
  const totalWireKg = entries.reduce((s, e) => s + parseFloat(e.wire_used_kg || 0), 0)
  const totalExp    = entries.reduce((s, e) => s + (e.expected_nos || 0), 0)
  const avgLoss     = totalExp > 0 ? (((totalExp - totalOutput) / totalExp) * 100).toFixed(1) : '0.0'

  const activeCusts    = custWithOrders()
  const ordersForCust  = openOrders.filter(o => o.customer_id === single.customer_id)
  const itemsForOrder  = openItemsMap[single.order_id] || []
  const openOrderScrews = (() => {
    const seen = new Set(); const list = []
    for (const items of Object.values(openItemsMap)) {
      for (const item of items) {
        if (!seen.has(item.screw_id)) {
          seen.add(item.screw_id)
          list.push({ id: item.screw_id, screw_code: item.screw?.screw_code, screw_name: item.screw?.screw_name })
        }
      }
    }
    return list.sort((a, b) => (a.screw_code || '').localeCompare(b.screw_code || ''))
  })()
  const orderWires = (() => {
    if (single.order_id) {
      const items = openItemsMap[single.order_id] || []
      const ids = new Set(items.map(it => it.wire_id || it.screw?.rm_wire_id).filter(Boolean))
      const filtered = wires.filter(w => ids.has(w.id))
      return filtered.length ? filtered : wires
    }
    if (single.screw_id) {
      const wid = wireIdForScrew(single.screw_id)
      return wid ? wires.filter(w => w.id === wid) : wires
    }
    return wires
  })()
  const wireHasNoStock = availStock !== null && availStock <= 0

  return (
    <div className="main page-enter">
      <div className="sh">
        <span className="sh-num">04</span>
        <span className="sh-title">PRODUCTION</span>
        <span className="sh-desc">Wire → screws with loss tracking · {entries.length} entries</span>
      </div>

      <div className="stats">
        <div className="stat"><div className="stat-n">{entries.length}</div><div className="stat-l">Total Entries</div></div>
        <div className="stat" style={{ borderLeftColor: 'var(--green)' }}>
          <div className="stat-n" style={{ color: 'var(--green)' }}>{totalOutput.toLocaleString()}</div><div className="stat-l">Output (nos)</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--accent)' }}>
          <div className="stat-n" style={{ color: 'var(--accent)' }}>{totalWireKg.toFixed(1)}</div><div className="stat-l">Wire Used (kg)</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--red)' }}>
          <div className="stat-n" style={{ color: parseFloat(avgLoss) > 5 ? 'var(--red)' : 'var(--green)' }}>{avgLoss}%</div><div className="stat-l">Avg Loss</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }} className="no-print">
        <ExportButton filename="production-entries" />
        <button className="btn-add" onClick={() => { setShowForm(v => !v); setErrors({}) }}>
          {showForm ? '✕ CANCEL' : '+ ADD ENTRY'}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <div className="entry-tabs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              {!editEntryId && ['single', 'multi'].map(t => (
                <button key={t} className={`etab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                  {t === 'single' ? 'SINGLE ENTRY' : 'MULTI-ROW'}
                </button>
              ))}
              {editEntryId && (
                <span style={{ fontFamily: 'var(--cond)', fontSize: 13, fontWeight: 700, letterSpacing: '.06em', color: 'var(--accent)' }}>
                  EDIT ENTRY
                </span>
              )}
            </div>
          </div>

          {/* ── SINGLE ENTRY ── */}
          {tab === 'single' && (
            <form onSubmit={saveSingle}>

              {/* Row 1: Machine · Screw · Wire */}
              <div className="form-grid" style={{ marginBottom: 10 }}>
                <div className="form-group">
                  <label>Machine *</label>
                  <select
                    className={errors.machine_id ? 'error' : ''}
                    value={single.machine_id}
                    onChange={e => setSingleField('machine_id', e.target.value)}
                  >
                    <option value="">— Select machine —</option>
                    {machines.map(m => <option key={m.id} value={m.id}>{machineLabel(m)}</option>)}
                  </select>
                  {errors.machine_id && <span className="field-error">{errors.machine_id}</span>}
                </div>

                <div className="form-group">
                  <label>Screw Type *</label>
                  <ScrewSearch
                    items={screws}
                    value={single.screw_id}
                    onChange={id => setSingleField('screw_id', id || '')}
                    hasError={!!errors.screw_id}
                  />
                  {errors.screw_id && <span className="field-error">{errors.screw_id}</span>}
                </div>

                <div className="form-group">
                  <label>Wire Type *</label>
                  <WireSearch
                    items={wires}
                    value={single.wire_id}
                    onChange={id => setSingleField('wire_id', id)}
                    hasError={!!errors.wire_id}
                  />
                  {errors.wire_id && <span className="field-error">{errors.wire_id}</span>}
                  {single.wire_id && availStock !== null && (
                    <div style={{ fontSize: 10, marginTop: 2, fontFamily: 'var(--cond)', fontWeight: 600, color: wireHasNoStock ? 'var(--red)' : 'var(--green)' }}>
                      Stock: {availStock.toFixed(2)} kg
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: Wire Issued · Output · Live loss strip */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div className="form-group">
                  <label>Wire Issued (kg) *</label>
                  <input
                    type="number" step="0.01" min="0.01"
                    className={errors.wire_issued_kg ? 'error' : ''}
                    value={single.wire_issued_kg}
                    onChange={e => setSingleField('wire_issued_kg', e.target.value)}
                    placeholder="Auto-filled from output"
                  />
                  {errors.wire_issued_kg && <span className="field-error">{errors.wire_issued_kg}</span>}
                  {wireKg > 0 && convRatio > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, fontFamily: 'var(--cond)' }}>
                      Expected: {expectedPcs.toLocaleString()} pcs
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label>Actual Output (kg) *</label>
                  <input
                    type="number" step="0.01" min="0.01"
                    className={errors.actual_output_kg ? 'error' : ''}
                    value={single.actual_output_kg}
                    onChange={e => setSingleField('actual_output_kg', e.target.value)}
                    placeholder="e.g. 12.50"
                  />
                  {errors.actual_output_kg && <span className="field-error">{errors.actual_output_kg}</span>}
                  {outKg > 0 && convRatio > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, fontFamily: 'var(--cond)' }}>
                      Output: {outputPcs.toLocaleString()} pcs
                    </div>
                  )}
                </div>

                {/* Live loss panel — only when both values filled */}
                {outKg > 0 && wireKg > 0 ? (
                  <div style={{
                    background: lossColor + '0f', border: `1.5px solid ${lossColor}44`,
                    borderRadius: 8, padding: '10px 14px', display: 'flex',
                    flexDirection: 'column', justifyContent: 'center', gap: 6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--cond)', fontWeight: 600 }}>LOSS</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--cond)', fontWeight: 800, color: lossColor }}>
                        {lossKg.toFixed(2)} kg
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--cond)', fontWeight: 600 }}>LOSS %</span>
                      <span style={{ fontSize: 15, fontFamily: 'var(--cond)', fontWeight: 800, color: lossColor }}>
                        {lossPct.toFixed(1)}%
                      </span>
                    </div>
                    <div style={{
                      marginTop: 2, padding: '2px 8px', borderRadius: 4, alignSelf: 'flex-start',
                      background: lossColor + '22', border: `1px solid ${lossColor}44`,
                      fontFamily: 'var(--cond)', fontSize: 10, fontWeight: 700, color: lossColor, letterSpacing: '.04em',
                    }}>
                      {lossLabel}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    background: 'var(--bg3)', border: '1.5px dashed var(--border)',
                    borderRadius: 8, padding: '10px 14px', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 10, color: 'var(--dim)', fontFamily: 'var(--cond)', textAlign: 'center', letterSpacing: '.04em' }}>
                      LOSS CALC<br />APPEARS HERE
                    </span>
                  </div>
                )}
              </div>

              {/* Row 3: Note full width */}
              <div className="form-group" style={{ marginBottom: 10 }}>
                <label>Note</label>
                <textarea
                  rows={2} value={single.notes}
                  onChange={e => setSingleField('notes', e.target.value)}
                  placeholder="e.g. Changed wire spool mid-batch, machine speed reduced"
                  style={{ resize: 'vertical', fontFamily: 'var(--font)', fontSize: 12 }}
                />
              </div>

              {errors._ && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{errors._}</div>}

              <div className="form-actions">
                <button className="btn-add" type="submit" disabled={saving}>{saving ? 'SAVING…' : editEntryId ? 'UPDATE ENTRY' : 'SAVE ENTRY'}</button>
                <button className="btn-clear" type="button" onClick={() => { setShowForm(false); setSingle(EMPTY); setEditEntryId(null); setOrigWireKg(0); setErrors({}) }}>CANCEL</button>
              </div>
            </form>
          )}

          {/* ── MULTI-ROW ── */}
          {tab === 'multi' && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, fontFamily: 'var(--cond)', letterSpacing: '.04em' }}>
                Fill rows · blank rows are ignored · click SAVE ALL when done
              </div>
              <div className="multi-row-wrap">
                <table className="multi-row-table">
                  <thead>
                    <tr>
                      <th>Machine</th>
                      <th>Screw</th>
                      <th>Wire</th>
                      <th>Output (kg)</th>
                      <th>Wire Issued (kg)</th>
                      <th>Note</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {multiRows.map((r, i) => {
                      const outPcs = calcMultiOutputNos(r)
                      const lossKgR = Math.max(0, (parseFloat(r.wire_issued_kg) || 0) - (parseFloat(r.actual_output_kg) || 0))
                      const itemsForRow = openItemsMap[r.order_id] || []
                      return (
                        <tr key={r._id}>
                          <td>
                            <select className="mri-sel" value={r.machine_id} onChange={e => setMultiField(i, 'machine_id', e.target.value)} style={{ minWidth: 100 }}>
                              <option value="">—</option>
                              {machines.map(m => <option key={m.id} value={m.id}>{machineLabel(m)}</option>)}
                            </select>
                          </td>
                          <td>
                            <select className="mri-sel" value={r.screw_id} onChange={e => setMultiField(i, 'screw_id', e.target.value)} style={{ minWidth: 130 }}>
                              <option value="">—</option>
                              {screws.map(s => <option key={s.id} value={s.id}>{s.screw_code}</option>)}
                            </select>
                          </td>
                          <td>
                            <select className="mri-sel" value={r.wire_id} onChange={e => setMultiField(i, 'wire_id', e.target.value)} style={{ minWidth: 110 }}>
                              <option value="">—</option>
                              {wires.map(w => <option key={w.id} value={w.id}>{w.diameter_mm}mm – {w.grade}</option>)}
                            </select>
                          </td>
                          <td>
                            <input type="number" step="0.01" className="mri" style={{ width: 80 }}
                              value={r.actual_output_kg}
                              onChange={e => setMultiField(i, 'actual_output_kg', e.target.value)}
                              placeholder="kg" />
                          </td>
                          <td>
                            <input type="number" step="0.01" className="mri" style={{ width: 90 }}
                              value={r.wire_issued_kg}
                              onChange={e => setMultiField(i, 'wire_issued_kg', e.target.value)}
                              placeholder="kg" />
                          </td>
                          <td>
                            <input className="mri" style={{ minWidth: 120 }} value={r.notes}
                              onChange={e => setMultiField(i, 'notes', e.target.value)}
                              placeholder="Optional" />
                          </td>
                          <td><button className="del-row-btn" onClick={() => setMulti(rows => rows.filter((_, j) => j !== i))}>×</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <button className="add-row-btn" onClick={() => setMulti(r => [...r, newMultiRow()])}>+ ADD ROW</button>
              <div className="form-actions" style={{ marginTop: 10 }}>
                <button className="save-all-btn" onClick={saveMulti} disabled={saving}>{saving ? 'SAVING…' : 'SAVE ALL ROWS'}</button>
                <span className="save-count">
                  {multiRows.filter(r => r.machine_id && r.wire_id && r.screw_id && r.actual_output_kg && r.wire_issued_kg).length} rows ready
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Entries table ── */}
      <div className="tbl-wrap">
        <table data-export>
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>Date</th>
              <th>Order</th>
              <th>Machine</th>
              <th>Wire</th>
              <th>Screw</th>
              <th style={{ textAlign: 'right' }}>Wire Used (kg)</th>
              <th style={{ textAlign: 'right' }}>Expected</th>
              <th style={{ textAlign: 'right' }}>Output (nos)</th>
              <th style={{ textAlign: 'right' }}>Loss</th>
              <th style={{ textAlign: 'right' }}>Loss %</th>
              <th data-no-export>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={12} className="empty">Loading…</td></tr>}
            {!loading && entries.length === 0 && <tr><td colSpan={12} className="empty">No production entries yet.</td></tr>}
            {entries.map((e, i) => {
              const loss    = e.expected_nos != null ? Math.max(e.expected_nos - e.output_nos, 0) : null
              const lossPct = e.expected_nos ? ((Math.max(e.expected_nos - e.output_nos, 0) / e.expected_nos) * 100).toFixed(1) : null
              return (
                <tr key={e.id}>
                  <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{e.entry_date}</td>
                  <td style={{ fontSize: 12 }}>{e.order?.order_no || '—'}</td>
                  <td style={{ fontSize: 12 }}>{e.machine?.machine_code || e.machine?.machine_name || '—'}</td>
                  <td style={{ fontSize: 12 }}>{e.wire ? `${e.wire.diameter_mm}mm – ${e.wire.grade}` : '—'}</td>
                  <td><span style={{ fontFamily: 'var(--cond)', fontWeight: 600, fontSize: 12 }}>{e.screw?.screw_code}</span></td>
                  <td className="num-cell" style={{ textAlign: 'right' }}>{parseFloat(e.wire_used_kg).toFixed(2)}</td>
                  <td className="num-cell" style={{ textAlign: 'right', color: 'var(--muted)' }}>{e.expected_nos?.toLocaleString() || '—'}</td>
                  <td className="num-cell" style={{ textAlign: 'right', color: 'var(--green)' }}>{e.output_nos.toLocaleString()}</td>
                  <td className="num-cell" style={{ textAlign: 'right', color: loss > 0 ? 'var(--red)' : 'var(--dim)' }}>{loss?.toLocaleString() ?? '—'}</td>
                  <td style={{ textAlign: 'right', fontSize: 12, color: parseFloat(lossPct) > 5 ? 'var(--red)' : 'var(--green)' }}>{lossPct ? `${lossPct}%` : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-icon" style={{ fontSize: 10, color: 'var(--blue)' }} onClick={() => openEditEntry(e)}>EDIT</button>
                      <button className="btn-icon" style={{ fontSize: 10, color: 'var(--red)' }} onClick={() => deleteEntry(e)}>DELETE</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {!loading && entries.length > 0 && (() => {
            const tw = entries.reduce((s, e) => s + parseFloat(e.wire_used_kg || 0), 0)
            const te = entries.reduce((s, e) => s + (e.expected_nos || 0), 0)
            const to = entries.reduce((s, e) => s + (e.output_nos || 0), 0)
            const tl = Math.max(te - to, 0)
            const TFD = (c, ex = {}) => <td style={{ padding: '7px 8px', fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 11, background: '#f5f4f2', borderTop: '2px solid var(--border2)', ...ex }}>{c}</td>
            return (
              <tfoot>
                <tr>
                  {TFD(`TOTAL — ${entries.length} entries`, { colSpan: 6, letterSpacing: '.04em' })}
                  {TFD(tw.toFixed(2), { textAlign: 'right' })}
                  {TFD(te > 0 ? te.toLocaleString() : '—', { textAlign: 'right', color: 'var(--muted)' })}
                  {TFD(to.toLocaleString(), { textAlign: 'right', color: 'var(--green)' })}
                  {TFD(tl > 0 ? tl.toLocaleString() : '—', { textAlign: 'right', color: tl > 0 ? 'var(--red)' : 'var(--dim)' })}
                  {TFD('', { colSpan: 2 })}
                </tr>
              </tfoot>
            )
          })()}
        </table>
      </div>

      <OrdersBrief
        openOrders={openOrders}
        openItemsMap={openItemsMap}
        customers={customers}
        wires={wires}
        convMap={convMap}
        wireStockMap={wireStockMap}
        fgAvailable={fgAvailable}
      />
    </div>
  )
}
