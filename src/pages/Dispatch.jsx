import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import ExportButton from '../components/ExportButton'

const today = () => new Date().toISOString().slice(0, 10)

async function nextDCNo() {
  const { data } = await supabase.from('dispatch_entries').select('dc_no').order('created_at', { ascending: false }).limit(1)
  if (!data || !data.length) return 'DC-0001'
  const m = data[0].dc_no?.match(/DC-(\d+)/)
  return m ? `DC-${String(parseInt(m[1]) + 1).padStart(4, '0')}` : 'DC-0001'
}

const EMPTY = { dc_no: '', dispatch_date: today(), order_id: '', item_id: '', quantity_nos: '', notes: '' }

export default function Dispatch() {
  const { user } = useAuth()
  const [entries, setEntries]     = useState([])
  const [orders, setOrders]       = useState([])
  const [itemsByOrder, setItems]  = useState({})
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(EMPTY)
  const [errors, setErrors]       = useState({})
  const [saving, setSaving]       = useState(false)
  const [selOrder, setSelOrder]   = useState(null)
  const [rowState, setRowState]   = useState({})   // item_id -> { checked, qty }
  const [screwPlat, setScrewPlat] = useState({})   // screw_id -> { blocked, available, received, dispatched }
  const [platLoading, setPlatLoading] = useState(false)
  const [editId, setEditId]       = useState(null)
  const [editOrigQty, setEditOrigQty] = useState(0)
  const [editEntry, setEditEntry] = useState(null)
  const [deleting, setDeleting]   = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [eRes, oRes] = await Promise.all([
      supabase.from('dispatch_entries')
        .select(`
          *,
          order:order_id(order_no, customer:customer_id(customer_name)),
          item:order_item_id(order_qty, dispatched_qty, screw:screw_id(screw_code,screw_name))
        `)
        .order('dispatch_date', { ascending: false })
        .order('created_at',    { ascending: false }),
      supabase.from('orders')
        .select('id, order_no, customer:customer_id(customer_name)')
        .in('status', ['Open', 'In Progress', 'Partial'])
        .order('order_no'),
    ])
    setEntries(eRes.data || [])
    setOrders(oRes.data || [])

    const ids = (oRes.data || []).map(o => o.id)
    if (ids.length) {
      const { data: iData } = await supabase.from('order_items')
        .select('*, screw:screw_id(screw_code,screw_name)')
        .in('order_id', ids)
        .neq('status', 'Completed')
        .order('created_at')
      const map = {}
      for (const it of (iData || [])) {
        if (!map[it.order_id]) map[it.order_id] = []
        map[it.order_id].push(it)
      }
      setItems(map)
    } else {
      setItems({})
    }
    setLoading(false)
  }

  async function openForm() {
    const no = await nextDCNo()
    setForm({ ...EMPTY, dc_no: no, dispatch_date: today() })
    setErrors({})
    setSelOrder(null)
    setRowState({})
    setScrewPlat({})
    setEditId(null)
    setEditEntry(null)
    setShowForm(true)
  }

  function openEdit(entry) {
    setEditId(entry.id)
    setEditOrigQty(entry.quantity_nos || 0)
    setEditEntry(entry)
    setForm({
      dc_no:         entry.dc_no || '',
      dispatch_date: entry.dispatch_date || today(),
      order_id:      entry.order_id || '',
      item_id:       entry.order_item_id || '',
      quantity_nos:  String(entry.quantity_nos || ''),
      notes:         entry.notes || '',
    })
    setErrors({})
    setSelOrder(null)
    setRowState({})
    setScrewPlat({})
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(entry) {
    if (!window.confirm(`Delete DC ${entry.dc_no}?\nThis will reverse ${(entry.quantity_nos || 0).toLocaleString()} nos from dispatched qty.`)) return
    setDeleting(entry.id)

    const qty     = entry.quantity_nos || 0
    const itemId  = entry.order_item_id
    const orderId = entry.order_id

    const { data: itemData } = await supabase.from('order_items')
      .select('order_qty, dispatched_qty')
      .eq('id', itemId)
      .single()

    if (itemData) {
      const newDisp   = Math.max(0, (itemData.dispatched_qty || 0) - qty)
      const newStatus = newDisp >= itemData.order_qty ? 'Completed' : newDisp > 0 ? 'In Progress' : 'Open'
      await supabase.from('order_items').update({ dispatched_qty: newDisp, status: newStatus }).eq('id', itemId)

      const { data: allItems } = await supabase.from('order_items')
        .select('id, order_qty, dispatched_qty')
        .eq('order_id', orderId)
      if (allItems) {
        const updItems   = allItems.map(i => i.id === itemId ? { ...i, dispatched_qty: newDisp } : i)
        const allDone    = updItems.every(i => (i.dispatched_qty || 0) >= i.order_qty)
        const anyStarted = updItems.some(i => (i.dispatched_qty || 0) > 0)
        const newOrderStatus = allDone ? 'Completed' : anyStarted ? 'Partial' : 'Open'
        await supabase.from('orders').update({ status: newOrderStatus }).eq('id', orderId)
      }
    }

    await supabase.from('dispatch_entries').delete().eq('id', entry.id)
    setDeleting(null)
    load()
  }

  async function checkPlatingForScrew(screw_id) {
    const [platRes, orderItemRes, openRes] = await Promise.all([
      supabase.from('plating_entries')
        .select('received_qty_nos')
        .eq('screw_id', screw_id)
        .not('received_qty_nos', 'is', null),
      supabase.from('order_items')
        .select('dispatched_qty')
        .eq('screw_id', screw_id),
      supabase.from('fg_opening_stock')
        .select('quantity_nos, direction')
        .eq('screw_id', screw_id)
        .eq('stock_type', 'PLATED'),
    ])
    const platReceived    = (platRes.data  || []).reduce((s, p) => s + (p.received_qty_nos  || 0), 0)
    const openingPlated   = (openRes.data  || []).reduce((s, o) => s + (o.direction === 'REMOVE' ? -(o.quantity_nos || 0) : (o.quantity_nos || 0)), 0)
    const totalReceived   = platReceived + openingPlated
    const totalDispatched = (orderItemRes.data || []).reduce((s, i) => s + (i.dispatched_qty || 0), 0)
    const available       = Math.max(0, totalReceived - totalDispatched)
    return { blocked: available <= 0, available, received: totalReceived, dispatched: totalDispatched }
  }

  async function handleOrderSelect(order_id) {
    const ord = orders.find(o => o.id === order_id)
    setSelOrder(ord || null)
    setForm(f => ({ ...f, order_id, item_id: '', quantity_nos: '' }))
    setRowState({})
    setScrewPlat({})
    setErrors({})

    const items = itemsByOrder[order_id] || []
    if (!items.length) return
    setPlatLoading(true)

    const uniqueScrewIds = [...new Set(items.map(i => i.screw_id).filter(Boolean))]
    const results = await Promise.all(uniqueScrewIds.map(async screw_id => [screw_id, await checkPlatingForScrew(screw_id)]))
    const platMap = Object.fromEntries(results)
    setScrewPlat(platMap)

    const rs = {}
    for (const item of items) {
      const remaining = Math.max(item.order_qty - item.dispatched_qty, 0)
      const plat = item.screw_id ? platMap[item.screw_id] : null
      const cap = plat ? Math.min(remaining, plat.available) : remaining
      const blocked = plat ? plat.blocked : false
      rs[item.id] = { checked: !blocked && cap > 0, qty: cap > 0 ? String(cap) : '' }
    }
    setRowState(rs)
    setPlatLoading(false)
  }

  function toggleRow(item_id, checked) {
    setRowState(rs => ({ ...rs, [item_id]: { ...rs[item_id], checked } }))
  }

  function setRowQty(item_id, qty) {
    setRowState(rs => ({ ...rs, [item_id]: { ...rs[item_id], qty } }))
  }

  function selectAllRows(checked) {
    setRowState(rs => {
      const next = { ...rs }
      for (const item of avItems) {
        const plat = item.screw_id ? screwPlat[item.screw_id] : null
        if (plat?.blocked) continue
        next[item.id] = { ...next[item.id], checked }
      }
      return next
    })
  }

  function validateEdit(f) {
    const e = {}
    if (!f.dc_no.trim()) e.dc_no = 'DC number required.'
    const qty = parseInt(f.quantity_nos)
    if (!f.quantity_nos || isNaN(qty) || qty <= 0) e.quantity_nos = 'Enter valid quantity.'
    return e
  }

  function validateBatch() {
    const e = {}
    if (!form.dc_no.trim()) e.dc_no = 'DC number required.'
    if (!form.order_id)     e.order_id = 'Select an order.'

    const selected = avItems.filter(i => rowState[i.id]?.checked)
    if (!selected.length) e.rows = 'Select at least one item to dispatch.'

    const screwTotals = {}
    for (const item of selected) {
      const row = rowState[item.id] || {}
      const qty = parseInt(row.qty)
      const remaining = Math.max(item.order_qty - item.dispatched_qty, 0)
      if (!row.qty || isNaN(qty) || qty <= 0) { e[`row_${item.id}`] = 'Enter valid qty.'; continue }
      if (qty > remaining) { e[`row_${item.id}`] = `Exceeds remaining (${remaining.toLocaleString()}).`; continue }
      if (item.screw_id) screwTotals[item.screw_id] = (screwTotals[item.screw_id] || 0) + qty
    }
    for (const [screwId, total] of Object.entries(screwTotals)) {
      const plat = screwPlat[screwId]
      if (plat && total > plat.available) {
        e.rows = `Total quantity for one of the screws exceeds available plating stock (${plat.available.toLocaleString()}).`
      }
    }
    return e
  }

  async function updateOrderItemsAndOrderStatus(order_id, dispatchedByItem) {
    for (const [itemId, newDisp] of Object.entries(dispatchedByItem)) {
      const item = avItems.find(i => i.id === itemId)
      const newStatus = item && newDisp >= item.order_qty ? 'Completed' : 'In Progress'
      await supabase.from('order_items').update({ dispatched_qty: newDisp, status: newStatus }).eq('id', itemId)
    }

    const { data: allItems } = await supabase.from('order_items')
      .select('id, order_qty, dispatched_qty')
      .eq('order_id', order_id)
    if (allItems) {
      const updItems   = allItems.map(i => dispatchedByItem[i.id] !== undefined ? { ...i, dispatched_qty: dispatchedByItem[i.id] } : i)
      const allDone    = updItems.every(i => (i.dispatched_qty || 0) >= i.order_qty)
      const anyStarted = updItems.some(i => (i.dispatched_qty || 0) > 0)
      const newOrderStatus = allDone ? 'Completed' : anyStarted ? 'Partial' : 'Open'
      await supabase.from('orders').update({ status: newOrderStatus }).eq('id', order_id)
    }
  }

  async function handleEditSave(ev) {
    ev.preventDefault()
    const errs = validateEdit(form)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)

    const qty = parseInt(form.quantity_nos)

    await supabase.from('dispatch_entries').update({
      dc_no:         form.dc_no.trim().toUpperCase(),
      dispatch_date: form.dispatch_date || today(),
      quantity_nos:  qty,
      notes:         form.notes.trim() || null,
    }).eq('id', editId)

    const diff = qty - editOrigQty
    if (diff !== 0) {
      const { data: itemData } = await supabase.from('order_items')
        .select('order_qty, dispatched_qty')
        .eq('id', form.item_id)
        .single()

      if (itemData) {
        const newDisp   = Math.max(0, (itemData.dispatched_qty || 0) + diff)
        const newStatus = newDisp >= itemData.order_qty ? 'Completed' : newDisp > 0 ? 'In Progress' : 'Open'
        await supabase.from('order_items').update({ dispatched_qty: newDisp, status: newStatus }).eq('id', form.item_id)

        const { data: allItems } = await supabase.from('order_items')
          .select('id, order_qty, dispatched_qty')
          .eq('order_id', form.order_id)
        if (allItems) {
          const updItems   = allItems.map(i => i.id === form.item_id ? { ...i, dispatched_qty: newDisp } : i)
          const allDone    = updItems.every(i => (i.dispatched_qty || 0) >= i.order_qty)
          const anyStarted = updItems.some(i => (i.dispatched_qty || 0) > 0)
          const newOrderStatus = allDone ? 'Completed' : anyStarted ? 'Partial' : 'Open'
          await supabase.from('orders').update({ status: newOrderStatus }).eq('id', form.order_id)
        }
      }
    }

    setSaving(false)
    setEditId(null)
    setEditEntry(null)
    setShowForm(false)
    load()
  }

  async function handleBatchSave(ev) {
    ev.preventDefault()
    const errs = validateBatch()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)

    const selected = avItems.filter(i => rowState[i.id]?.checked)
    const dc_no          = form.dc_no.trim().toUpperCase()
    const dispatch_date  = form.dispatch_date || today()
    const notes          = form.notes.trim() || null

    const inserts = selected.map(item => ({
      dc_no,
      dispatch_date,
      order_id:      form.order_id,
      order_item_id: item.id,
      quantity_nos:  parseInt(rowState[item.id].qty),
      notes,
      created_by:    user?.id,
    }))

    const { error } = await supabase.from('dispatch_entries').insert(inserts)
    if (error) { setSaving(false); setErrors({ dc_no: error.message }); return }

    const dispatchedByItem = {}
    for (const item of selected) {
      dispatchedByItem[item.id] = (item.dispatched_qty || 0) + parseInt(rowState[item.id].qty)
    }
    await updateOrderItemsAndOrderStatus(form.order_id, dispatchedByItem)

    setSaving(false)
    setShowForm(false)
    load()
  }

  function closeForm() {
    setShowForm(false)
    setErrors({})
    setSelOrder(null)
    setRowState({})
    setScrewPlat({})
    setEditId(null)
    setEditEntry(null)
  }

  const totalDispatched = entries.reduce((s, e) => s + (e.quantity_nos || 0), 0)
  const pendingOrders   = orders.length

  const avItems = form.order_id ? (itemsByOrder[form.order_id] || []) : []
  const selectedCount = avItems.filter(i => rowState[i.id]?.checked).length
  const selectedTotal = avItems.reduce((s, i) => s + (rowState[i.id]?.checked ? (parseInt(rowState[i.id].qty) || 0) : 0), 0)

  const btnSm = { fontSize: 11, padding: '3px 9px', borderRadius: 4, fontFamily: 'var(--cond)', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)' }

  return (
    <div className="main page-enter">
      <div className="sh">
        <span className="sh-num">06</span>
        <span className="sh-title">DISPATCH</span>
        <span className="sh-desc">Delivery challans · {entries.length} records</span>
      </div>

      <div className="stats">
        <div className="stat"><div className="stat-n">{entries.length}</div><div className="stat-l">Total DCs</div></div>
        <div className="stat" style={{ borderLeftColor: 'var(--green)' }}>
          <div className="stat-n" style={{ color: 'var(--green)' }}>{totalDispatched.toLocaleString()}</div><div className="stat-l">Total Dispatched</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--blue)' }}>
          <div className="stat-n" style={{ color: 'var(--blue)' }}>{pendingOrders}</div><div className="stat-l">Active Orders</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--accent)' }}>
          <div className="stat-n" style={{ color: 'var(--accent)' }}>
            {entries.length > 0 ? Math.round(totalDispatched / entries.length).toLocaleString() : 0}
          </div>
          <div className="stat-l">Avg per DC</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }} className="no-print">
        <ExportButton filename="dispatch-entries" />
        <button className="btn-add" onClick={openForm}>+ NEW DISPATCH</button>
      </div>

      {showForm && (
        <div className="form-card">
          <div className="form-title">{editId ? 'EDIT DELIVERY CHALLAN' : 'NEW DELIVERY CHALLAN'}</div>
          <form onSubmit={editId ? handleEditSave : handleBatchSave}>
            <div className="form-grid">
              <div className="form-group">
                <label>DC No *</label>
                <input className={errors.dc_no ? 'error' : ''} value={form.dc_no}
                  onChange={e => setForm(f => ({ ...f, dc_no: e.target.value }))} placeholder="DC-0001" />
                {errors.dc_no && <span className="field-error">{errors.dc_no}</span>}
              </div>
              <div className="form-group">
                <label>Dispatch Date</label>
                <input type="date" value={form.dispatch_date}
                  onChange={e => setForm(f => ({ ...f, dispatch_date: e.target.value }))} />
              </div>

              {editId ? (
                <>
                  <div className="form-group">
                    <label>Order</label>
                    <input readOnly value={`${editEntry?.order?.order_no || '—'} · ${editEntry?.order?.customer?.customer_name || '—'}`}
                      style={{ background: 'var(--bg3)', color: 'var(--muted)', cursor: 'not-allowed' }} />
                  </div>
                  <div className="form-group">
                    <label>Item</label>
                    <input readOnly value={editEntry?.item?.screw?.screw_name || '—'}
                      style={{ background: 'var(--bg3)', color: 'var(--muted)', cursor: 'not-allowed' }} />
                  </div>
                  <div className="form-group">
                    <label>Quantity (nos) *</label>
                    <input type="number" min="1" className={errors.quantity_nos ? 'error' : ''} value={form.quantity_nos}
                      onChange={e => setForm(f => ({ ...f, quantity_nos: e.target.value }))} placeholder="Quantity to dispatch" />
                    {errors.quantity_nos && <span className="field-error">{errors.quantity_nos}</span>}
                    {editOrigQty > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
                        Original: {editOrigQty.toLocaleString()} nos
                      </span>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Notes</label>
                    <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label>Order *</label>
                    <select className={errors.order_id ? 'error' : ''} value={form.order_id}
                      onChange={e => handleOrderSelect(e.target.value)}>
                      <option value="">— Select order —</option>
                      {orders.map(o => (
                        <option key={o.id} value={o.id}>{o.order_no} · {o.customer?.customer_name}</option>
                      ))}
                    </select>
                    {errors.order_id && <span className="field-error">{errors.order_id}</span>}
                  </div>
                  <div className="form-group">
                    <label>Notes</label>
                    <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional — applies to all selected items" />
                  </div>
                </>
              )}
            </div>

            {!editId && form.order_id && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                  <label style={{ margin: 0 }}>
                    Order Items *
                    {selOrder && <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 8, fontSize: 12 }}>{selOrder.customer?.customer_name}</span>}
                  </label>
                  {avItems.length > 0 && !platLoading && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {selectedCount} selected · {selectedTotal.toLocaleString()} nos
                      </span>
                      <button type="button" style={btnSm} onClick={() => selectAllRows(true)}>Select All</button>
                      <button type="button" style={btnSm} onClick={() => selectAllRows(false)}>Clear</button>
                    </div>
                  )}
                </div>

                {platLoading && <div className="empty" style={{ padding: 10 }}>Checking plating stock…</div>}

                {!platLoading && avItems.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--green)' }}>All items for this order are completed.</div>
                )}

                {!platLoading && avItems.length > 0 && (
                  <div className="tbl-wrap" style={{ marginTop: 4 }}>
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 30 }}></th>
                          <th>Screw</th>
                          <th style={{ textAlign: 'right' }}>Order Qty</th>
                          <th style={{ textAlign: 'right' }}>Dispatched</th>
                          <th style={{ textAlign: 'right' }}>Remaining</th>
                          <th style={{ textAlign: 'right' }}>Plating Avail.</th>
                          <th style={{ width: 140, textAlign: 'right' }}>Qty to Dispatch</th>
                        </tr>
                      </thead>
                      <tbody>
                        {avItems.map(item => {
                          const remaining = Math.max(item.order_qty - item.dispatched_qty, 0)
                          const plat = item.screw_id ? screwPlat[item.screw_id] : null
                          const blocked = plat ? plat.blocked : false
                          const row = rowState[item.id] || { checked: false, qty: '' }
                          const rowErr = errors[`row_${item.id}`]
                          return (
                            <tr key={item.id} style={blocked ? { opacity: 0.55 } : undefined}>
                              <td>
                                <input type="checkbox" checked={!!row.checked} disabled={blocked}
                                  onChange={e => toggleRow(item.id, e.target.checked)} />
                              </td>
                              <td style={{ fontFamily: 'var(--cond)', fontWeight: 600, fontSize: 12 }}>
                                {item.screw?.screw_name}
                                {blocked && <div style={{ fontSize: 10, color: '#DC2626' }}>No plating stock</div>}
                              </td>
                              <td className="num-cell" style={{ textAlign: 'right' }}>{item.order_qty?.toLocaleString()}</td>
                              <td className="num-cell" style={{ textAlign: 'right' }}>{(item.dispatched_qty || 0).toLocaleString()}</td>
                              <td className="num-cell" style={{ textAlign: 'right' }}>{remaining.toLocaleString()}</td>
                              <td className="num-cell" style={{ textAlign: 'right' }}>{plat ? plat.available.toLocaleString() : '—'}</td>
                              <td>
                                <input type="number" min="1" value={row.qty} disabled={blocked || !row.checked}
                                  onChange={e => setRowQty(item.id, e.target.value)}
                                  style={{ width: '100%', textAlign: 'right' }} />
                                {rowErr && <span className="field-error" style={{ fontSize: 10, display: 'block' }}>{rowErr}</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {errors.rows && <span className="field-error" style={{ display: 'block', marginTop: 6 }}>{errors.rows}</span>}
              </div>
            )}

            <div className="form-actions">
              <button className="btn-add" type="submit" disabled={saving || platLoading}>
                {saving ? 'SAVING…' : editId ? 'SAVE CHANGES' : `CONFIRM DISPATCH${selectedCount ? ` (${selectedCount})` : ''}`}
              </button>
              <button className="btn-clear" type="button" onClick={closeForm}>
                CANCEL
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="tbl-wrap">
        <table data-export>
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>DC No</th>
              <th>Date</th>
              <th>Order</th>
              <th>Customer</th>
              <th>Screw</th>
              <th style={{ textAlign: 'right' }}>Qty Dispatched</th>
              <th>Notes</th>
              <th className="no-print" style={{ width: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="empty">Loading…</td></tr>}
            {!loading && entries.length === 0 && <tr><td colSpan={9} className="empty">No dispatch entries yet.</td></tr>}
            {entries.map((e, i) => (
              <tr key={e.id}>
                <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                <td><span style={{ fontFamily: 'var(--cond)', fontWeight: 700 }}>{e.dc_no}</span></td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{e.dispatch_date}</td>
                <td style={{ fontSize: 12 }}>{e.order?.order_no || '—'}</td>
                <td style={{ fontSize: 12 }}>{e.order?.customer?.customer_name || '—'}</td>
                <td>
                  <span style={{ fontFamily: 'var(--cond)', fontWeight: 600, fontSize: 12 }}>{e.item?.screw?.screw_name}</span>
                </td>
                <td className="num-cell" style={{ textAlign: 'right', color: 'var(--green)' }}>{(e.quantity_nos || 0).toLocaleString()}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{e.notes || '—'}</td>
                <td className="no-print" style={{ whiteSpace: 'nowrap' }}>
                  <a href={`/pdir/${e.order_id}?dc=${e.id}`} target="_blank" rel="noopener noreferrer"
                    style={{ ...btnSm, background: 'var(--accentbg)', color: 'var(--accent)', border: '1px solid var(--accentbr)', marginRight: 4, textDecoration: 'none', display: 'inline-block' }}>
                    PDIR
                  </a>
                  <button onClick={() => openEdit(e)}
                    style={{ ...btnSm, background: 'var(--bg2)', color: 'var(--text)', marginRight: 4 }}>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(e)} disabled={deleting === e.id}
                    style={{ ...btnSm, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5', opacity: deleting === e.id ? 0.6 : 1 }}>
                    {deleting === e.id ? '…' : 'Del'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {!loading && entries.length > 0 && (() => {
            const total = entries.reduce((s, e) => s + (e.quantity_nos || 0), 0)
            const TFD = (c, ex = {}) => <td style={{ padding: '7px 8px', fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 11, background: '#f5f4f2', borderTop: '2px solid var(--border2)', ...ex }}>{c}</td>
            return (
              <tfoot>
                <tr>
                  {TFD(`TOTAL — ${entries.length} entries`, { colSpan: 6, letterSpacing: '.04em' })}
                  {TFD(total.toLocaleString(), { textAlign: 'right', color: 'var(--green)', fontSize: 12 })}
                  {TFD('', { colSpan: 2 })}
                </tr>
              </tfoot>
            )
          })()}
        </table>
      </div>
    </div>
  )
}
