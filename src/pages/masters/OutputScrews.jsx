import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const EMPTY_FORM = {
  screw_code:              '',
  screw_name:              '',
  die_spec:                '',
  rm_wire_id:              '',
  conversion_ratio_per_kg: '',
}

function wireLabel(w) {
  return `${w.diameter_mm}mm – ${w.grade}`
}

export default function OutputScrews() {
  const { user } = useAuth()
  const [records, setRecords]       = useState([])
  const [wires, setWires]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving]         = useState(false)
  const [editId, setEditId]         = useState(null)
  const [editData, setEditData]     = useState({})
  const [editErrors, setEditErrors] = useState({})
  const [search, setSearch]         = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [screwRes, wireRes] = await Promise.all([
      supabase.from('output_screw_master').select('*').order('screw_code'),
      supabase.from('rm_wire_master').select('*').eq('status', 'Active').order('diameter_mm'),
    ])
    setRecords(screwRes.data || [])
    setWires(wireRes.data || [])
    setLoading(false)
  }

  function isDupCode(code, excludeId = null) {
    return records.some(
      r => r.id !== excludeId && r.screw_code.toLowerCase() === code.trim().toLowerCase()
    )
  }

  function validate(data, excludeId = null) {
    const errs = {}
    if (!data.screw_code.trim())              errs.screw_code = 'Screw code is required.'
    else if (isDupCode(data.screw_code, excludeId)) errs.screw_code = 'Screw code already exists.'
    if (!data.screw_name.trim())              errs.screw_name = 'Screw name is required.'
    if (!data.rm_wire_id)                     errs.rm_wire_id = 'Select a wire type.'
    const ratio = parseFloat(data.conversion_ratio_per_kg)
    if (!data.conversion_ratio_per_kg || isNaN(ratio) || ratio <= 0)
      errs.conversion_ratio_per_kg = 'Enter a valid ratio > 0 (nos/kg).'
    return errs
  }

  async function handleAdd(e) {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) { setFormErrors(errs); return }

    setSaving(true)
    const { error } = await supabase.from('output_screw_master').insert({
      screw_code:              form.screw_code.trim().toUpperCase(),
      screw_name:              form.screw_name.trim(),
      die_spec:                form.die_spec.trim() || null,
      rm_wire_id:              form.rm_wire_id,
      conversion_ratio_per_kg: parseFloat(form.conversion_ratio_per_kg),
      created_by:              user?.id,
    })
    setSaving(false)
    if (error) { setFormErrors({ screw_code: error.message }); return }
    setForm(EMPTY_FORM)
    setShowForm(false)
    load()
  }

  function startEdit(row) {
    setEditId(row.id)
    setEditData({
      screw_code:              row.screw_code,
      screw_name:              row.screw_name,
      die_spec:                row.die_spec || '',
      rm_wire_id:              row.rm_wire_id || '',
      conversion_ratio_per_kg: String(row.conversion_ratio_per_kg),
    })
    setEditErrors({})
  }

  async function handleEditSave(id) {
    const errs = validate(editData, id)
    if (Object.keys(errs).length) { setEditErrors(errs); return }

    const { error } = await supabase.from('output_screw_master').update({
      screw_code:              editData.screw_code.trim().toUpperCase(),
      screw_name:              editData.screw_name.trim(),
      die_spec:                editData.die_spec.trim() || null,
      rm_wire_id:              editData.rm_wire_id,
      conversion_ratio_per_kg: parseFloat(editData.conversion_ratio_per_kg),
    }).eq('id', id)
    if (error) { setEditErrors({ screw_code: error.message }); return }
    setEditId(null)
    load()
  }

  async function toggleStatus(row) {
    const next = row.status === 'Active' ? 'Inactive' : 'Active'
    await supabase.from('output_screw_master').update({ status: next }).eq('id', row.id)
    load()
  }

  const wireMap    = Object.fromEntries(wires.map(w => [w.id, w]))
  const active     = records.filter(r => r.status === 'Active').length
  const inactive   = records.filter(r => r.status === 'Inactive').length
  const filtered   = search.trim()
    ? records.filter(r =>
        r.screw_code.toLowerCase().includes(search.toLowerCase()) ||
        r.screw_name.toLowerCase().includes(search.toLowerCase())
      )
    : records

  return (
    <div className="main page-enter">
      <div className="sh">
        <span className="sh-num">M3</span>
        <span className="sh-title">OUTPUT SCREWS</span>
        <span className="sh-desc">Screw product master · {records.length} records</span>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(3,1fr)', maxWidth: 480 }}>
        <div className="stat">
          <div className="stat-n">{records.length}</div>
          <div className="stat-l">Total Screws</div>
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10 }}>
        <input
          style={{
            background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 5,
            padding: '7px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', width: 220,
          }}
          placeholder="Search code or name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button
          className="btn-add"
          onClick={() => { setShowForm(v => !v); setFormErrors({}); setForm(EMPTY_FORM) }}
        >
          {showForm ? '✕  CANCEL' : '+ ADD SCREW'}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <div className="form-title">NEW OUTPUT SCREW</div>
          <form onSubmit={handleAdd}>
            <div className="form-grid">
              <div className="form-group">
                <label>Screw Code *</label>
                <input
                  className={formErrors.screw_code ? 'error' : ''}
                  value={form.screw_code}
                  onChange={e => setForm(f => ({ ...f, screw_code: e.target.value }))}
                  placeholder="e.g. SC-001"
                />
                {formErrors.screw_code && <span className="field-error">{formErrors.screw_code}</span>}
              </div>
              <div className="form-group">
                <label>Screw Name *</label>
                <input
                  className={formErrors.screw_name ? 'error' : ''}
                  value={form.screw_name}
                  onChange={e => setForm(f => ({ ...f, screw_name: e.target.value }))}
                  placeholder="e.g. M6 × 25 Hex Bolt"
                />
                {formErrors.screw_name && <span className="field-error">{formErrors.screw_name}</span>}
              </div>
              <div className="form-group">
                <label>Die Spec / Size</label>
                <input
                  value={form.die_spec}
                  onChange={e => setForm(f => ({ ...f, die_spec: e.target.value }))}
                  placeholder="e.g. M6"
                />
              </div>
              <div className="form-group">
                <label>RM Wire *</label>
                <select
                  className={formErrors.rm_wire_id ? 'error' : ''}
                  value={form.rm_wire_id}
                  onChange={e => setForm(f => ({ ...f, rm_wire_id: e.target.value }))}
                >
                  <option value="">— Select wire —</option>
                  {wires.map(w => (
                    <option key={w.id} value={w.id}>{wireLabel(w)}</option>
                  ))}
                </select>
                {formErrors.rm_wire_id && <span className="field-error">{formErrors.rm_wire_id}</span>}
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
                  placeholder="e.g. 430"
                />
                {formErrors.conversion_ratio_per_kg && (
                  <span className="field-error">{formErrors.conversion_ratio_per_kg}</span>
                )}
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-add" type="submit" disabled={saving}>
                {saving ? 'SAVING…' : 'SAVE SCREW'}
              </button>
              <button
                className="btn-clear"
                type="button"
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setFormErrors({}) }}
              >
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
              <th>Code</th>
              <th>Screw Name</th>
              <th>Die Spec</th>
              <th>RM Wire</th>
              <th>Ratio (nos/kg)</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="empty">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={8} className="empty">
                {search ? 'No screws match your search.' : 'No screws found.'}
              </td></tr>
            )}
            {filtered.map((row, i) => (
              <tr key={row.id}>
                <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                {editId === row.id ? (
                  <>
                    <td>
                      <input
                        className={`mri${editErrors.screw_code ? ' error' : ''}`}
                        value={editData.screw_code}
                        onChange={e => setEditData(d => ({ ...d, screw_code: e.target.value }))}
                        style={{ width: 90 }}
                      />
                      {editErrors.screw_code && <div className="field-error">{editErrors.screw_code}</div>}
                    </td>
                    <td>
                      <input
                        className={`mri${editErrors.screw_name ? ' error' : ''}`}
                        value={editData.screw_name}
                        onChange={e => setEditData(d => ({ ...d, screw_name: e.target.value }))}
                        style={{ minWidth: 140 }}
                      />
                      {editErrors.screw_name && <div className="field-error">{editErrors.screw_name}</div>}
                    </td>
                    <td>
                      <input
                        className="mri"
                        value={editData.die_spec}
                        onChange={e => setEditData(d => ({ ...d, die_spec: e.target.value }))}
                        style={{ width: 70 }}
                      />
                    </td>
                    <td>
                      <select
                        className={`mri-sel${editErrors.rm_wire_id ? ' error' : ''}`}
                        value={editData.rm_wire_id}
                        onChange={e => setEditData(d => ({ ...d, rm_wire_id: e.target.value }))}
                        style={{ minWidth: 130 }}
                      >
                        <option value="">— Select —</option>
                        {wires.map(w => (
                          <option key={w.id} value={w.id}>{wireLabel(w)}</option>
                        ))}
                      </select>
                      {editErrors.rm_wire_id && <div className="field-error">{editErrors.rm_wire_id}</div>}
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        className={`mri${editErrors.conversion_ratio_per_kg ? ' error' : ''}`}
                        value={editData.conversion_ratio_per_kg}
                        onChange={e => setEditData(d => ({ ...d, conversion_ratio_per_kg: e.target.value }))}
                        style={{ width: 80 }}
                      />
                      {editErrors.conversion_ratio_per_kg && (
                        <div className="field-error">{editErrors.conversion_ratio_per_kg}</div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${row.status === 'Active' ? 'b-ok' : 'b-warn'}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn-add"
                          style={{ fontSize: 11, padding: '5px 12px' }}
                          onClick={() => handleEditSave(row.id)}
                        >
                          SAVE
                        </button>
                        <button
                          className="btn-clear"
                          style={{ fontSize: 11, padding: '5px 10px' }}
                          onClick={() => { setEditId(null); setEditErrors({}) }}
                        >
                          CANCEL
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="num-cell">{row.screw_code}</td>
                    <td>{row.screw_name}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{row.die_spec || '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {wireMap[row.rm_wire_id] ? wireLabel(wireMap[row.rm_wire_id]) : '—'}
                    </td>
                    <td className="num-cell">
                      {row.conversion_ratio_per_kg}
                      <span className="unit">nos/kg</span>
                    </td>
                    <td>
                      <span className={`badge ${row.status === 'Active' ? 'b-ok' : 'b-warn'}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-icon" onClick={() => startEdit(row)}>EDIT</button>
                        <button
                          className="btn-icon"
                          onClick={() => toggleStatus(row)}
                          style={{ color: row.status === 'Active' ? 'var(--red)' : 'var(--green)' }}
                        >
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
      {search && filtered.length < records.length && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, textAlign: 'right' }}>
          Showing {filtered.length} of {records.length} records
        </div>
      )}
    </div>
  )
}
