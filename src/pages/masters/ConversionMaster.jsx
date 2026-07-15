import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const EMPTY_FORM = { screw_id: '', wire_id: '', conversion_ratio_per_kg: '' }

function wireLabel(w) { return `${w.diameter_mm}mm – ${w.grade}` }

export default function ConversionMaster() {
  const { user } = useAuth()
  const [records, setRecords]       = useState([])
  const [screws, setScrews]         = useState([])
  const [wires, setWires]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving]         = useState(false)
  const [editId, setEditId]         = useState(null)
  const [editData, setEditData]     = useState({})
  const [editErrors, setEditErrors] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [recRes, screwRes, wireRes] = await Promise.all([
      supabase
        .from('conversion_master')
        .select('*, screw:screw_id(screw_code, screw_name), wire:wire_id(diameter_mm, grade)')
        .order('created_at'),
      supabase.from('output_screw_master').select('id, screw_code, screw_name').eq('status', 'Active').order('screw_code'),
      supabase.from('rm_wire_master').select('id, diameter_mm, grade').eq('status', 'Active').order('diameter_mm'),
    ])
    setRecords(recRes.data || [])
    setScrews(screwRes.data || [])
    setWires(wireRes.data || [])
    setLoading(false)
  }

  function isDup(screw_id, wire_id, excludeId = null) {
    return records.some(r => r.id !== excludeId && r.screw_id === screw_id && r.wire_id === wire_id)
  }

  function validate(data, excludeId = null) {
    const errs = {}
    if (!data.screw_id)  errs.screw_id = 'Select a screw.'
    if (!data.wire_id)   errs.wire_id  = 'Select a wire type.'
    if (data.screw_id && data.wire_id && isDup(data.screw_id, data.wire_id, excludeId))
      errs.wire_id = 'This screw + wire combination already exists.'
    const ratio = parseFloat(data.conversion_ratio_per_kg)
    if (!data.conversion_ratio_per_kg || isNaN(ratio) || ratio <= 0)
      errs.conversion_ratio_per_kg = 'Enter a valid ratio > 0.'
    return errs
  }

  async function handleAdd(e) {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) { setFormErrors(errs); return }

    setSaving(true)
    const { error } = await supabase.from('conversion_master').insert({
      screw_id:                form.screw_id,
      wire_id:                 form.wire_id,
      conversion_ratio_per_kg: parseFloat(form.conversion_ratio_per_kg),
      created_by:              user?.id,
    })
    setSaving(false)
    if (error) { setFormErrors({ wire_id: error.message }); return }
    setForm(EMPTY_FORM)
    setShowForm(false)
    load()
  }

  function startEdit(row) {
    setEditId(row.id)
    setEditData({
      screw_id:                row.screw_id,
      wire_id:                 row.wire_id,
      conversion_ratio_per_kg: String(row.conversion_ratio_per_kg),
    })
    setEditErrors({})
  }

  async function handleEditSave(id) {
    const errs = validate(editData, id)
    if (Object.keys(errs).length) { setEditErrors(errs); return }

    const { error } = await supabase.from('conversion_master').update({
      screw_id:                editData.screw_id,
      wire_id:                 editData.wire_id,
      conversion_ratio_per_kg: parseFloat(editData.conversion_ratio_per_kg),
    }).eq('id', id)
    if (error) { setEditErrors({ wire_id: error.message }); return }
    setEditId(null)
    load()
  }

  async function toggleStatus(row) {
    const next = row.status === 'Active' ? 'Inactive' : 'Active'
    await supabase.from('conversion_master').update({ status: next }).eq('id', row.id)
    load()
  }

  const active   = records.filter(r => r.status === 'Active').length
  const inactive = records.filter(r => r.status === 'Inactive').length

  const screwMap = Object.fromEntries(screws.map(s => [s.id, s]))
  const wireMap  = Object.fromEntries(wires.map(w => [w.id, w]))

  return (
    <div className="main page-enter">
      <div className="sh">
        <span className="sh-num">M6</span>
        <span className="sh-title">CONVERSION MASTER</span>
        <span className="sh-desc">Screw → Wire → nos/kg mapping · {records.length} records</span>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(3,1fr)', maxWidth: 480 }}>
        <div className="stat">
          <div className="stat-n">{records.length}</div>
          <div className="stat-l">Total Conversions</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--green)' }}>
          <div className="stat-n" style={{ color: 'var(--green)' }}>{active}</div>
          <div className="stat-l">Active</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--dim)' }}>
          <div className="stat-n" style={{ color: 'var(--muted)' }}>{inactive}</div>
          <div className="stat-l">Inactive</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button
          className="btn-add"
          onClick={() => { setShowForm(v => !v); setFormErrors({}); setForm(EMPTY_FORM) }}
        >
          {showForm ? '✕  CANCEL' : '+ ADD CONVERSION'}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <div className="form-title">NEW CONVERSION ENTRY</div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
            Unique constraint: one wire type per screw.
          </p>
          <form onSubmit={handleAdd}>
            <div className="form-grid">
              <div className="form-group">
                <label>Screw *</label>
                <select
                  className={formErrors.screw_id ? 'error' : ''}
                  value={form.screw_id}
                  onChange={e => setForm(f => ({ ...f, screw_id: e.target.value }))}
                >
                  <option value="">— Select screw —</option>
                  {screws.map(s => (
                    <option key={s.id} value={s.id}>{s.screw_code} – {s.screw_name}</option>
                  ))}
                </select>
                {formErrors.screw_id && <span className="field-error">{formErrors.screw_id}</span>}
              </div>
              <div className="form-group">
                <label>Wire Type *</label>
                <select
                  className={formErrors.wire_id ? 'error' : ''}
                  value={form.wire_id}
                  onChange={e => setForm(f => ({ ...f, wire_id: e.target.value }))}
                >
                  <option value="">— Select wire —</option>
                  {wires.map(w => (
                    <option key={w.id} value={w.id}>{wireLabel(w)}</option>
                  ))}
                </select>
                {formErrors.wire_id && <span className="field-error">{formErrors.wire_id}</span>}
              </div>
              <div className="form-group">
                <label>Conversion Ratio (nos/kg) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className={formErrors.conversion_ratio_per_kg ? 'error' : ''}
                  value={form.conversion_ratio_per_kg}
                  onChange={e => setForm(f => ({ ...f, conversion_ratio_per_kg: e.target.value }))}
                  placeholder="e.g. 800"
                />
                {formErrors.conversion_ratio_per_kg && (
                  <span className="field-error">{formErrors.conversion_ratio_per_kg}</span>
                )}
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-add" type="submit" disabled={saving}>
                {saving ? 'SAVING…' : 'SAVE'}
              </button>
              <button className="btn-clear" type="button"
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setFormErrors({}) }}>
                CANCEL
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Screw</th>
              <th>Wire Type</th>
              <th>Ratio (nos/kg)</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
            {!loading && records.length === 0 && (
              <tr><td colSpan={6} className="empty">No conversions added yet.</td></tr>
            )}
            {records.map((row, i) => (
              <tr key={row.id}>
                <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                {editId === row.id ? (
                  <>
                    <td>
                      <select
                        className={`mri-sel${editErrors.screw_id ? ' error' : ''}`}
                        value={editData.screw_id}
                        onChange={e => setEditData(d => ({ ...d, screw_id: e.target.value }))}
                        style={{ minWidth: 160 }}
                      >
                        {screws.map(s => (
                          <option key={s.id} value={s.id}>{s.screw_code} – {s.screw_name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className={`mri-sel${editErrors.wire_id ? ' error' : ''}`}
                        value={editData.wire_id}
                        onChange={e => setEditData(d => ({ ...d, wire_id: e.target.value }))}
                        style={{ minWidth: 130 }}
                      >
                        {wires.map(w => (
                          <option key={w.id} value={w.id}>{wireLabel(w)}</option>
                        ))}
                      </select>
                      {editErrors.wire_id && <div className="field-error">{editErrors.wire_id}</div>}
                    </td>
                    <td>
                      <input
                        type="number" step="0.01" min="0.01"
                        className={`mri${editErrors.conversion_ratio_per_kg ? ' error' : ''}`}
                        value={editData.conversion_ratio_per_kg}
                        onChange={e => setEditData(d => ({ ...d, conversion_ratio_per_kg: e.target.value }))}
                        style={{ width: 90 }}
                      />
                      {editErrors.conversion_ratio_per_kg && <div className="field-error">{editErrors.conversion_ratio_per_kg}</div>}
                    </td>
                    <td>
                      <span className={`badge ${row.status === 'Active' ? 'b-ok' : 'b-warn'}`}>{row.status}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-add" style={{ fontSize: 11, padding: '5px 12px' }} onClick={() => handleEditSave(row.id)}>SAVE</button>
                        <button className="btn-clear" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => { setEditId(null); setEditErrors({}) }}>CANCEL</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td>
                      <span style={{ fontFamily: 'var(--cond)', fontWeight: 600, fontSize: 12 }}>
                        {row.screw?.screw_code}
                      </span>
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}> – {row.screw?.screw_name}</span>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {row.wire ? wireLabel(row.wire) : '—'}
                    </td>
                    <td className="num-cell">
                      {row.conversion_ratio_per_kg}<span className="unit">nos/kg</span>
                    </td>
                    <td>
                      <span className={`badge ${row.status === 'Active' ? 'b-ok' : 'b-warn'}`}>{row.status}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-icon" onClick={() => startEdit(row)}>EDIT</button>
                        <button className="btn-icon" onClick={() => toggleStatus(row)}
                          style={{ color: row.status === 'Active' ? 'var(--red)' : 'var(--green)' }}>
                          {row.status === 'Active' ? 'DEACTIVATE' : 'ACTIVATE'}
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
