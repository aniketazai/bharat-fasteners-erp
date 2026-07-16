import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const today = () => new Date().toISOString().slice(0, 10)

const EMPTY_WIRE = { wire_id: '', quantity_kg: '', entry_date: today(), notes: '' }
const EMPTY_FG   = { screw_id: '', quantity_nos: '', stock_type: 'PLATED', entry_date: today(), notes: '' }

const TYPE_STYLE = {
  PLATED:   { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' },
  UNPLATED: { bg: '#FEF2F2', color: '#DC2626', border: '#FCA5A5' },
}

export default function OpeningStock() {
  const { user } = useAuth()
  const [wires, setWires]     = useState([])
  const [screws, setScrews]   = useState([])
  const [wireRows, setWireRows] = useState([])
  const [fgRows, setFgRows]     = useState([])
  const [loading, setLoading]   = useState(true)

  const [wireForm, setWireForm] = useState(EMPTY_WIRE)
  const [wireErr, setWireErr]   = useState({})
  const [wireSaving, setWireSaving] = useState(false)
  const [wireEdit, setWireEdit] = useState(null)

  const [fgForm, setFgForm]   = useState(EMPTY_FG)
  const [fgErr, setFgErr]     = useState({})
  const [fgSaving, setFgSaving] = useState(false)
  const [fgEdit, setFgEdit]   = useState(null)

  const [deleting, setDeleting] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [wRes, sRes, wRowRes, fgRowRes] = await Promise.all([
      supabase.from('rm_wire_master').select('id, diameter_mm, grade').eq('status', 'Active').order('diameter_mm'),
      supabase.from('output_screw_master').select('id, screw_code, screw_name').order('screw_code'),
      supabase.from('rm_lot').select('*, wire:wire_id(diameter_mm,grade)')
        .eq('txn_type', 'Opening')
        .order('lot_date', { ascending: false }),
      supabase.from('fg_opening_stock').select('*, screw:screw_id(screw_code,screw_name)')
        .order('entry_date', { ascending: false }),
    ])
    setWires(wRes.data || [])
    setScrews(sRes.data || [])
    setWireRows(wRowRes.data || [])
    setFgRows(fgRowRes.data || [])
    setLoading(false)
  }

  // ── Wire opening ──────────────────────────────────────────────
  function validateWire(f) {
    const e = {}
    if (!f.wire_id) e.wire_id = 'Select wire type.'
    const kg = parseFloat(f.quantity_kg)
    if (!f.quantity_kg || isNaN(kg) || kg <= 0) e.quantity_kg = 'Enter quantity > 0.'
    return e
  }

  async function handleWireSave(ev) {
    ev.preventDefault()
    const errs = validateWire(wireForm)
    if (Object.keys(errs).length) { setWireErr(errs); return }
    setWireSaving(true)
    const payload = {
      lot_date: wireForm.entry_date || today(),
      wire_id: wireForm.wire_id,
      txn_type: 'Opening',
      quantity_kg: parseFloat(wireForm.quantity_kg),
      notes: wireForm.notes.trim() || null,
    }
    if (wireEdit) {
      await supabase.from('rm_lot').update(payload).eq('id', wireEdit)
    } else {
      await supabase.from('rm_lot').insert({ ...payload, created_by: user?.id })
    }
    setWireSaving(false)
    setWireForm(EMPTY_WIRE)
    setWireEdit(null)
    setWireErr({})
    load()
  }

  function openWireEdit(row) {
    setWireEdit(row.id)
    setWireForm({ wire_id: row.wire_id, quantity_kg: String(row.quantity_kg), entry_date: row.lot_date, notes: row.notes || '' })
    setWireErr({})
  }

  async function deleteWireRow(id) {
    if (!window.confirm('Delete this wire opening entry? This will affect wire stock balance.')) return
    setDeleting(id)
    await supabase.from('rm_lot').delete().eq('id', id)
    setDeleting(null)
    load()
  }

  // ── FG opening ────────────────────────────────────────────────
  function validateFg(f) {
    const e = {}
    if (!f.screw_id) e.screw_id = 'Select a screw.'
    const nos = parseInt(f.quantity_nos)
    if (!f.quantity_nos || isNaN(nos) || nos <= 0) e.quantity_nos = 'Enter quantity > 0.'
    return e
  }

  async function handleFgSave(ev) {
    ev.preventDefault()
    const errs = validateFg(fgForm)
    if (Object.keys(errs).length) { setFgErr(errs); return }
    setFgSaving(true)
    const payload = {
      screw_id:    fgForm.screw_id,
      quantity_nos: parseInt(fgForm.quantity_nos),
      stock_type:  fgForm.stock_type,
      entry_date:  fgForm.entry_date || today(),
      notes:       fgForm.notes.trim() || null,
    }
    if (fgEdit) {
      await supabase.from('fg_opening_stock').update(payload).eq('id', fgEdit)
    } else {
      await supabase.from('fg_opening_stock').insert({ ...payload, created_by: user?.id })
    }
    setFgSaving(false)
    setFgForm(EMPTY_FG)
    setFgEdit(null)
    setFgErr({})
    load()
  }

  function openFgEdit(row) {
    setFgEdit(row.id)
    setFgForm({ screw_id: row.screw_id, quantity_nos: String(row.quantity_nos), stock_type: row.stock_type, entry_date: row.entry_date, notes: row.notes || '' })
    setFgErr({})
  }

  async function deleteFgRow(id) {
    if (!window.confirm('Delete this FG opening entry? This will affect FG stock balance.')) return
    setDeleting(id)
    await supabase.from('fg_opening_stock').delete().eq('id', id)
    setDeleting(null)
    load()
  }

  const inp = { fontSize: 12, padding: '7px 10px', borderRadius: 5, border: '1px solid var(--border)', fontFamily: 'var(--font)', width: '100%', background: 'var(--bg)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }
  const lbl = { fontSize: 11, fontFamily: 'var(--cond)', fontWeight: 700, color: 'var(--muted)', letterSpacing: '.06em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }
  const btnSm = { fontSize: 11, padding: '3px 9px', borderRadius: 4, fontFamily: 'var(--cond)', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)' }

  const totalWireKg = wireRows.reduce((s, r) => s + parseFloat(r.quantity_kg || 0), 0)
  const totalFgPlated   = fgRows.filter(r => r.stock_type === 'PLATED').reduce((s, r) => s + r.quantity_nos, 0)
  const totalFgUnplated = fgRows.filter(r => r.stock_type === 'UNPLATED').reduce((s, r) => s + r.quantity_nos, 0)

  return (
    <div className="main page-enter">
      <div className="sh">
        <span className="sh-num">OS</span>
        <span className="sh-title">OPENING STOCK</span>
        <span className="sh-desc">Enter existing wire and FG stock before ERP go-live · {wireRows.length + fgRows.length} entries</span>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-n">{wireRows.length}</div>
          <div className="stat-l">Wire Entries</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--blue)' }}>
          <div className="stat-n" style={{ color: 'var(--blue)' }}>{totalWireKg.toFixed(1)}</div>
          <div className="stat-l">Total Wire (kg)</div>
        </div>
        <div className="stat" style={{ borderLeftColor: '#16A34A' }}>
          <div className="stat-n" style={{ color: '#16A34A' }}>{totalFgPlated.toLocaleString()}</div>
          <div className="stat-l">FG Plated (nos)</div>
        </div>
        <div className="stat" style={{ borderLeftColor: '#DC2626' }}>
          <div className="stat-n" style={{ color: '#DC2626' }}>{totalFgUnplated.toLocaleString()}</div>
          <div className="stat-l">FG Unplated (nos)</div>
        </div>
      </div>

      {/* ── Section 1: Wire Opening Stock ─────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: 'var(--cond)', fontSize: 13, fontWeight: 700, letterSpacing: '.08em', color: 'var(--accent)', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
          SECTION 1 — RM WIRE OPENING STOCK
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          Enter the wire stock you had on hand before starting the ERP. This flows directly into RM Lot as an "Opening" transaction.
        </p>

        <div className="form-card">
          <div className="form-title">{wireEdit ? 'EDIT WIRE OPENING ENTRY' : 'ADD WIRE OPENING STOCK'}</div>
          <form onSubmit={handleWireSave}>
            <div className="form-grid">
              <div className="form-group">
                <label style={lbl}>Wire Type *</label>
                <select style={{ ...inp, borderColor: wireErr.wire_id ? 'var(--red)' : 'var(--border)' }}
                  value={wireForm.wire_id} onChange={e => setWireForm(f => ({ ...f, wire_id: e.target.value }))}>
                  <option value="">— Select wire —</option>
                  {wires.map(w => <option key={w.id} value={w.id}>{w.diameter_mm}mm – {w.grade}</option>)}
                </select>
                {wireErr.wire_id && <span className="field-error">{wireErr.wire_id}</span>}
              </div>
              <div className="form-group">
                <label style={lbl}>Quantity (kg) *</label>
                <input type="number" step="0.01" min="0.01"
                  style={{ ...inp, borderColor: wireErr.quantity_kg ? 'var(--red)' : 'var(--border)' }}
                  value={wireForm.quantity_kg} placeholder="e.g. 500.00"
                  onChange={e => setWireForm(f => ({ ...f, quantity_kg: e.target.value }))} />
                {wireErr.quantity_kg && <span className="field-error">{wireErr.quantity_kg}</span>}
              </div>
              <div className="form-group">
                <label style={lbl}>Date</label>
                <input type="date" style={inp} value={wireForm.entry_date}
                  onChange={e => setWireForm(f => ({ ...f, entry_date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label style={lbl}>Notes</label>
                <input style={inp} value={wireForm.notes} placeholder="Optional"
                  onChange={e => setWireForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-add" type="submit" disabled={wireSaving}>
                {wireSaving ? 'SAVING…' : wireEdit ? 'SAVE CHANGES' : 'ADD WIRE STOCK'}
              </button>
              {wireEdit && <button className="btn-clear" type="button" onClick={() => { setWireEdit(null); setWireForm(EMPTY_WIRE); setWireErr({}) }}>CANCEL</button>}
            </div>
          </form>
        </div>

        {wireRows.length > 0 && (
          <div className="tbl-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Date</th>
                  <th>Wire</th>
                  <th style={{ textAlign: 'right' }}>Qty (kg)</th>
                  <th>Notes</th>
                  <th className="no-print" style={{ width: 90 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
                {wireRows.map((r, i) => (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.lot_date}</td>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{r.wire ? `${r.wire.diameter_mm}mm – ${r.wire.grade}` : '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--cond)', fontWeight: 700, color: 'var(--blue)' }}>
                      {parseFloat(r.quantity_kg).toFixed(2)}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.notes || '—'}</td>
                    <td className="no-print" style={{ whiteSpace: 'nowrap' }}>
                      <button onClick={() => openWireEdit(r)} style={{ ...btnSm, background: 'var(--bg2)', color: 'var(--text)', marginRight: 4 }}>Edit</button>
                      <button onClick={() => deleteWireRow(r.id)} disabled={deleting === r.id}
                        style={{ ...btnSm, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5', opacity: deleting === r.id ? 0.6 : 1 }}>
                        {deleting === r.id ? '…' : 'Del'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ padding: '7px 8px', fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 11, background: '#f5f4f2', borderTop: '2px solid var(--border2)', letterSpacing: '.04em' }}>
                    TOTAL — {wireRows.length} wires
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 13, background: '#f5f4f2', borderTop: '2px solid var(--border2)', color: 'var(--blue)' }}>
                    {totalWireKg.toFixed(2)}
                  </td>
                  <td colSpan={2} style={{ background: '#f5f4f2', borderTop: '2px solid var(--border2)' }} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 2: FG Opening Stock ───────────────────────── */}
      <div>
        <div style={{ fontFamily: 'var(--cond)', fontSize: 13, fontWeight: 700, letterSpacing: '.08em', color: 'var(--accent)', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
          SECTION 2 — FINISHED GOODS OPENING STOCK
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          Enter screws already produced and/or plated before ERP go-live.<br />
          <strong>PLATED</strong> = screw is plated and ready to dispatch. &nbsp;
          <strong>UNPLATED</strong> = screw is produced but plating not done yet.
        </p>

        <div className="form-card">
          <div className="form-title">{fgEdit ? 'EDIT FG OPENING ENTRY' : 'ADD FG OPENING STOCK'}</div>
          <form onSubmit={handleFgSave}>
            <div className="form-grid">
              <div className="form-group">
                <label style={lbl}>Screw *</label>
                <select style={{ ...inp, borderColor: fgErr.screw_id ? 'var(--red)' : 'var(--border)' }}
                  value={fgForm.screw_id} onChange={e => setFgForm(f => ({ ...f, screw_id: e.target.value }))}>
                  <option value="">— Select screw —</option>
                  {screws.map(s => <option key={s.id} value={s.id}>{s.screw_code} – {s.screw_name}</option>)}
                </select>
                {fgErr.screw_id && <span className="field-error">{fgErr.screw_id}</span>}
              </div>
              <div className="form-group">
                <label style={lbl}>Quantity (nos) *</label>
                <input type="number" min="1"
                  style={{ ...inp, borderColor: fgErr.quantity_nos ? 'var(--red)' : 'var(--border)' }}
                  value={fgForm.quantity_nos} placeholder="e.g. 10000"
                  onChange={e => setFgForm(f => ({ ...f, quantity_nos: e.target.value }))} />
                {fgErr.quantity_nos && <span className="field-error">{fgErr.quantity_nos}</span>}
              </div>
              <div className="form-group">
                <label style={lbl}>Status *</label>
                <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                  {['PLATED', 'UNPLATED'].map(t => {
                    const s = TYPE_STYLE[t]
                    const active = fgForm.stock_type === t
                    return (
                      <button key={t} type="button" onClick={() => setFgForm(f => ({ ...f, stock_type: t }))}
                        style={{
                          flex: 1, padding: '8px 0', borderRadius: 6, cursor: 'pointer',
                          fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 12, letterSpacing: '.05em',
                          background: active ? s.bg : 'var(--bg2)',
                          border: `2px solid ${active ? s.color : 'var(--border)'}`,
                          color: active ? s.color : 'var(--muted)',
                        }}>
                        {t}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="form-group">
                <label style={lbl}>Date</label>
                <input type="date" style={inp} value={fgForm.entry_date}
                  onChange={e => setFgForm(f => ({ ...f, entry_date: e.target.value }))} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Notes</label>
                <input style={inp} value={fgForm.notes} placeholder="Optional"
                  onChange={e => setFgForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-add" type="submit" disabled={fgSaving}>
                {fgSaving ? 'SAVING…' : fgEdit ? 'SAVE CHANGES' : 'ADD FG STOCK'}
              </button>
              {fgEdit && <button className="btn-clear" type="button" onClick={() => { setFgEdit(null); setFgForm(EMPTY_FG); setFgErr({}) }}>CANCEL</button>}
            </div>
          </form>
        </div>

        {fgRows.length > 0 && (
          <div className="tbl-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Date</th>
                  <th>Screw Code</th>
                  <th>Screw Name</th>
                  <th style={{ textAlign: 'right' }}>Qty (nos)</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th className="no-print" style={{ width: 90 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={8} className="empty">Loading…</td></tr>}
                {fgRows.map((r, i) => {
                  const s = TYPE_STYLE[r.stock_type]
                  return (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.entry_date}</td>
                      <td><span style={{ fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 13 }}>{r.screw?.screw_code || '—'}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.screw?.screw_name || '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 14 }}>
                        {r.quantity_nos.toLocaleString()}
                      </td>
                      <td>
                        <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 10, fontSize: 10, fontFamily: 'var(--cond)', fontWeight: 700, letterSpacing: '.06em', background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                          {r.stock_type}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.notes || '—'}</td>
                      <td className="no-print" style={{ whiteSpace: 'nowrap' }}>
                        <button onClick={() => openFgEdit(r)} style={{ ...btnSm, background: 'var(--bg2)', color: 'var(--text)', marginRight: 4 }}>Edit</button>
                        <button onClick={() => deleteFgRow(r.id)} disabled={deleting === r.id}
                          style={{ ...btnSm, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FCA5A5', opacity: deleting === r.id ? 0.6 : 1 }}>
                          {deleting === r.id ? '…' : 'Del'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ padding: '7px 8px', fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 11, background: '#f5f4f2', borderTop: '2px solid var(--border2)', letterSpacing: '.04em' }}>
                    TOTAL — {fgRows.length} screws
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 13, background: '#f5f4f2', borderTop: '2px solid var(--border2)' }}>
                    <div style={{ color: '#16A34A' }}>{totalFgPlated.toLocaleString()} <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 400 }}>PLATED</span></div>
                    {totalFgUnplated > 0 && <div style={{ color: '#DC2626', marginTop: 2 }}>{totalFgUnplated.toLocaleString()} <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 400 }}>UNPLATED</span></div>}
                  </td>
                  <td colSpan={3} style={{ background: '#f5f4f2', borderTop: '2px solid var(--border2)' }} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
