import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import ExportButton from '../components/ExportButton'

const TXN_TYPES = ['Opening', 'Purchase', 'Issue', 'Return']
const TXN_COLOR = { Opening: 'var(--blue)', Purchase: 'var(--green)', Issue: 'var(--red)', Return: 'var(--accent)' }
const TXN_BADGE = { Opening: 'b-blue', Purchase: 'b-ok', Issue: 'b-red', Return: 'b-orange' }
const today = () => new Date().toISOString().slice(0, 10)

const EMPTY = { lot_date: today(), wire_id: '', txn_type: 'Purchase', quantity_kg: '', order_id: '', supplier_name: '', invoice_no: '', rate_per_kg: '', reference: '', notes: '' }

export default function RMLot() {
  const { user } = useAuth()
  const [entries, setEntries]   = useState([])
  const [wires, setWires]       = useState([])
  const [orders, setOrders]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [errors, setErrors]     = useState({})
  const [saving, setSaving]     = useState(false)
  const [filterWire, setFW]     = useState('All')
  const [editId, setEditId]     = useState(null)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [eRes, wRes, oRes] = await Promise.all([
      supabase.from('rm_lot')
        .select('*, wire:wire_id(diameter_mm,grade), order:order_id(order_no)')
        .order('lot_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('rm_wire_master').select('id,diameter_mm,grade').eq('status','Active').order('diameter_mm'),
      supabase.from('orders').select('id, order_no').in('status',['Open','In Progress']).order('order_no'),
    ])
    setEntries(eRes.data || [])
    setWires(wRes.data || [])
    setOrders(oRes.data || [])
    setLoading(false)
  }

  function validate(f) {
    const e = {}
    if (!f.wire_id)    e.wire_id     = 'Select wire type.'
    if (!f.txn_type)   e.txn_type    = 'Select transaction type.'
    const kg = parseFloat(f.quantity_kg)
    if (!f.quantity_kg || isNaN(kg) || kg <= 0) e.quantity_kg = 'Enter valid quantity > 0.'
    return e
  }

  async function handleAdd(ev) {
    ev.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)

    const payload = {
      lot_date:      form.lot_date || today(),
      wire_id:       form.wire_id,
      txn_type:      form.txn_type,
      quantity_kg:   parseFloat(form.quantity_kg),
      order_id:      form.order_id || null,
      supplier_name: form.supplier_name.trim() || null,
      invoice_no:    form.invoice_no.trim() || null,
      rate_per_kg:   form.rate_per_kg ? parseFloat(form.rate_per_kg) : null,
      reference:     form.reference.trim() || null,
      notes:         form.notes.trim() || null,
    }

    if (editId) {
      const { error } = await supabase.from('rm_lot').update(payload).eq('id', editId)
      setSaving(false)
      if (error) { setErrors({ quantity_kg: error.message }); return }
    } else {
      const { error } = await supabase.from('rm_lot').insert({ ...payload, created_by: user?.id })
      setSaving(false)
      if (error) { setErrors({ quantity_kg: error.message }); return }
      setForm({ ...EMPTY, lot_date: form.lot_date, wire_id: form.wire_id, txn_type: form.txn_type })
    }

    setEditId(null)
    setShowForm(false)
    load()
  }

  function openEdit(entry) {
    setEditId(entry.id)
    setForm({
      lot_date:      entry.lot_date || today(),
      wire_id:       entry.wire_id || '',
      txn_type:      entry.txn_type || 'Purchase',
      quantity_kg:   String(entry.quantity_kg || ''),
      order_id:      entry.order_id || '',
      supplier_name: entry.supplier_name || '',
      invoice_no:    entry.invoice_no || '',
      rate_per_kg:   entry.rate_per_kg != null ? String(entry.rate_per_kg) : '',
      reference:     entry.reference || '',
      notes:         entry.notes || '',
    })
    setErrors({})
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(entry) {
    if (!window.confirm(`Delete this ${entry.txn_type} entry (${parseFloat(entry.quantity_kg).toFixed(2)} kg)?\nThis will affect the wire stock balance.`)) return
    setDeleting(entry.id)
    await supabase.from('rm_lot').delete().eq('id', entry.id)
    setDeleting(null)
    load()
  }

  // stock summary per wire
  const stockByWire = {}
  for (const e of entries) {
    if (!e.wire_id) continue
    if (!stockByWire[e.wire_id]) stockByWire[e.wire_id] = { wire: e.wire, in: 0, out: 0 }
    if (e.txn_type === 'Issue') stockByWire[e.wire_id].out += parseFloat(e.quantity_kg)
    else stockByWire[e.wire_id].in += parseFloat(e.quantity_kg)
  }

  const filtered = filterWire === 'All' ? entries : entries.filter(e => e.wire_id === filterWire)
  const totalIn  = entries.filter(e => e.txn_type !== 'Issue').reduce((s,e) => s + parseFloat(e.quantity_kg), 0)
  const totalOut = entries.filter(e => e.txn_type === 'Issue').reduce((s,e) => s + parseFloat(e.quantity_kg), 0)

  const isPurchase = form.txn_type === 'Purchase' || form.txn_type === 'Opening'

  const btnSm = { fontSize: 11, padding: '3px 9px', borderRadius: 4, fontFamily: 'var(--cond)', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)' }

  return (
    <div className="main page-enter">
      <div className="sh">
        <span className="sh-num">03</span>
        <span className="sh-title">RM LOT</span>
        <span className="sh-desc">Wire stock ledger · {entries.length} entries</span>
      </div>

      <div className="stats">
        <div className="stat"><div className="stat-n">{entries.length}</div><div className="stat-l">Total Entries</div></div>
        <div className="stat" style={{ borderLeftColor: 'var(--green)' }}>
          <div className="stat-n" style={{ color: 'var(--green)' }}>{totalIn.toFixed(1)}</div><div className="stat-l">Total In (kg)</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--red)' }}>
          <div className="stat-n" style={{ color: 'var(--red)' }}>{totalOut.toFixed(1)}</div><div className="stat-l">Total Issued (kg)</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--accent)' }}>
          <div className="stat-n" style={{ color: (totalIn - totalOut) >= 0 ? 'var(--accent)' : 'var(--red)' }}>
            {(totalIn - totalOut).toFixed(1)}
          </div>
          <div className="stat-l">Net Stock (kg)</div>
        </div>
      </div>

      {/* Stock per wire */}
      {Object.keys(stockByWire).length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {Object.values(stockByWire).map((s, i) => {
            const net = s.in - s.out
            return (
              <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 14px', boxShadow: 'var(--shadow)', minWidth: 130, borderLeft: `3px solid ${net > 0 ? 'var(--green)' : 'var(--red)'}` }}>
                <div style={{ fontFamily: 'var(--cond)', fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.06em' }}>{s.wire?.diameter_mm}mm – {s.wire?.grade}</div>
                <div style={{ fontFamily: 'var(--cond)', fontSize: 18, fontWeight: 700, color: net > 0 ? 'var(--green)' : 'var(--red)', marginTop: 2 }}>{net.toFixed(1)}<span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 3 }}>kg</span></div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10 }} className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--cond)', fontWeight: 600, letterSpacing: '.05em' }}>WIRE</label>
          <select value={filterWire} onChange={e => setFW(e.target.value)}
            style={{ fontSize: 12, padding: '6px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontFamily: 'var(--font)', outline: 'none' }}>
            <option value="All">All wires</option>
            {wires.map(w => <option key={w.id} value={w.id}>{w.diameter_mm}mm – {w.grade}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <ExportButton filename="rm-lot" />
          <button className="btn-add" onClick={() => {
            if (showForm) { setShowForm(false); setEditId(null); setErrors({}) }
            else { setForm(EMPTY); setEditId(null); setErrors({}); setShowForm(true) }
          }}>
            {showForm ? '✕ CANCEL' : '+ ADD ENTRY'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="form-card">
          <div className="form-title">{editId ? 'EDIT RM LOT ENTRY' : 'NEW RM LOT ENTRY'}</div>
          <form onSubmit={handleAdd}>
            <div className="form-grid">
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={form.lot_date} onChange={e => setForm(f => ({ ...f, lot_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Transaction Type</label>
                <select value={form.txn_type} onChange={e => setForm(f => ({ ...f, txn_type: e.target.value }))}>
                  {TXN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Wire Type *</label>
                <select className={errors.wire_id ? 'error' : ''} value={form.wire_id}
                  onChange={e => setForm(f => ({ ...f, wire_id: e.target.value }))}>
                  <option value="">— Select wire —</option>
                  {wires.map(w => <option key={w.id} value={w.id}>{w.diameter_mm}mm – {w.grade}</option>)}
                </select>
                {errors.wire_id && <span className="field-error">{errors.wire_id}</span>}
              </div>
              <div className="form-group">
                <label>Quantity (kg) *</label>
                <input type="number" step="0.01" min="0.01" className={errors.quantity_kg ? 'error' : ''} value={form.quantity_kg}
                  onChange={e => setForm(f => ({ ...f, quantity_kg: e.target.value }))} placeholder="e.g. 250.50" />
                {errors.quantity_kg && <span className="field-error">{errors.quantity_kg}</span>}
              </div>

              {isPurchase && (
                <>
                  <div className="form-group">
                    <label>Supplier Name</label>
                    <input value={form.supplier_name}
                      onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}
                      placeholder="e.g. Steel Wire Co." />
                  </div>
                  <div className="form-group">
                    <label>Invoice No</label>
                    <input value={form.invoice_no}
                      onChange={e => setForm(f => ({ ...f, invoice_no: e.target.value }))}
                      placeholder="e.g. INV-2024-001" />
                  </div>
                  <div className="form-group">
                    <label>Rate per kg (₹)</label>
                    <input type="number" step="0.01" min="0" value={form.rate_per_kg}
                      onChange={e => setForm(f => ({ ...f, rate_per_kg: e.target.value }))}
                      placeholder="e.g. 85.50" />
                  </div>
                </>
              )}

              {form.txn_type === 'Issue' && (
                <div className="form-group">
                  <label>Linked Order</label>
                  <select value={form.order_id} onChange={e => setForm(f => ({ ...f, order_id: e.target.value }))}>
                    <option value="">— None —</option>
                    {orders.map(o => <option key={o.id} value={o.id}>{o.order_no}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Reference / Notes</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
              </div>
            </div>

            {isPurchase && form.quantity_kg && form.rate_per_kg && (
              <div style={{ marginTop: 8, background: 'var(--accentbg)', border: '1px solid var(--accentbr)', borderRadius: 6, padding: '8px 14px', fontSize: 13, display: 'inline-block' }}>
                <span style={{ color: 'var(--muted)' }}>Total Value: </span>
                <strong style={{ fontFamily: 'var(--cond)', fontSize: 15 }}>
                  ₹{(parseFloat(form.quantity_kg) * parseFloat(form.rate_per_kg)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>
            )}

            <div className="form-actions">
              <button className="btn-add" type="submit" disabled={saving}>
                {saving ? 'SAVING…' : editId ? 'SAVE CHANGES' : 'SAVE ENTRY'}
              </button>
              <button className="btn-clear" type="button" onClick={() => { setShowForm(false); setEditId(null); setErrors({}) }}>CANCEL</button>
            </div>
          </form>
        </div>
      )}

      <div className="tbl-wrap">
        <table data-export>
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>Date</th>
              <th>Type</th>
              <th>Wire</th>
              <th style={{ textAlign: 'right' }}>Qty (kg)</th>
              <th>Supplier</th>
              <th>Invoice No</th>
              <th style={{ textAlign: 'right' }}>Rate (₹/kg)</th>
              <th style={{ textAlign: 'right' }}>Value (₹)</th>
              <th>Order</th>
              <th>Notes</th>
              <th className="no-print" style={{ width: 90 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={12} className="empty">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={12} className="empty">No entries yet.</td></tr>}
            {filtered.map((e, i) => {
              const value = e.rate_per_kg && e.quantity_kg ? parseFloat(e.rate_per_kg) * parseFloat(e.quantity_kg) : null
              return (
                <tr key={e.id}>
                  <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{e.lot_date}</td>
                  <td><span className={`badge ${TXN_BADGE[e.txn_type] || 'b-warn'}`}>{e.txn_type}</span></td>
                  <td style={{ fontSize: 12 }}>{e.wire ? `${e.wire.diameter_mm}mm – ${e.wire.grade}` : '—'}</td>
                  <td className="num-cell" style={{ textAlign: 'right', color: TXN_COLOR[e.txn_type] }}>
                    {e.txn_type === 'Issue' ? '-' : '+'}{parseFloat(e.quantity_kg).toFixed(2)}
                  </td>
                  <td style={{ fontSize: 12, color: e.supplier_name ? 'var(--text)' : 'var(--dim)', fontWeight: e.supplier_name ? 600 : 400 }}>
                    {e.supplier_name || '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{e.invoice_no || '—'}</td>
                  <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>
                    {e.rate_per_kg ? `₹${parseFloat(e.rate_per_kg).toFixed(2)}` : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12, fontFamily: 'var(--cond)', fontWeight: value ? 600 : 400, color: value ? 'var(--text)' : 'var(--dim)' }}>
                    {value ? `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{e.order?.order_no || '—'}</td>
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
              )
            })}
          </tbody>
          {!loading && filtered.length > 0 && (() => {
            const tIn  = filtered.filter(e => e.txn_type !== 'Issue').reduce((s, e) => s + parseFloat(e.quantity_kg || 0), 0)
            const tOut = filtered.filter(e => e.txn_type === 'Issue').reduce((s, e) => s + parseFloat(e.quantity_kg || 0), 0)
            const tVal = filtered.reduce((s, e) => s + (e.rate_per_kg && e.quantity_kg ? parseFloat(e.rate_per_kg) * parseFloat(e.quantity_kg) : 0), 0)
            const TFD = (c, ex = {}) => <td style={{ padding: '7px 8px', fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 11, background: '#f5f4f2', borderTop: '2px solid var(--border2)', ...ex }}>{c}</td>
            return (
              <tfoot>
                <tr>
                  {TFD(`TOTAL — ${filtered.length}`, { colSpan: 4, letterSpacing: '.04em' })}
                  {TFD(<span>+{tIn.toFixed(2)} / -{tOut.toFixed(2)}</span>, { textAlign: 'right' })}
                  {TFD('', { colSpan: 3 })}
                  {TFD(tVal > 0 ? `₹${tVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—', { textAlign: 'right' })}
                  {TFD('', { colSpan: 3 })}
                </tr>
              </tfoot>
            )
          })()}
        </table>
      </div>
    </div>
  )
}
