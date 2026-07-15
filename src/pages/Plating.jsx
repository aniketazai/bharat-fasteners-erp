import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import ExportButton from '../components/ExportButton'

const today = () => new Date().toISOString().slice(0, 10)

async function nextLotNo() {
  const { data } = await supabase.from('plating_entries').select('lot_no').order('created_at', { ascending: false }).limit(1)
  if (!data || !data.length) return 'PLT-0001'
  const m = data[0].lot_no?.match(/PLT-(\d+)/)
  return m ? `PLT-${String(parseInt(m[1]) + 1).padStart(4, '0')}` : 'PLT-0001'
}

const EMPTY = {
  lot_no: '', send_date: today(), plating_type_id: '', screw_id: '', sent_qty: '',
  vendor_name: '', vendor_challan_no: '', expected_return_date: '', notes: '',
}

// Searchable screw combobox — shows only produced screws, filters by typing
function ScrewCombobox({ screws, value, onChange, hasError }) {
  const label = (id) => {
    const s = screws.find(s => s.id === id)
    return s ? `${s.screw_code} – ${s.screw_name}` : ''
  }
  const [text, setText]   = useState(() => label(value))
  const [open, setOpen]   = useState(false)
  const box               = useRef(null)

  useEffect(() => { setText(label(value)) }, [value, screws.length])

  useEffect(() => {
    function outside(e) {
      if (box.current && !box.current.contains(e.target)) {
        setOpen(false)
        setText(label(value)) // revert if user typed without picking
      }
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [value, screws])

  const visible = text && text !== label(value)
    ? screws.filter(s => `${s.screw_code} ${s.screw_name}`.toLowerCase().includes(text.toLowerCase()))
    : screws

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <input
        value={text}
        onChange={e => { setText(e.target.value); onChange(''); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={screws.length ? 'Search screw…' : 'No produced screws yet'}
        className={hasError ? 'error' : ''}
        style={{ width: '100%' }}
        autoComplete="off"
      />
      {open && visible.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 300,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 7,
          maxHeight: 200, overflowY: 'auto', boxShadow: '0 6px 20px rgba(0,0,0,.13)',
        }}>
          {visible.map(s => (
            <div key={s.id}
              onMouseDown={() => { onChange(s.id); setText(`${s.screw_code} – ${s.screw_name}`); setOpen(false) }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <span style={{ fontFamily: 'var(--cond)', fontWeight: 700 }}>{s.screw_code}</span>
              <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 11 }}>{s.screw_name}</span>
            </div>
          ))}
        </div>
      )}
      {open && visible.length === 0 && text && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 300,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 7,
          padding: '8px 12px', fontSize: 12, color: 'var(--muted)',
          boxShadow: '0 6px 20px rgba(0,0,0,.13)',
        }}>
          No match for "{text}". Produce this screw first.
        </div>
      )}
    </div>
  )
}

function SendForm({ form, setForm, errors, saving, onSubmit, onCancel, producedScrews, platTypes, loading, title, accentColor }) {
  return (
    <div className="form-card" style={{ borderLeftColor: accentColor }}>
      <div className="form-title" style={{ color: accentColor }}>{title}</div>
      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label>Lot No *</label>
            <input className={errors.lot_no ? 'error' : ''} value={form.lot_no}
              onChange={e => setForm(f => ({ ...f, lot_no: e.target.value }))} placeholder="PLT-0001" />
            {errors.lot_no && <span className="field-error">{errors.lot_no}</span>}
          </div>
          <div className="form-group">
            <label>Send Date</label>
            <input type="date" value={form.send_date}
              onChange={e => setForm(f => ({ ...f, send_date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Screw Type *&nbsp;<span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>(produced only)</span></label>
            <ScrewCombobox
              screws={producedScrews}
              value={form.screw_id}
              onChange={id => setForm(f => ({ ...f, screw_id: id }))}
              hasError={!!errors.screw_id}
            />
            {errors.screw_id && <span className="field-error">{errors.screw_id}</span>}
            {!loading && producedScrews.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--orange)' }}>No production entries yet — produce screws first.</span>
            )}
          </div>
          <div className="form-group">
            <label>Plating Type *</label>
            <select className={errors.plating_type_id ? 'error' : ''} value={form.plating_type_id}
              onChange={e => setForm(f => ({ ...f, plating_type_id: e.target.value }))}>
              <option value="">— Select type —</option>
              {platTypes.map(p => <option key={p.id} value={p.id}>{p.plating_name}</option>)}
            </select>
            {errors.plating_type_id && <span className="field-error">{errors.plating_type_id}</span>}
          </div>
          <div className="form-group">
            <label>Quantity Sent (KG) *</label>
            <input type="number" min="0.001" step="0.001"
              className={errors.sent_qty ? 'error' : ''} value={form.sent_qty}
              onChange={e => setForm(f => ({ ...f, sent_qty: e.target.value }))}
              placeholder="e.g. 12.50" />
            {errors.sent_qty && <span className="field-error">{errors.sent_qty}</span>}
          </div>
          <div className="form-group">
            <label>Vendor Name</label>
            <input value={form.vendor_name}
              onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))}
              placeholder="e.g. Rajesh Platers" />
          </div>
          <div className="form-group">
            <label>Vendor Challan No</label>
            <input value={form.vendor_challan_no}
              onChange={e => setForm(f => ({ ...f, vendor_challan_no: e.target.value }))}
              placeholder="Vendor's challan number" />
          </div>
          <div className="form-group">
            <label>Expected Return Date</label>
            <input type="date" value={form.expected_return_date}
              onChange={e => setForm(f => ({ ...f, expected_return_date: e.target.value }))} />
          </div>
          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label>Notes</label>
            <input value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn-add" type="submit" style={{ background: accentColor }} disabled={saving}>
            {saving ? 'SAVING…' : (title.startsWith('EDIT') ? 'SAVE CHANGES' : 'CONFIRM SEND')}
          </button>
          <button className="btn-clear" type="button" onClick={onCancel}>CANCEL</button>
        </div>
      </form>
    </div>
  )
}

export default function Plating() {
  const { user } = useAuth()
  const [entries, setEntries]         = useState([])
  const [screws, setScrews]           = useState([])
  const [producedIds, setProducedIds] = useState(new Set())
  const [platTypes, setPlatTypes]     = useState([])
  const [loading, setLoading]         = useState(true)

  // Create form
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(EMPTY)
  const [errors, setErrors]     = useState({})
  const [saving, setSaving]     = useState(false)

  // Edit form
  const [editId, setEditId]       = useState(null)
  const [editForm, setEditForm]   = useState(EMPTY)
  const [editErrors, setEditErrs] = useState({})
  const [editSaving, setEditSav]  = useState(false)

  // Receive inline
  const [receiveId, setReceiveId] = useState(null)
  const [recData, setRecData]     = useState({ receive_date: today(), received_qty: '' })
  const [recErr, setRecErr]       = useState({})

  const [filterStatus, setFS] = useState('All')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [eRes, sRes, pRes, prodRes] = await Promise.all([
      supabase.from('plating_entries')
        .select('*, screw:screw_id(screw_code,screw_name), plating_type:plating_type_id(plating_name)')
        .order('created_at', { ascending: false }),
      supabase.from('output_screw_master').select('id,screw_code,screw_name').eq('status', 'Active').order('screw_code'),
      supabase.from('plating_type_master').select('id,plating_name').eq('status', 'Active').order('plating_name'),
      supabase.from('production_entries').select('screw_id'),
    ])
    setEntries(eRes.data || [])
    setScrews(sRes.data || [])
    setPlatTypes(pRes.data || [])
    setProducedIds(new Set((prodRes.data || []).map(r => r.screw_id)))
    setLoading(false)
  }

  const producedScrews = screws.filter(s => producedIds.has(s.id))

  function validate(f) {
    const e = {}
    if (!f.lot_no.trim())       e.lot_no          = 'Lot number required.'
    if (!f.screw_id)            e.screw_id        = 'Select a produced screw.'
    if (!f.plating_type_id)     e.plating_type_id = 'Select plating type.'
    const qty = parseFloat(f.sent_qty)
    if (!f.sent_qty || isNaN(qty) || qty <= 0) e.sent_qty = 'Enter valid quantity (kg).'
    return e
  }

  async function openSendForm() {
    const no = await nextLotNo()
    setForm({ ...EMPTY, lot_no: no, send_date: today() })
    setErrors({})
    setEditId(null)
    setShowForm(true)
  }

  async function handleSend(ev) {
    ev.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    const { error } = await supabase.from('plating_entries').insert({
      lot_no:               form.lot_no.trim().toUpperCase(),
      send_date:            form.send_date || today(),
      plating_type_id:      form.plating_type_id,
      screw_id:             form.screw_id,
      sent_qty:             parseFloat(form.sent_qty),
      vendor_name:          form.vendor_name.trim() || null,
      vendor_challan_no:    form.vendor_challan_no.trim() || null,
      expected_return_date: form.expected_return_date || null,
      notes:                form.notes.trim() || null,
      created_by:           user?.id,
    })
    setSaving(false)
    if (error) { setErrors({ lot_no: error.message }); return }
    setShowForm(false)
    load()
  }

  function openEditForm(entry) {
    setShowForm(false)
    setReceiveId(null)
    setEditId(entry.id)
    setEditForm({
      lot_no:               entry.lot_no || '',
      send_date:            entry.send_date || today(),
      plating_type_id:      entry.plating_type_id || '',
      screw_id:             entry.screw_id || '',
      sent_qty:             entry.sent_qty ?? '',
      vendor_name:          entry.vendor_name || '',
      vendor_challan_no:    entry.vendor_challan_no || '',
      expected_return_date: entry.expected_return_date || '',
      notes:                entry.notes || '',
    })
    setEditErrs({})
  }

  async function handleEdit(ev) {
    ev.preventDefault()
    const errs = validate(editForm)
    if (Object.keys(errs).length) { setEditErrs(errs); return }
    setEditSav(true)
    const { error } = await supabase.from('plating_entries').update({
      lot_no:               editForm.lot_no.trim().toUpperCase(),
      send_date:            editForm.send_date || today(),
      plating_type_id:      editForm.plating_type_id,
      screw_id:             editForm.screw_id,
      sent_qty:             parseFloat(editForm.sent_qty),
      vendor_name:          editForm.vendor_name.trim() || null,
      vendor_challan_no:    editForm.vendor_challan_no.trim() || null,
      expected_return_date: editForm.expected_return_date || null,
      notes:                editForm.notes.trim() || null,
    }).eq('id', editId)
    setEditSav(false)
    if (error) { setEditErrs({ lot_no: error.message }); return }
    setEditId(null)
    load()
  }

  async function handleDelete(entry) {
    if (!window.confirm(`Delete lot ${entry.lot_no}? This cannot be undone.`)) return
    await supabase.from('plating_entries').delete().eq('id', entry.id)
    if (editId === entry.id) setEditId(null)
    if (receiveId === entry.id) setReceiveId(null)
    load()
  }

  async function handleReceive(entry) {
    const existing   = parseFloat(entry.received_qty || 0)
    const sent       = parseFloat(entry.sent_qty)
    const remaining  = sent - existing
    const qty        = parseFloat(recData.received_qty)
    const errs = {}
    if (!recData.received_qty || isNaN(qty) || qty <= 0) errs.received_qty = 'Enter quantity (kg).'
    else if (qty > remaining + 0.0001) errs.received_qty = `Max ${remaining.toFixed(3)} kg remaining.`
    if (Object.keys(errs).length) { setRecErr(errs); return }
    await supabase.from('plating_entries').update({
      receive_date: recData.receive_date || today(),
      received_qty: +(existing + qty).toFixed(3),
    }).eq('id', entry.id)
    setReceiveId(null)
    setRecData({ receive_date: today(), received_qty: '' })
    load()
  }

  function lotStatus(e) {
    if (!e.received_qty) return { label: 'AT VENDOR', cls: 'b-orange' }
    if (parseFloat(e.received_qty) >= parseFloat(e.sent_qty)) return { label: 'RECEIVED', cls: 'b-ok' }
    return { label: 'PARTIAL', cls: 'b-blue' }
  }

  const atVendor  = entries.filter(e => !e.received_qty).length
  const received  = entries.filter(e => e.received_qty != null && parseFloat(e.received_qty) >= parseFloat(e.sent_qty)).length
  const totalSent = entries.reduce((s, e) => s + (parseFloat(e.sent_qty) || 0), 0)
  const filtered  = filterStatus === 'All' ? entries : entries.filter(e => lotStatus(e).label === filterStatus)

  return (
    <div className="main page-enter">
      <div className="sh">
        <span className="sh-num">05</span>
        <span className="sh-title">PLATING</span>
        <span className="sh-desc">Send / Receive tracking · {entries.length} lots</span>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-n">{entries.length}</div>
          <div className="stat-l">Total Lots</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--accent)' }}>
          <div className="stat-n" style={{ color: 'var(--accent)' }}>{atVendor}</div>
          <div className="stat-l">At Vendor</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--green)' }}>
          <div className="stat-n" style={{ color: 'var(--green)' }}>{received}</div>
          <div className="stat-l">Received</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--blue)' }}>
          <div className="stat-n" style={{ color: 'var(--blue)' }}>{totalSent.toFixed(2)}</div>
          <div className="stat-l">Total Sent (kg)</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10 }} className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--cond)', fontWeight: 600, letterSpacing: '.05em' }}>STATUS</label>
          <select value={filterStatus} onChange={e => setFS(e.target.value)}
            style={{ fontSize: 12, padding: '6px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontFamily: 'var(--font)', outline: 'none' }}>
            <option value="All">All</option>
            <option value="AT VENDOR">At Vendor</option>
            <option value="RECEIVED">Received</option>
            <option value="PARTIAL">Partial</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <ExportButton filename="plating-entries" />
          <button className="btn-add" onClick={openSendForm}>+ SEND TO PLATING</button>
        </div>
      </div>

      {showForm && (
        <SendForm
          form={form} setForm={setForm}
          errors={errors} saving={saving}
          onSubmit={handleSend}
          onCancel={() => { setShowForm(false); setErrors({}) }}
          producedScrews={producedScrews}
          platTypes={platTypes}
          loading={loading}
          title="SEND TO PLATING"
          accentColor="var(--accent)"
        />
      )}

      {editId && (
        <SendForm
          form={editForm} setForm={setEditForm}
          errors={editErrors} saving={editSaving}
          onSubmit={handleEdit}
          onCancel={() => { setEditId(null); setEditErrs({}) }}
          producedScrews={producedScrews}
          platTypes={platTypes}
          loading={loading}
          title={`EDIT — ${editForm.lot_no}`}
          accentColor="var(--blue)"
        />
      )}

      <div className="tbl-wrap">
        <table data-export>
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>Lot No</th>
              <th>Send Date</th>
              <th>Screw</th>
              <th>Plating</th>
              <th>Vendor</th>
              <th>Challan No</th>
              <th>Exp. Return</th>
              <th style={{ textAlign: 'right' }}>Sent (kg)</th>
              <th style={{ textAlign: 'right' }}>Received (kg)</th>
              <th>Receive Date</th>
              <th>Status</th>
              <th data-no-export>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={13} className="empty">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={13} className="empty">No plating entries yet.</td></tr>}
            {filtered.map((e, i) => {
              const st      = lotStatus(e)
              const overdue = e.expected_return_date && !e.received_qty && new Date(e.expected_return_date) < new Date()
              const isEditing = editId === e.id
              return (
                <tr key={e.id} style={{ background: isEditing ? 'rgba(37,99,235,.05)' : undefined }}>
                  <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                  <td><span style={{ fontFamily: 'var(--cond)', fontWeight: 700 }}>{e.lot_no}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{e.send_date}</td>
                  <td>
                    <span style={{ fontFamily: 'var(--cond)', fontWeight: 600, fontSize: 12 }}>{e.screw?.screw_code}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}> {e.screw?.screw_name}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{e.plating_type?.plating_name || '—'}</td>
                  <td style={{ fontSize: 12, fontWeight: e.vendor_name ? 600 : 400, color: e.vendor_name ? 'var(--text)' : 'var(--dim)' }}>
                    {e.vendor_name || '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{e.vendor_challan_no || '—'}</td>
                  <td style={{ fontSize: 12, color: overdue ? 'var(--red)' : 'var(--muted)', fontWeight: overdue ? 700 : 400 }}>
                    {e.expected_return_date || '—'}
                  </td>
                  <td className="num-cell" style={{ textAlign: 'right' }}>
                    {parseFloat(e.sent_qty).toFixed(2)}
                  </td>
                  <td className="num-cell" style={{ textAlign: 'right', color: e.received_qty != null ? 'var(--green)' : 'var(--dim)' }}>
                    {e.received_qty != null ? parseFloat(e.received_qty).toFixed(2) : '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{e.receive_date || '—'}</td>
                  <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        className="btn-icon"
                        style={{ fontSize: 10, color: isEditing ? 'var(--muted)' : 'var(--blue)' }}
                        onClick={() => isEditing ? setEditId(null) : openEditForm(e)}
                      >
                        {isEditing ? 'CANCEL EDIT' : 'EDIT'}
                      </button>
                      {(st.label === 'AT VENDOR' || st.label === 'PARTIAL') && (
                        receiveId === e.id ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                            {st.label === 'PARTIAL' && (
                              <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--cond)', fontWeight: 600 }}>
                                Remaining: {(parseFloat(e.sent_qty) - parseFloat(e.received_qty || 0)).toFixed(2)} kg
                              </span>
                            )}
                            <input type="date" className="mri" style={{ width: 118 }} value={recData.receive_date}
                              onChange={ev => setRecData(d => ({ ...d, receive_date: ev.target.value }))} />
                            <input type="number" step="0.001" className="mri" style={{ width: 80 }} value={recData.received_qty}
                              onChange={ev => setRecData(d => ({ ...d, received_qty: ev.target.value }))}
                              placeholder={`max ${(parseFloat(e.sent_qty) - parseFloat(e.received_qty || 0)).toFixed(2)}`} />
                            {recErr.received_qty && <span className="field-error">{recErr.received_qty}</span>}
                            <button className="btn-add" style={{ fontSize: 10, padding: '5px 10px' }} onClick={() => handleReceive(e)}>OK</button>
                            <button className="btn-clear" style={{ fontSize: 10, padding: '5px 8px' }} onClick={() => { setReceiveId(null); setRecErr({}) }}>✕</button>
                          </div>
                        ) : (
                          <button className="btn-icon" style={{ fontSize: 10, color: 'var(--green)' }}
                            onClick={() => { setEditId(null); setReceiveId(e.id); setRecData({ receive_date: today(), received_qty: '' }); setRecErr({}) }}>
                            RECEIVE
                          </button>
                        )
                      )}
                      {st.label === 'RECEIVED' && receiveId !== e.id && (
                        <span style={{ fontSize: 11, color: 'var(--dim)' }}>Done</span>
                      )}
                      <button
                        className="btn-icon"
                        style={{ fontSize: 10, color: 'var(--red)' }}
                        onClick={() => handleDelete(e)}
                      >
                        DELETE
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
