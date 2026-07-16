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
  const [selItem, setSelItem]     = useState(null)
  const [platCheck, setPlatCheck] = useState(null)
  const [platingAck, setAck]      = useState(false)
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
    setSelItem(null)
    setPlatCheck(null)
    setAck(false)
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
    setSelItem(null)
    setPlatCheck(null)
    setAck(false)
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

  function handleOrderSelect(order_id) {
    const ord = orders.find(o => o.id === order_id)
    setSelOrder(ord || null)
    setSelItem(null)
    setPlatCheck(null)
    setAck(false)
    setForm(f => ({ ...f, order_id, item_id: '', quantity_nos: '' }))
  }

  async function handleItemSelect(item_id) {
    const item = (itemsByOrder[form.order_id] || []).find(i => i.id === item_id)
    setSelItem(item || null)
    setAck(false)
    setPlatCheck(null)

    const remaining = item ? Math.max(item.order_qty - item.dispatched_qty, 0) : 0
    setForm(f => ({ ...f, item_id, quantity_nos: remaining || '' }))

    if (item?.screw_id) {
      const [platRes, orderItemRes, openRes] = await Promise.all([
        supabase.from('plating_entries')
          .select('received_qty')
          .eq('screw_id', item.screw_id)
          .not('received_qty', 'is', null),
        supabase.from('order_items')
          .select('dispatched_qty')
          .eq('screw_id', item.screw_id),
        supabase.from('fg_opening_stock')
          .select('quantity_nos')
          .eq('screw_id', item.screw_id)
          .eq('stock_type', 'PLATED'),
      ])
      const platReceived    = (platRes.data  || []).reduce((s, p) => s + (p.received_qty  || 0), 0)
      const openingPlated   = (openRes.data  || []).reduce((s, o) => s + (o.quantity_nos  || 0), 0)
      const totalReceived   = platReceived + openingPlated
      const totalDispatched = (orderItemRes.data || []).reduce((s, i) => s + (i.dispatched_qty || 0), 0)
      const available       = Math.max(0, totalReceived - totalDispatched)
      setPlatCheck({ blocked: available <= 0, available, received: totalReceived, dispatched: totalDispatched })

      if (available > 0) {
        const autoQty = Math.min(available, remaining)
        setForm(f => ({ ...f, quantity_nos: autoQty > 0 ? String(autoQty) : '' }))
      }
    }
  }

  function validate(f) {
    const e = {}
    if (!f.dc_no.trim())  e.dc_no     = 'DC number required.'
    if (!editId && !f.order_id)  e.order_id  = 'Select an order.'
    if (!editId && !f.item_id)   e.item_id   = 'Select an order item.'
    const qty = parseInt(f.quantity_nos)
    if (!f.quantity_nos || isNaN(qty) || qty <= 0) e.quantity_nos = 'Enter valid quantity.'
    else if (!editId && platCheck && qty > platCheck.available) e.quantity_nos = `Exceeds plating stock. Available: ${platCheck.available.toLocaleString()} nos.`
    return e
  }

  async function handleAdd(ev) {
    ev.preventDefault()
    if (!editId && platCheck?.blocked) return

    const errs = validate(form)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)

    const qty = parseInt(form.quantity_nos)

    if (editId) {
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
      return
    }

    // Insert new
    const { error } = await supabase.from('dispatch_entries').insert({
      dc_no:          form.dc_no.trim().toUpperCase(),
      dispatch_date:  form.dispatch_date || today(),
      order_id:       form.order_id,
      order_item_id:  form.item_id,
      quantity_nos:   qty,
      notes:          form.notes.trim() || null,
      created_by:     user?.id,
    })

    if (!error && selItem) {
      const newDisp   = (selItem.dispatched_qty || 0) + qty
      const newStatus = newDisp >= selItem.order_qty ? 'Completed' : 'In Progress'

      await supabase.from('order_items').update({
        dispatched_qty: newDisp,
        status:         newStatus,
      }).eq('id', form.item_id)

      const { data: allOrdItems } = await supabase.from('order_items')
        .select('order_qty, dispatched_qty')
        .eq('order_id', form.order_id)

      if (allOrdItems) {
        const allDone    = allOrdItems.every(i => (i.id === form.item_id ? newDisp : i.dispatched_qty) >= i.order_qty)
        const anyStarted = allOrdItems.some(i =>  (i.id === form.item_id ? newDisp : i.dispatched_qty) > 0)
        const newOrderStatus = allDone ? 'Completed' : anyStarted ? 'Partial' : 'Open'
        await supabase.from('orders').update({ status: newOrderStatus }).eq('id', form.order_id)
      }
    }

    setSaving(false)
    if (error) { setErrors({ dc_no: error.message }); return }
    setShowForm(false)
    load()
  }

  const totalDispatched = entries.reduce((s, e) => s + (e.quantity_nos || 0), 0)
  const pendingOrders   = orders.length

  const avItems = form.order_id ? (itemsByOrder[form.order_id] || []) : []

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
          <form onSubmit={handleAdd}>
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
                /* Read-only order/item in edit mode */
                <>
                  <div className="form-group">
                    <label>Order</label>
                    <input readOnly value={`${editEntry?.order?.order_no || '—'} · ${editEntry?.order?.customer?.customer_name || '—'}`}
                      style={{ background: 'var(--bg3)', color: 'var(--muted)', cursor: 'not-allowed' }} />
                  </div>
                  <div className="form-group">
                    <label>Item</label>
                    <input readOnly value={`${editEntry?.item?.screw?.screw_code || '—'} – ${editEntry?.item?.screw?.screw_name || '—'}`}
                      style={{ background: 'var(--bg3)', color: 'var(--muted)', cursor: 'not-allowed' }} />
                  </div>
                </>
              ) : (
                /* Normal order/item selects for new dispatch */
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
                    <label>Order Item *</label>
                    <select className={errors.item_id ? 'error' : ''} value={form.item_id}
                      onChange={e => handleItemSelect(e.target.value)}
                      disabled={!form.order_id || avItems.length === 0}>
                      <option value="">— Select item —</option>
                      {avItems.map(i => {
                        const rem = Math.max(i.order_qty - i.dispatched_qty, 0)
                        return (
                          <option key={i.id} value={i.id}>
                            {i.screw?.screw_code} — {rem.toLocaleString()} remaining
                          </option>
                        )
                      })}
                    </select>
                    {errors.item_id && <span className="field-error">{errors.item_id}</span>}
                    {form.order_id && avItems.length === 0 && (
                      <span style={{ fontSize: 11, color: 'var(--green)', marginTop: 2, display: 'block' }}>
                        All items for this order are completed.
                      </span>
                    )}
                  </div>
                </>
              )}

              <div className="form-group">
                <label>Quantity (nos) *</label>
                <input type="number" min="1" className={errors.quantity_nos ? 'error' : ''} value={form.quantity_nos}
                  onChange={e => setForm(f => ({ ...f, quantity_nos: e.target.value }))} placeholder="Quantity to dispatch" />
                {errors.quantity_nos && <span className="field-error">{errors.quantity_nos}</span>}
                {editId && editOrigQty > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
                    Original: {editOrigQty.toLocaleString()} nos
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
              </div>
            </div>

            {/* Plating stock check (new dispatch only) */}
            {!editId && platCheck && (
              <div style={{
                marginTop: 10, borderRadius: 7, padding: '12px 14px',
                background: platCheck.blocked ? '#FEE2E2' : '#F0FDF4',
                border: `1px solid ${platCheck.blocked ? '#FCA5A5' : '#86EFAC'}`,
              }}>
                <div style={{ fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 13, marginBottom: 6, color: platCheck.blocked ? '#DC2626' : '#15803D' }}>
                  {platCheck.blocked ? '⛔ DISPATCH BLOCKED — No Plating Stock Available' : '✓ Plating Stock Available'}
                </div>
                <div style={{ display: 'flex', gap: 20, fontSize: 12, color: platCheck.blocked ? '#7F1D1D' : '#166534', flexWrap: 'wrap' }}>
                  <span>Received from plating: <strong>{platCheck.received.toLocaleString()}</strong></span>
                  <span>Already dispatched: <strong>{platCheck.dispatched.toLocaleString()}</strong></span>
                  <span>Available to dispatch: <strong>{platCheck.available.toLocaleString()}</strong></span>
                </div>
                {platCheck.blocked && (
                  <div style={{ fontSize: 11, color: '#991B1B', marginTop: 6 }}>
                    Receive plating stock before dispatching this item.
                  </div>
                )}
              </div>
            )}

            {!editId && selItem && (
              <div style={{ background: 'var(--accentbg)', border: '1px solid var(--accentbr)', borderRadius: 6, padding: '10px 14px', marginTop: 10, display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12 }}>
                <span><span style={{ color: 'var(--muted)' }}>Customer: </span><strong>{selOrder?.customer?.customer_name}</strong></span>
                <span><span style={{ color: 'var(--muted)' }}>Screw: </span><strong>{selItem.screw?.screw_code} – {selItem.screw?.screw_name}</strong></span>
                <span><span style={{ color: 'var(--muted)' }}>Order Qty: </span><strong>{selItem.order_qty?.toLocaleString()}</strong></span>
                <span><span style={{ color: 'var(--muted)' }}>Already Dispatched: </span><strong>{(selItem.dispatched_qty || 0).toLocaleString()}</strong></span>
                <span><span style={{ color: 'var(--muted)' }}>Remaining: </span><strong style={{ color: 'var(--accent)' }}>{Math.max((selItem.order_qty || 0) - (selItem.dispatched_qty || 0), 0).toLocaleString()}</strong></span>
              </div>
            )}

            <div className="form-actions">
              <button className="btn-add" type="submit" disabled={saving || (!editId && platCheck?.blocked)}>
                {saving ? 'SAVING…' : editId ? 'SAVE CHANGES' : 'CONFIRM DISPATCH'}
              </button>
              <button className="btn-clear" type="button"
                onClick={() => { setShowForm(false); setErrors({}); setSelOrder(null); setSelItem(null); setPlatCheck(null); setEditId(null); setEditEntry(null) }}>
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
              <th className="no-print" style={{ width: 90 }}>Actions</th>
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
                  <span style={{ fontFamily: 'var(--cond)', fontWeight: 600, fontSize: 12 }}>{e.item?.screw?.screw_code}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}> {e.item?.screw?.screw_name}</span>
                </td>
                <td className="num-cell" style={{ textAlign: 'right', color: 'var(--green)' }}>{(e.quantity_nos || 0).toLocaleString()}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{e.notes || '—'}</td>
                <td className="no-print" style={{ whiteSpace: 'nowrap' }}>
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
        </table>
      </div>
    </div>
  )
}
