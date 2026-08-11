import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import ExportButton from '../components/ExportButton'

const today = () => new Date().toISOString().slice(0, 10)

async function nextLotNo() {
  // Scan ALL lot numbers and take the highest PLT-#### suffix, not just the
  // most recently created row — a single out-of-pattern or out-of-order
  // record would otherwise cause a duplicate lot number (and a failed
  // insert), same issue that was fixed for order numbers in Orders.jsx.
  const { data } = await supabase.from('plating_entries').select('lot_no')
  let max = 0
  for (const row of data || []) {
    const m = row.lot_no?.match(/^PLT-(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `PLT-${String(max + 1).padStart(4, '0')}`
}

const EMPTY = {
  lot_no: '', send_date: today(), plating_type_id: '', screw_id: '', sent_qty: '',
  vendor_id: '', vendor_challan_no: '', expected_return_date: '', notes: '',
}

// Searchable screw combobox — shows only produced screws, filters by typing
function ScrewCombobox({ screws, value, onChange, hasError, availMap = {} }) {
  const label = (id) => {
    const s = screws.find(s => s.id === id)
    return s ? s.screw_name : ''
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
    ? screws.filter(s => s.screw_name.toLowerCase().includes(text.toLowerCase()))
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
              onMouseDown={() => { onChange(s.id); setText(s.screw_name); setOpen(false) }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 8 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <span style={{ fontFamily: 'var(--cond)', fontWeight: 600 }}>{s.screw_name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: (availMap[s.id]?.availNos || 0) > 0 ? 'var(--green)' : 'var(--dim)' }}>
                {(availMap[s.id]?.availNos || 0).toLocaleString()} avail.
              </span>
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

function SendForm({ form, setForm, errors, saving, onSubmit, onCancel, producedScrews, platTypes, loading, title, accentColor, ratioMap, availMap, vendors }) {
  const ratio = ratioMap[form.screw_id]
  const kgVal = parseFloat(form.sent_qty)
  const nosPreview = ratio && !isNaN(kgVal) && kgVal > 0 ? Math.round(kgVal * ratio) : null
  const avail = availMap[form.screw_id]
  const exceedsAvail = avail && !isNaN(kgVal) && kgVal > 0 && avail.availKg != null && kgVal > avail.availKg

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
              availMap={availMap}
            />
            {errors.screw_id && <span className="field-error">{errors.screw_id}</span>}
            {!loading && producedScrews.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--orange)' }}>No production entries yet — produce screws first.</span>
            )}
            {form.screw_id && avail && (
              <div style={{ fontSize: 11, marginTop: 3, fontFamily: 'var(--cond)', fontWeight: 700, color: avail.availNos > 0 ? 'var(--green)' : 'var(--red)' }}>
                In production, not yet sent: {avail.availNos.toLocaleString()} nos
                {avail.availKg != null && ` (≈${avail.availKg} kg)`}
              </div>
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
            {form.screw_id && !ratio && (
              <span style={{ fontSize: 11, color: 'var(--orange)', marginTop: 2, display: 'block' }}>
                No conversion ratio set for this screw — set it in Output Screws to auto-convert to nos.
              </span>
            )}
            {nosPreview != null && (
              <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700, marginTop: 2, display: 'block' }}>
                ≈ {nosPreview.toLocaleString()} nos
              </span>
            )}
            {exceedsAvail && (
              <span style={{ fontSize: 11, color: '#B45309', fontWeight: 700, marginTop: 2, display: 'block' }}>
                ⚠ Exceeds available by {(kgVal - avail.availKg).toFixed(2)} kg
              </span>
            )}
          </div>
          <div className="form-group">
            <label>Vendor</label>
            <select value={form.vendor_id}
              onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}>
              <option value="">— Select vendor —</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
            </select>
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
        {errors._ && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{errors._}</div>}
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
  const [vendors, setVendors]         = useState([])
  const [ratioMap, setRatioMap]       = useState({}) // screw_id → conversion_ratio_per_kg (nos/kg)
  const [availMap, setAvailMap]       = useState({}) // screw_id → { availNos, availKg } — produced minus already sent to plating
  const [stageMap, setStageMap]       = useState({}) // screw_id → { godown, atPlating } — where unplated stock currently sits
  const [vendorStageMap, setVendorStageMap] = useState({}) // vendor_id → { name, atPlating, lots }
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
    const [eRes, sRes, pRes, prodRes, convRes, openRes, vRes] = await Promise.all([
      supabase.from('plating_entries')
        .select('*, screw:screw_id(screw_code,screw_name), plating_type:plating_type_id(plating_name), vendor:vendor_id(vendor_name)')
        .order('created_at', { ascending: false }),
      supabase.from('output_screw_master').select('id,screw_code,screw_name,rm_wire_id').eq('status', 'Active').order('screw_code'),
      supabase.from('plating_type_master').select('id,plating_name').eq('status', 'Active').order('plating_name'),
      supabase.from('production_entries').select('screw_id,output_nos'),
      supabase.from('conversion_master').select('screw_id,wire_id,conversion_ratio_per_kg'),
      supabase.from('fg_opening_stock').select('screw_id,quantity_nos,stock_type,direction'),
      supabase.from('plating_vendor_master').select('id,vendor_name').eq('status', 'Active').order('vendor_name'),
    ])
    setEntries(eRes.data || [])
    setScrews(sRes.data || [])
    setVendors(vRes.data || [])
    setPlatTypes(pRes.data || [])
    setProducedIds(new Set((prodRes.data || []).map(r => r.screw_id)))

    // Ratio per screw, preferring the conversion row that matches the screw's
    // default wire (rm_wire_id), falling back to any conversion on record.
    const screwWire = Object.fromEntries((sRes.data || []).map(s => [s.id, s.rm_wire_id]))
    const rm = {}
    for (const cv of (convRes.data || [])) {
      if (!cv.conversion_ratio_per_kg) continue
      if (cv.wire_id === screwWire[cv.screw_id] || !rm[cv.screw_id]) rm[cv.screw_id] = cv.conversion_ratio_per_kg
    }
    setRatioMap(rm)

    // Available to send = total produced (nos) − total already sent to plating (nos).
    // Falls back to sent_qty × ratio for older rows saved before sent_qty_nos existed.
    const producedNos = {}
    for (const p of (prodRes.data || [])) {
      producedNos[p.screw_id] = (producedNos[p.screw_id] || 0) + (p.output_nos || 0)
    }
    // UNPLATED opening stock is unplated stock that predates this app — it
    // counts toward "produced, not yet sent" same as a real production entry.
    // PLATED opening stock is excluded — that stock skipped plating entirely
    // and never sat in the godown/vendor pipeline this page tracks.
    for (const o of (openRes.data || [])) {
      if (!o.screw_id || o.stock_type !== 'UNPLATED') continue
      const signed = o.direction === 'REMOVE' ? -o.quantity_nos : o.quantity_nos
      producedNos[o.screw_id] = (producedNos[o.screw_id] || 0) + signed
    }
    const sentNos = {}
    const receivedNos = {}
    for (const e of (eRes.data || [])) {
      if (!e.screw_id) continue
      const nos = e.sent_qty_nos != null ? e.sent_qty_nos : Math.round(parseFloat(e.sent_qty || 0) * (rm[e.screw_id] || 0))
      sentNos[e.screw_id] = (sentNos[e.screw_id] || 0) + nos
      receivedNos[e.screw_id] = (receivedNos[e.screw_id] || 0) + (e.received_qty_nos || 0)
    }
    const avail = {}
    const stage = {}
    for (const sid of new Set([...Object.keys(producedNos), ...Object.keys(sentNos)])) {
      const availNos = Math.max((producedNos[sid] || 0) - (sentNos[sid] || 0), 0)
      avail[sid] = { availNos, availKg: rm[sid] ? +(availNos / rm[sid]).toFixed(2) : null }
      stage[sid] = {
        godown:    availNos,
        atPlating: Math.max((sentNos[sid] || 0) - (receivedNos[sid] || 0), 0),
      }
    }
    setAvailMap(avail)
    setStageMap(stage)

    // At-vendor breakdown by vendor — real-time "who currently has how much"
    const vendorStage = {}
    for (const e of (eRes.data || [])) {
      if (!e.vendor_id) continue
      const sent = e.sent_qty_nos != null ? e.sent_qty_nos : Math.round(parseFloat(e.sent_qty || 0) * (rm[e.screw_id] || 0))
      const pending = Math.max(sent - (e.received_qty_nos || 0), 0)
      if (pending <= 0) continue
      if (!vendorStage[e.vendor_id]) vendorStage[e.vendor_id] = { name: e.vendor?.vendor_name || '—', atPlating: 0, lots: 0 }
      vendorStage[e.vendor_id].atPlating += pending
      vendorStage[e.vendor_id].lots += 1
    }
    setVendorStageMap(vendorStage)

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
    const ratio = ratioMap[form.screw_id] || null

    let lotNo = form.lot_no.trim().toUpperCase()
    let error
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await supabase.from('plating_entries').insert({
        lot_no:               lotNo,
        send_date:            form.send_date || today(),
        plating_type_id:      form.plating_type_id,
        screw_id:             form.screw_id,
        sent_qty:             parseFloat(form.sent_qty),
        sent_qty_nos:         ratio ? Math.round(parseFloat(form.sent_qty) * ratio) : null,
        vendor_id:            form.vendor_id || null,
        vendor_challan_no:    form.vendor_challan_no.trim() || null,
        expected_return_date: form.expected_return_date || null,
        notes:                form.notes.trim() || null,
        created_by:           user?.id,
      })
      error = res.error
      // 23505 = Postgres unique-violation. If it's specifically the lot_no
      // that collided (e.g. two people saved at the same moment), regenerate
      // the next number and try again instead of just failing.
      if (error?.code === '23505' && error.message?.includes('lot_no')) {
        lotNo = await nextLotNo()
        continue
      }
      break
    }
    setSaving(false)
    if (error) { setErrors({ _: `Could not save: ${error.message}` }); return }
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
      vendor_id:            entry.vendor_id || '',
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
    const ratio = ratioMap[editForm.screw_id] || null
    const { error } = await supabase.from('plating_entries').update({
      lot_no:               editForm.lot_no.trim().toUpperCase(),
      send_date:            editForm.send_date || today(),
      plating_type_id:      editForm.plating_type_id,
      screw_id:             editForm.screw_id,
      sent_qty:             parseFloat(editForm.sent_qty),
      sent_qty_nos:         ratio ? Math.round(parseFloat(editForm.sent_qty) * ratio) : null,
      vendor_id:            editForm.vendor_id || null,
      vendor_challan_no:    editForm.vendor_challan_no.trim() || null,
      expected_return_date: editForm.expected_return_date || null,
      notes:                editForm.notes.trim() || null,
    }).eq('id', editId)
    setEditSav(false)
    if (error) { setEditErrs({ _: `Could not save: ${error.message}` }); return }
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

    const ratio = ratioMap[entry.screw_id] || null
    const newReceivedKg  = +(existing + qty).toFixed(3)
    const newReceivedNos = ratio
      ? Math.round(newReceivedKg * ratio)
      : (entry.received_qty_nos || null) // no ratio on record — leave nos untouched rather than guess

    await supabase.from('plating_entries').update({
      receive_date:     recData.receive_date || today(),
      received_qty:     newReceivedKg,
      received_qty_nos: newReceivedNos,
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

  const stageRows = Object.entries(stageMap)
    .map(([sid, s]) => ({ sid, name: screws.find(sc => sc.id === sid)?.screw_name || '—', ...s, total: s.godown + s.atPlating }))
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total)
  const totalGodown    = stageRows.reduce((s, r) => s + r.godown, 0)
  const totalAtPlating = stageRows.reduce((s, r) => s + r.atPlating, 0)

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

      {/* Stock By Stage — where unplated stock physically is right now */}
      <div style={{ marginBottom: 24 }}>
        <div className="sum-section-title">STOCK BY STAGE — WHERE IS MY STOCK</div>
        <div className="stats" style={{ gridTemplateColumns: 'repeat(2,1fr)', maxWidth: 480, marginBottom: 10 }}>
          <div className="stat" style={{ borderLeftColor: '#D97706' }}>
            <div className="stat-n" style={{ color: '#D97706' }}>{totalGodown.toLocaleString()}</div>
            <div className="stat-l">1. Godown (Ready to Send)</div>
          </div>
          <div className="stat" style={{ borderLeftColor: 'var(--accent)' }}>
            <div className="stat-n" style={{ color: 'var(--accent)' }}>{totalAtPlating.toLocaleString()}</div>
            <div className="stat-l">2. At Plating (With Vendor)</div>
          </div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Screw</th>
                <th style={{ textAlign: 'right' }}>1. Godown (Ready to Send)</th>
                <th style={{ textAlign: 'right' }}>2. At Plating (With Vendor)</th>
                <th style={{ textAlign: 'right' }}>Total Unplated</th>
              </tr>
            </thead>
            <tbody>
              {stageRows.length === 0 && <tr><td colSpan={4} className="empty">Nothing unplated right now — everything produced has been sent and received.</td></tr>}
              {stageRows.map(r => (
                <tr key={r.sid}>
                  <td style={{ fontSize: 12, fontFamily: 'var(--cond)', fontWeight: 600 }}>{r.name}</td>
                  <td className="num-cell" style={{ textAlign: 'right', color: r.godown > 0 ? '#D97706' : 'var(--dim)', fontWeight: r.godown > 0 ? 700 : 400 }}>
                    {r.godown > 0 ? r.godown.toLocaleString() : '—'}
                  </td>
                  <td className="num-cell" style={{ textAlign: 'right', color: r.atPlating > 0 ? 'var(--accent)' : 'var(--dim)', fontWeight: r.atPlating > 0 ? 700 : 400 }}>
                    {r.atPlating > 0 ? r.atPlating.toLocaleString() : '—'}
                  </td>
                  <td className="num-cell" style={{ textAlign: 'right', fontWeight: 700 }}>{r.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {Object.keys(vendorStageMap).length > 0 && (
          <>
            <div className="sum-section-title" style={{ marginTop: 16 }}>AT PLATING — BY VENDOR (RIGHT NOW)</div>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th style={{ textAlign: 'right' }}>With Vendor (nos)</th>
                    <th style={{ textAlign: 'right' }}>Open Lots</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(vendorStageMap).sort((a, b) => b.atPlating - a.atPlating).map(v => (
                    <tr key={v.name}>
                      <td style={{ fontSize: 12, fontFamily: 'var(--cond)', fontWeight: 600 }}>{v.name}</td>
                      <td className="num-cell" style={{ textAlign: 'right', color: 'var(--accent)', fontWeight: 700 }}>{v.atPlating.toLocaleString()}</td>
                      <td className="num-cell" style={{ textAlign: 'right', color: 'var(--muted)' }}>{v.lots}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
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
          ratioMap={ratioMap}
          availMap={availMap}
          vendors={vendors}
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
          ratioMap={ratioMap}
          availMap={availMap}
          vendors={vendors}
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
              <th style={{ textAlign: 'right' }}>Sent (nos)</th>
              <th style={{ textAlign: 'right' }}>Received (kg)</th>
              <th style={{ textAlign: 'right' }}>Received (nos)</th>
              <th>Receive Date</th>
              <th>Status</th>
              <th data-no-export>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={15} className="empty">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={15} className="empty">No plating entries yet.</td></tr>}
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
                    <span style={{ fontFamily: 'var(--cond)', fontWeight: 600, fontSize: 12 }}>{e.screw?.screw_name}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}> {e.screw?.screw_name}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{e.plating_type?.plating_name || '—'}</td>
                  <td style={{ fontSize: 12, fontWeight: (e.vendor?.vendor_name || e.vendor_name) ? 600 : 400, color: (e.vendor?.vendor_name || e.vendor_name) ? 'var(--text)' : 'var(--dim)' }}>
                    {e.vendor?.vendor_name || e.vendor_name || '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{e.vendor_challan_no || '—'}</td>
                  <td style={{ fontSize: 12, color: overdue ? 'var(--red)' : 'var(--muted)', fontWeight: overdue ? 700 : 400 }}>
                    {e.expected_return_date || '—'}
                  </td>
                  <td className="num-cell" style={{ textAlign: 'right' }}>
                    {parseFloat(e.sent_qty).toFixed(2)}
                  </td>
                  <td className="num-cell" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                    {e.sent_qty_nos != null ? e.sent_qty_nos.toLocaleString() : '—'}
                  </td>
                  <td className="num-cell" style={{ textAlign: 'right', color: e.received_qty != null ? 'var(--green)' : 'var(--dim)' }}>
                    {e.received_qty != null ? parseFloat(e.received_qty).toFixed(2) : '—'}
                  </td>
                  <td className="num-cell" style={{ textAlign: 'right', color: e.received_qty_nos != null ? 'var(--green)' : 'var(--dim)', fontWeight: 700 }}>
                    {e.received_qty_nos != null ? e.received_qty_nos.toLocaleString() : '—'}
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
                            {ratioMap[e.screw_id] && recData.received_qty && !isNaN(parseFloat(recData.received_qty)) && (
                              <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 700 }}>
                                ≈ {Math.round(parseFloat(recData.received_qty) * ratioMap[e.screw_id]).toLocaleString()} nos
                              </span>
                            )}
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
          {!loading && filtered.length > 0 && (() => {
            const tSent    = filtered.reduce((s, e) => s + (parseFloat(e.sent_qty) || 0), 0)
            const tRecv    = filtered.reduce((s, e) => s + (parseFloat(e.received_qty) || 0), 0)
            const tSentN   = filtered.reduce((s, e) => s + (e.sent_qty_nos || 0), 0)
            const tRecvN   = filtered.reduce((s, e) => s + (e.received_qty_nos || 0), 0)
            const TFD = (c, ex = {}) => <td style={{ padding: '7px 8px', fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 11, background: '#f5f4f2', borderTop: '2px solid var(--border2)', ...ex }}>{c}</td>
            return (
              <tfoot>
                <tr>
                  {TFD(`TOTAL — ${filtered.length} lots`, { colSpan: 8, letterSpacing: '.04em' })}
                  {TFD(tSent.toFixed(2), { textAlign: 'right' })}
                  {TFD(tSentN > 0 ? tSentN.toLocaleString() : '—', { textAlign: 'right', color: 'var(--muted)' })}
                  {TFD(tRecv > 0 ? tRecv.toFixed(2) : '—', { textAlign: 'right', color: tRecv > 0 ? 'var(--green)' : 'var(--dim)' })}
                  {TFD(tRecvN > 0 ? tRecvN.toLocaleString() : '—', { textAlign: 'right', color: tRecvN > 0 ? 'var(--green)' : 'var(--dim)' })}
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
