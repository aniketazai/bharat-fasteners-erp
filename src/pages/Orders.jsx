import { useEffect, useState, Fragment } from 'react'
import { ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import ExportButton from '../components/ExportButton'

const STATUS_OPTS = ['Open', 'In Progress', 'Partial', 'Completed', 'Cancelled']
const BADGE = { 'Open': 'b-blue', 'In Progress': 'b-orange', 'Partial': 'b-orange', 'Completed': 'b-ok', 'Cancelled': 'b-warn' }
const today = () => new Date().toISOString().slice(0, 10)
const fmtDate = d => { if (!d) return '—'; const [y, m, dy] = d.split('-'); return `${dy}/${m}/${y.slice(2)}` }

async function nextOrderNo() {
  // Scan ALL order numbers and take the highest ORD-#### suffix, not just the
  // most recently created row — a single out-of-pattern or out-of-order record
  // used to cause duplicate order numbers (and a failed insert) here.
  const { data } = await supabase.from('orders').select('order_no')
  let max = 0
  for (const row of data || []) {
    const m = row.order_no?.match(/^ORD-(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `ORD-${String(max + 1).padStart(4, '0')}`
}

const EMPTY_HDR = { order_no: '', order_date: today(), customer_id: '', due_date: '', invoice_no: '', notes: '' }
const newItem = () => ({ _key: Math.random(), id: undefined, screw_id: '', wire_id: '', order_qty: '', dispatched_qty: 0 })

export default function Orders() {
  const { user } = useAuth()

  const [orders, setOrders]       = useState([])
  const [allItems, setAllItems]   = useState({})   // order_id → [items]
  const [expanded, setExpanded]   = useState({})   // order_id → bool
  const [customers, setCust]      = useState([])
  const [screws, setScrews]       = useState([])
  const [wires, setWires]         = useState([])
  const [convMap, setConvMap]     = useState({})   // screw_id → [wire_id, ...]
  const [ratioMap, setRatioMap]   = useState({})   // screw_id → conversion_ratio_per_kg
  const [fgMap, setFgMap]         = useState({})   // screw_id → { fgReady, pendingPlating }
  const [loading, setLoading]     = useState(true)

  const [showForm, setShowForm]   = useState(false)
  const [editId, setEditId]       = useState(null)
  const [hdr, setHdr]             = useState(EMPTY_HDR)
  const [items, setItems]         = useState([newItem()])
  const [origItems, setOrigItems] = useState([])
  const [errors, setErrors]       = useState({})
  const [saving, setSaving]       = useState(false)

  const [filterStatus, setFS]     = useState('All')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [oRes, iRes, cRes, sRes, wRes, cvRes, prodRes, platRes, openRes] = await Promise.all([
      supabase.from('orders')
        .select('*, customer:customer_id(customer_name)')
        .order('created_at', { ascending: false }),
      supabase.from('order_items')
        .select('*, screw:screw_id(screw_code,screw_name), wire:wire_id(diameter_mm,grade)')
        .order('created_at'),
      supabase.from('customer_master').select('id,customer_name').eq('status','Active').order('customer_name'),
      supabase.from('output_screw_master').select('id,screw_code,screw_name,rm_wire_id').eq('status','Active').order('screw_code'),
      supabase.from('rm_wire_master').select('id,diameter_mm,grade').order('diameter_mm'),
      supabase.from('conversion_master').select('screw_id,wire_id,conversion_ratio_per_kg'),
      supabase.from('production_entries').select('screw_id, output_nos'),
      supabase.from('plating_entries').select('screw_id, received_qty_nos'),
      supabase.from('fg_opening_stock').select('screw_id, quantity_nos, stock_type, direction'),
    ])

    setOrders(oRes.data || [])
    const im = {}
    for (const it of (iRes.data || [])) {
      if (!im[it.order_id]) im[it.order_id] = []
      im[it.order_id].push(it)
    }
    setAllItems(im)
    setCust(cRes.data || [])
    setScrews(sRes.data || [])
    setWires(wRes.data || [])

    const cm = {}
    for (const cv of (cvRes.data || [])) {
      if (!cm[cv.screw_id]) cm[cv.screw_id] = []
      cm[cv.screw_id].push(cv.wire_id)
    }
    setConvMap(cm)

    // ratio map: screw_id → conversion_ratio_per_kg (first available)
    const rm = {}
    for (const cv of (cvRes.data || [])) {
      if (!rm[cv.screw_id] && cv.conversion_ratio_per_kg) rm[cv.screw_id] = cv.conversion_ratio_per_kg
    }
    setRatioMap(rm)

    // ── FG / Plating sync (same logic as the Finished Goods page) ──────────
    // Plating and production are tracked per SCREW TYPE, not per order — a
    // single plating batch can cover several orders at once. So "FG Ready"
    // and "Pending Plating" below are pooled per screw code, not a strict
    // per-order reservation.
    const produced = {}
    for (const p of (prodRes.data || [])) {
      if (!p.screw_id) continue
      produced[p.screw_id] = (produced[p.screw_id] || 0) + (p.output_nos || 0)
    }
    const plated = {}
    for (const p of (platRes.data || [])) {
      if (!p.screw_id) continue
      plated[p.screw_id] = (plated[p.screw_id] || 0) + (p.received_qty_nos || 0)
    }
    for (const o of (openRes.data || [])) {
      if (!o.screw_id) continue
      const signed = o.direction === 'REMOVE' ? -(o.quantity_nos || 0) : (o.quantity_nos || 0)
      produced[o.screw_id] = (produced[o.screw_id] || 0) + signed
      if (o.stock_type === 'PLATED') plated[o.screw_id] = (plated[o.screw_id] || 0) + signed
    }
    // Global dispatched per screw = sum of dispatched_qty across ALL order items for that screw
    const dispatchedByScrew = {}
    for (const it of (iRes.data || [])) {
      if (!it.screw_id) continue
      dispatchedByScrew[it.screw_id] = (dispatchedByScrew[it.screw_id] || 0) + (it.dispatched_qty || 0)
    }
    const fg = {}
    const screwIds = new Set([...Object.keys(produced), ...Object.keys(plated)])
    for (const sid of screwIds) {
      const prod = produced[sid] || 0
      const plt  = plated[sid] || 0
      const disp = dispatchedByScrew[sid] || 0
      fg[sid] = {
        fgReady:        Math.max(plt - disp, 0),
        pendingPlating: Math.max(prod - plt, 0),
      }
    }
    setFgMap(fg)

    setLoading(false)
  }

  function toggleExpand(ordId) {
    setExpanded(p => ({ ...p, [ordId]: !p[ordId] }))
  }

  // ── Form open/close ──────────────────────────────────────────────────────

  async function openNew() {
    const no = await nextOrderNo()
    setHdr({ ...EMPTY_HDR, order_no: no, order_date: today() })
    setItems([newItem()])
    setOrigItems([])
    setEditId(null)
    setErrors({})
    setShowForm(true)
  }

  function openEdit(o) {
    const ois = allItems[o.id] || []
    setHdr({
      order_no:    o.order_no || '',
      order_date:  o.order_date || today(),
      customer_id: o.customer_id || '',
      due_date:    o.due_date || '',
      invoice_no:  o.invoice_no || '',
      notes:       o.notes || '',
    })
    setItems(ois.map(i => ({
      _key:          i.id,
      id:            i.id,
      screw_id:      i.screw_id || '',
      wire_id:       i.wire_id  || '',
      order_qty:     i.order_qty?.toString() || '',
      dispatched_qty: i.dispatched_qty || 0,
    })))
    setOrigItems(ois)
    setEditId(o.id)
    setErrors({})
    setShowForm(true)
  }

  function closeForm() { setShowForm(false); setEditId(null); setErrors({}) }

  // ── Item form helpers ────────────────────────────────────────────────────

  function setItemField(idx, field, val) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const updated = { ...it, [field]: val }
      if (field === 'screw_id') {
        // auto-fill wire from screw master rm_wire_id (overrideable)
        const screwInfo = screws.find(s => s.id === val)
        updated.wire_id = screwInfo?.rm_wire_id || ''
      }
      return updated
    }))
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function wiresForScrew(screw_id) {
    if (!screw_id) return wires
    const linked = convMap[screw_id] || []
    return linked.length > 0 ? wires.filter(w => linked.includes(w.id)) : wires
  }

  // ── Validation ───────────────────────────────────────────────────────────

  function validate() {
    const e = {}
    if (!editId && !hdr.order_no.trim()) e._order_no = 'Order number required.'
    if (!hdr.customer_id) e._customer = 'Select a customer.'
    if (items.length === 0) e._items = 'Add at least one item.'
    items.forEach((it, i) => {
      if (!it.screw_id) e[`s${i}`] = 'Select screw.'
      const qty = parseInt(it.order_qty)
      if (!it.order_qty || isNaN(qty) || qty <= 0) e[`q${i}`] = 'Valid quantity required.'
    })
    return e
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave(ev) {
    ev.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)

    if (editId) {
      // invoice_no is now saved in the SAME call as the other header fields
      // (previously a second, separate call whose errors were silently
      // ignored — that's why clearing/editing the invoice number could look
      // like it "didn't work": it failed quietly and the old value came back
      // on reload).
      const { error: hErr } = await supabase.from('orders').update({
        order_date:  hdr.order_date || today(),
        customer_id: hdr.customer_id,
        due_date:    hdr.due_date || null,
        notes:       hdr.notes.trim() || null,
        invoice_no:  hdr.invoice_no?.trim() || null,
      }).eq('id', editId)
      if (hErr) { setErrors({ _: `Could not save: ${hErr.message}` }); setSaving(false); return }

      const curIds = new Set(items.filter(i => i.id).map(i => i.id))
      const toDelete = origItems.filter(oi => !curIds.has(oi.id) && oi.dispatched_qty === 0).map(oi => oi.id)
      if (toDelete.length) await supabase.from('order_items').delete().in('id', toDelete)

      for (const item of items.filter(i => i.id)) {
        const orig = origItems.find(oi => oi.id === item.id)
        if (orig && orig.dispatched_qty === 0) {
          await supabase.from('order_items').update({
            screw_id:  item.screw_id,
            wire_id:   item.wire_id || null,
            order_qty: parseInt(item.order_qty),
          }).eq('id', item.id)
        }
      }

      const newItems = items.filter(i => !i.id)
      if (newItems.length) {
        await supabase.from('order_items').insert(newItems.map(i => ({
          order_id:  editId,
          screw_id:  i.screw_id,
          wire_id:   i.wire_id || null,
          order_qty: parseInt(i.order_qty),
        })))
      }

    } else {
      let orderNo = hdr.order_no.trim().toUpperCase()
      let data, oErr
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await supabase.from('orders').insert({
          order_no:    orderNo,
          order_date:  hdr.order_date || today(),
          customer_id: hdr.customer_id,
          due_date:    hdr.due_date || null,
          notes:       hdr.notes.trim() || null,
          invoice_no:  hdr.invoice_no?.trim() || null,
          created_by:  user?.id,
        }).select()
        data = res.data; oErr = res.error
        // 23505 = Postgres unique-violation. If it's specifically the order_no
        // that collided (e.g. two people saved at the same moment), regenerate
        // the next number and try again instead of just failing.
        if (oErr?.code === '23505' && oErr.message?.includes('order_no')) {
          orderNo = await nextOrderNo()
          continue
        }
        break
      }
      if (oErr || !data?.length) { setErrors({ _: `Could not create order: ${oErr?.message || 'unknown error'}` }); setSaving(false); return }

      const { error: iErr } = await supabase.from('order_items').insert(items.map(i => ({
        order_id:  data[0].id,
        screw_id:  i.screw_id,
        wire_id:   i.wire_id || null,
        order_qty: parseInt(i.order_qty),
      })))
      if (iErr) { setErrors({ _: `Order created but items failed to save: ${iErr.message}` }); setSaving(false); return }
    }

    setSaving(false)
    closeForm()
    load()
  }

  async function setStatus(id, status) {
    await supabase.from('orders').update({ status }).eq('id', id)
    load()
  }

  async function deleteOrder(o) {
    if (!window.confirm(`Delete order ${o.order_no}? This cannot be undone.`)) return
    await supabase.from('dispatch_entries').delete().eq('order_id', o.id)
    await supabase.from('order_items').delete().eq('order_id', o.id)
    const { error } = await supabase.from('orders').delete().eq('id', o.id)
    if (error) { alert('Delete failed: ' + error.message); return }
    load()
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  function orderTotals(ordId) {
    const its = allItems[ordId] || []
    return {
      count:    its.length,
      totalQty: its.reduce((s, i) => s + (i.order_qty || 0), 0),
      totalDisp: its.reduce((s, i) => s + (i.dispatched_qty || 0), 0),
      fgReady:        its.reduce((s, i) => s + (fgMap[i.screw_id]?.fgReady || 0), 0),
      pendingPlating: its.reduce((s, i) => s + (fgMap[i.screw_id]?.pendingPlating || 0), 0),
    }
  }

  const filtered = filterStatus === 'All' ? orders : orders.filter(o => o.status === filterStatus)
  const stats = {
    total:  orders.length,
    open:   orders.filter(o => o.status === 'Open').length,
    inprog: orders.filter(o => o.status === 'In Progress').length,
    done:   orders.filter(o => o.status === 'Completed').length,
  }

  const thStyle = {
    textAlign: 'left', color: 'var(--muted)', fontSize: 10,
    fontFamily: 'var(--cond)', fontWeight: 600, letterSpacing: '.06em',
    padding: '5px 8px', borderBottom: '1px solid var(--border)',
  }

  return (
    <div className="main page-enter">
      <div className="sh">
        <span className="sh-num">01</span>
        <span className="sh-title">ORDERS</span>
        <span className="sh-desc">Customer order management · {orders.length} orders</span>
      </div>

      <div className="stats">
        <div className="stat"><div className="stat-n">{stats.total}</div><div className="stat-l">Total</div></div>
        <div className="stat" style={{ borderLeftColor: 'var(--blue)' }}>
          <div className="stat-n" style={{ color: 'var(--blue)' }}>{stats.open}</div><div className="stat-l">Open</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--accent)' }}>
          <div className="stat-n" style={{ color: 'var(--accent)' }}>{stats.inprog}</div><div className="stat-l">In Progress</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--green)' }}>
          <div className="stat-n" style={{ color: 'var(--green)' }}>{stats.done}</div><div className="stat-l">Completed</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10 }} className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--cond)', fontWeight: 600, letterSpacing: '.05em' }}>STATUS</label>
          <select value={filterStatus} onChange={e => setFS(e.target.value)}
            style={{ fontSize: 12, padding: '6px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontFamily: 'var(--font)', outline: 'none' }}>
            <option value="All">All</option>
            {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <ExportButton filename="orders" />
          <button className="btn-add" onClick={openNew}>+ NEW ORDER</button>
        </div>
      </div>

      {/* ── Form ── */}
      {showForm && (
        <div className="form-card">
          <div className="form-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{editId ? `EDIT ORDER — ${hdr.order_no}` : 'NEW ORDER'}</span>
            <button className="btn-clear" style={{ margin: 0 }} onClick={closeForm}>✕</button>
          </div>
          <form onSubmit={handleSave}>

            {/* Header fields */}
            <div className="form-grid">
              <div className="form-group">
                <label>Order No *</label>
                <input className={errors._order_no ? 'error' : ''} value={hdr.order_no}
                  onChange={e => setHdr(h => ({ ...h, order_no: e.target.value }))}
                  placeholder="ORD-0001" readOnly={!!editId}
                  style={editId ? { background: 'var(--bg4)', color: 'var(--muted)', cursor: 'not-allowed' } : {}} />
                {errors._order_no && <span className="field-error">{errors._order_no}</span>}
              </div>
              <div className="form-group">
                <label>Invoice No</label>
                <input value={hdr.invoice_no} onChange={e => setHdr(h => ({ ...h, invoice_no: e.target.value }))} placeholder="e.g. INV-0001" />
              </div>
              <div className="form-group">
                <label>Order Date</label>
                <input type="date" value={hdr.order_date} onChange={e => setHdr(h => ({ ...h, order_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Due Date</label>
                <input type="date" value={hdr.due_date} onChange={e => setHdr(h => ({ ...h, due_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Customer *</label>
                <select className={errors._customer ? 'error' : ''} value={hdr.customer_id}
                  onChange={e => setHdr(h => ({ ...h, customer_id: e.target.value }))}>
                  <option value="">— Select customer —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.customer_name}</option>)}
                </select>
                {errors._customer && <span className="field-error">{errors._customer}</span>}
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Notes</label>
                <input value={hdr.notes} onChange={e => setHdr(h => ({ ...h, notes: e.target.value }))} placeholder="Optional notes" />
              </div>
            </div>

            {/* Line items */}
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontFamily: 'var(--cond)', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--muted)', textTransform: 'uppercase' }}>
                  Line Items
                </span>
                {errors._items && <span className="field-error">{errors._items}</span>}
              </div>

              <div className="tbl-wrap" style={{ margin: 0, marginBottom: 8 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 24 }}>#</th>
                      <th>Screw Type *</th>
                      <th>RM Wire</th>
                      <th style={{ textAlign: 'right' }}>Current Stock</th>
                      <th style={{ textAlign: 'right' }}>Order Qty (nos) *</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => {
                      const locked = item.id && item.dispatched_qty > 0
                      const avWires = wiresForScrew(item.screw_id)
                      return (
                        <tr key={item._key}>
                          <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                          <td>
                            {locked
                              ? <span style={{ fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 12 }}>
                                  {screws.find(s => s.id === item.screw_id)?.screw_name || '—'}
                                  <span style={{ fontSize: 9, color: 'var(--accent)', marginLeft: 5 }}>●dispatched</span>
                                </span>
                              : <select className={errors[`s${i}`] ? 'error' : ''} value={item.screw_id}
                                  onChange={e => setItemField(i, 'screw_id', e.target.value)}
                                  style={{ width: '100%' }}>
                                  <option value="">— Select screw —</option>
                                  {screws.map(s => <option key={s.id} value={s.id}>{s.screw_name}</option>)}
                                </select>
                            }
                            {errors[`s${i}`] && <span className="field-error">{errors[`s${i}`]}</span>}
                          </td>
                          <td>
                            {locked
                              ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                                  {item.wire_id ? (wires.find(w => w.id === item.wire_id) ? `${wires.find(w => w.id === item.wire_id).diameter_mm}mm – ${wires.find(w => w.id === item.wire_id).grade}` : '—') : '—'}
                                </span>
                              : <>
                                  <select value={item.wire_id}
                                    onChange={e => setItemField(i, 'wire_id', e.target.value)}
                                    style={{ width: '100%' }}>
                                    <option value="">— Wire (optional) —</option>
                                    {avWires.map(w => <option key={w.id} value={w.id}>{w.diameter_mm}mm – {w.grade}</option>)}
                                  </select>
                                  {item.screw_id && !screws.find(s => s.id === item.screw_id)?.rm_wire_id && (
                                    <div style={{ fontSize: 10, color: '#B45309', marginTop: 3 }}>
                                      ⚠ No wire mapped in master. Select manually.
                                    </div>
                                  )}
                                </>
                            }
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {item.screw_id
                              ? <span style={{ fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 13, color: (fgMap[item.screw_id]?.fgReady || 0) > 0 ? 'var(--green)' : 'var(--dim)' }}
                                  title="Finished-goods stock currently ready to dispatch">
                                  {(fgMap[item.screw_id]?.fgReady || 0).toLocaleString()}
                                </span>
                              : <span style={{ color: 'var(--dim)' }}>—</span>
                            }
                          </td>
                          <td>
                            {locked
                              ? <span style={{ fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 13, color: 'var(--muted)', display: 'block', textAlign: 'right' }}>
                                  {parseInt(item.order_qty).toLocaleString()}
                                </span>
                              : <input type="number" min="1"
                                  className={errors[`q${i}`] ? 'error' : ''}
                                  value={item.order_qty}
                                  onChange={e => setItemField(i, 'order_qty', e.target.value)}
                                  style={{ width: '100%', textAlign: 'right' }}
                                  placeholder="e.g. 5000" />
                            }
                            {errors[`q${i}`] && <span className="field-error">{errors[`q${i}`]}</span>}
                            {!locked && item.screw_id && item.order_qty && parseInt(item.order_qty) > (fgMap[item.screw_id]?.fgReady || 0) && (
                              <div style={{ fontSize: 10, color: '#B45309', marginTop: 3, textAlign: 'right' }}>
                                ⚠ Exceeds stock by {(parseInt(item.order_qty) - (fgMap[item.screw_id]?.fgReady || 0)).toLocaleString()}
                              </div>
                            )}
                            {item.screw_id && item.order_qty && ratioMap[item.screw_id] && (
                              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, textAlign: 'right' }}>
                                Est. RM: {(parseInt(item.order_qty) / ratioMap[item.screw_id]).toFixed(2)} kg
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {locked
                              ? <span title="Has dispatched qty — cannot remove" style={{ fontSize: 14, color: 'var(--dim)', cursor: 'default' }}>🔒</span>
                              : <button type="button"
                                  onClick={() => removeItem(i)}
                                  style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 16, cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}>×</button>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <button type="button" className="add-row-btn"
                onClick={() => setItems(prev => [...prev, newItem()])}>
                + ADD ITEM
              </button>
            </div>

            {errors._ && <div style={{ marginTop: 8, color: 'var(--red)', fontSize: 12 }}>{errors._}</div>}

            <div className="form-actions">
              <button className="btn-add" type="submit" disabled={saving}>
                {saving ? 'SAVING…' : editId ? 'UPDATE ORDER' : 'SAVE ORDER'}
              </button>
              <button className="btn-clear" type="button" onClick={closeForm}>CANCEL</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Orders table ── */}
      <div className="tbl-wrap">
        <table data-export>
          <thead>
            <tr>
              <th style={{ width: 28 }} data-no-export></th>
              <th style={{ width: 28 }}>#</th>
              <th>Order No</th>
              <th>Invoice No</th>
              <th>Date</th>
              <th>Customer</th>
              <th style={{ textAlign: 'center' }}>Items</th>
              <th style={{ textAlign: 'right' }}>Total Qty</th>
              <th style={{ textAlign: 'right' }}>Dispatched</th>
              <th style={{ textAlign: 'right' }}>FG Ready</th>
              <th style={{ textAlign: 'right' }}>Pending Plating</th>
              <th>Status</th>
              <th>Due</th>
              <th data-no-export>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={14} className="empty">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={14} className="empty">No orders found.</td></tr>}
            {filtered.map((o, i) => {
              const tots    = orderTotals(o.id)
              const rem     = Math.max(tots.totalQty - tots.totalDisp, 0)
              const overdue = o.due_date && !['Completed','Cancelled'].includes(o.status) && new Date(o.due_date) < new Date()
              const isExp   = !!expanded[o.id]
              const ois     = allItems[o.id] || []

              return (
                <Fragment key={o.id}>
                  <tr className={overdue ? 'overdue-row' : ''}>
                    <td>
                      <button onClick={() => toggleExpand(o.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>
                        <ChevronDown size={13} style={{ transition: 'transform .2s', transform: isExp ? 'rotate(180deg)' : 'none' }} />
                      </button>
                    </td>
                    <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                    <td><span style={{ fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 13 }}>{o.order_no}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{o.invoice_no || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(o.order_date)}</td>
                    <td style={{ fontSize: 13 }}>{o.customer?.customer_name || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontFamily: 'var(--cond)', fontSize: 11, fontWeight: 700 }}>{tots.count}</span>
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}> item{tots.count !== 1 ? 's' : ''}</span>
                    </td>
                    <td className="num-cell" style={{ textAlign: 'right' }}>{tots.totalQty.toLocaleString()}</td>
                    <td className="num-cell" style={{ textAlign: 'right', color: tots.totalDisp > 0 ? 'var(--green)' : 'var(--dim)' }}>
                      {tots.totalDisp.toLocaleString()}
                    </td>
                    <td className="num-cell" style={{ textAlign: 'right', color: tots.fgReady > 0 ? 'var(--green)' : 'var(--dim)', fontWeight: tots.fgReady > 0 ? 700 : 400 }}>
                      {tots.fgReady > 0 ? tots.fgReady.toLocaleString() : '—'}
                    </td>
                    <td className="num-cell" style={{ textAlign: 'right', color: tots.pendingPlating > 0 ? 'var(--red)' : 'var(--dim)' }}>
                      {tots.pendingPlating > 0 ? tots.pendingPlating.toLocaleString() : '—'}
                    </td>
                    <td><span className={`badge ${BADGE[o.status] || 'b-warn'}`}>{o.status}</span></td>
                    <td style={{ fontSize: 12, color: overdue ? 'var(--red)' : 'var(--muted)', fontWeight: overdue ? 700 : 400 }}>
                      {fmtDate(o.due_date)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {['Open','In Progress','Partial'].includes(o.status) && (
                          <button className="btn-icon" style={{ fontSize: 10, color: 'var(--blue)' }} onClick={() => openEdit(o)}>EDIT</button>
                        )}
                        {o.status === 'Open' && (
                          <button className="btn-icon" style={{ fontSize: 10 }} onClick={() => setStatus(o.id, 'In Progress')}>START</button>
                        )}
                        {['Open','In Progress','Partial'].includes(o.status) && (
                          <button className="btn-icon" style={{ fontSize: 10, color: 'var(--red)' }} onClick={() => setStatus(o.id, 'Cancelled')}>CANCEL</button>
                        )}
                        {['Cancelled', 'Completed'].includes(o.status) && (
                          <button className="btn-icon" style={{ fontSize: 10 }} onClick={() => setStatus(o.id, 'Open')}>REOPEN</button>
                        )}
                        <a className="btn-icon" style={{ fontSize: 10, color: 'var(--accent)' }} href={`/pdir/${o.id}`} target="_blank" rel="noopener noreferrer">PDIR</a>
                        <button className="btn-icon" style={{ fontSize: 10, color: 'var(--red)' }} onClick={() => deleteOrder(o)}>DELETE</button>
                      </div>
                    </td>
                  </tr>

                  {isExp && (
                    <tr style={{ background: 'var(--bg3)' }}>
                      <td colSpan={14} style={{ padding: 0 }}>
                        <div style={{ padding: '10px 12px 14px 52px' }}>
                          <div style={{ fontFamily: 'var(--cond)', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                            Order Items
                          </div>
                          {ois.length === 0
                            ? <span style={{ fontSize: 12, color: 'var(--dim)', fontStyle: 'italic' }}>No items.</span>
                            : <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr>
                                    {['Screw','Wire','Order Qty','Dispatched','Remaining','FG Ready','Pending Plating','Fulfillment','Status'].map((h, hi) => (
                                      <th key={h} style={{ ...thStyle, textAlign: hi >= 2 && hi <= 6 ? 'right' : 'left' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {ois.map(item => {
                                    const pct  = item.order_qty > 0 ? Math.min(100, Math.round(item.dispatched_qty / item.order_qty * 100)) : 0
                                    const remQ = Math.max(item.order_qty - item.dispatched_qty, 0)
                                    return (
                                      <tr key={item.id}>
                                        <td style={{ padding: '6px 8px' }}>
                                          <span style={{ fontFamily: 'var(--cond)', fontWeight: 700 }}>{item.screw?.screw_code}</span>
                                          <span style={{ color: 'var(--muted)', marginLeft: 4, fontSize: 11 }}>{item.screw?.screw_name}</span>
                                        </td>
                                        <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>
                                          {item.wire ? `${item.wire.diameter_mm}mm – ${item.wire.grade}` : '—'}
                                        </td>
                                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--cond)', fontWeight: 700 }}>
                                          {item.order_qty.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '6px 8px', textAlign: 'right', color: item.dispatched_qty > 0 ? 'var(--green)' : 'var(--dim)' }}>
                                          {item.dispatched_qty.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '6px 8px', textAlign: 'right', color: remQ > 0 ? 'var(--accent)' : 'var(--green)', fontWeight: 700 }}>
                                          {remQ.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '6px 8px', textAlign: 'right', color: (fgMap[item.screw_id]?.fgReady || 0) > 0 ? 'var(--green)' : 'var(--dim)', fontWeight: 700 }}>
                                          {(fgMap[item.screw_id]?.fgReady || 0) > 0 ? fgMap[item.screw_id].fgReady.toLocaleString() : '—'}
                                        </td>
                                        <td style={{ padding: '6px 8px', textAlign: 'right', color: (fgMap[item.screw_id]?.pendingPlating || 0) > 0 ? 'var(--red)' : 'var(--dim)' }}>
                                          {(fgMap[item.screw_id]?.pendingPlating || 0) > 0 ? fgMap[item.screw_id].pendingPlating.toLocaleString() : '—'}
                                        </td>
                                        <td style={{ padding: '6px 8px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <div style={{ width: 80, height: 5, background: 'var(--bg4)', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                                              <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? 'var(--green)' : 'var(--accent)', transition: 'width .3s' }} />
                                            </div>
                                            <span style={{ fontFamily: 'var(--cond)', fontSize: 10, fontWeight: 700 }}>{pct}%</span>
                                          </div>
                                        </td>
                                        <td style={{ padding: '6px 8px' }}>
                                          <span className={`badge ${item.status === 'Completed' ? 'b-ok' : item.status === 'In Progress' ? 'b-orange' : 'b-blue'}`} style={{ fontSize: 9 }}>
                                            {item.status}
                                          </span>
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                          }
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
