import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const GRADES = ['Grade-1', 'Grade-2', 'Grade-3', 'Grade-4', 'Grade-5', 'Grade-6']
const EMPTY_FORM = { diameter_mm: '', grade: 'Grade-1' }

function wireLabel(r) {
  return `${r.diameter_mm}mm – ${r.grade}`
}

export default function RMWire() {
  const { user } = useAuth()
  const [records, setRecords]       = useState([])
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
    const { data } = await supabase
      .from('rm_wire_master')
      .select('*')
      .order('diameter_mm')
    setRecords(data || [])
    setLoading(false)
  }

  function isDupCombo(diameter, grade, excludeId = null) {
    const d = parseFloat(diameter)
    return records.some(
      r => r.id !== excludeId &&
        parseFloat(r.diameter_mm) === d &&
        r.grade === grade
    )
  }

  async function handleAdd(e) {
    e.preventDefault()
    const errs = {}
    const d = parseFloat(form.diameter_mm)
    if (!form.diameter_mm || isNaN(d) || d <= 0) errs.diameter_mm = 'Enter a valid diameter > 0.'
    else if (isDupCombo(form.diameter_mm, form.grade)) errs.diameter_mm = 'This diameter + grade combination already exists.'
    if (Object.keys(errs).length) { setFormErrors(errs); return }

    setSaving(true)
    const { error } = await supabase.from('rm_wire_master').insert({
      diameter_mm: d,
      grade:       form.grade,
      created_by:  user?.id,
    })
    setSaving(false)
    if (error) { setFormErrors({ diameter_mm: error.message }); return }
    setForm(EMPTY_FORM)
    setShowForm(false)
    load()
  }

  function startEdit(row) {
    setEditId(row.id)
    setEditData({ diameter_mm: String(row.diameter_mm), grade: row.grade })
    setEditErrors({})
  }

  async function handleEditSave(id) {
    const errs = {}
    const d = parseFloat(editData.diameter_mm)
    if (!editData.diameter_mm || isNaN(d) || d <= 0) errs.diameter_mm = 'Enter a valid diameter > 0.'
    else if (isDupCombo(editData.diameter_mm, editData.grade, id)) errs.diameter_mm = 'This diameter + grade combination already exists.'
    if (Object.keys(errs).length) { setEditErrors(errs); return }

    const { error } = await supabase.from('rm_wire_master').update({
      diameter_mm: d,
      grade:       editData.grade,
    }).eq('id', id)
    if (error) { setEditErrors({ diameter_mm: error.message }); return }
    setEditId(null)
    load()
  }

  async function toggleStatus(row) {
    const next = row.status === 'Active' ? 'Inactive' : 'Active'
    await supabase.from('rm_wire_master').update({ status: next }).eq('id', row.id)
    load()
  }

  const active   = records.filter(r => r.status === 'Active').length
  const inactive = records.filter(r => r.status === 'Inactive').length

  return (
    <div className="main page-enter">
      <div className="sh">
        <span className="sh-num">M2</span>
        <span className="sh-title">RM WIRE</span>
        <span className="sh-desc">Raw material wire master · {records.length} records</span>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(3,1fr)', maxWidth: 480 }}>
        <div className="stat">
          <div className="stat-n">{records.length}</div>
          <div className="stat-l">Total Wires</div>
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
          {showForm ? '✕  CANCEL' : '+ ADD WIRE'}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <div className="form-title">NEW RM WIRE</div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
            Unique constraint: diameter + grade combination must be unique.
          </p>
          <form onSubmit={handleAdd}>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
              <div className="form-group">
                <label>Diameter (mm) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  className={formErrors.diameter_mm ? 'error' : ''}
                  value={form.diameter_mm}
                  onChange={e => setForm(f => ({ ...f, diameter_mm: e.target.value }))}
                  placeholder="e.g. 3.88"
                />
                {formErrors.diameter_mm && (
                  <span className="field-error">{formErrors.diameter_mm}</span>
                )}
              </div>
              <div className="form-group">
                <label>Grade *</label>
                <select
                  value={form.grade}
                  onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
                >
                  {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
              Unit: <strong>kg</strong> (fixed)
            </div>
            <div className="form-actions">
              <button className="btn-add" type="submit" disabled={saving}>
                {saving ? 'SAVING…' : 'SAVE WIRE'}
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
              <th>Diameter</th>
              <th>Grade</th>
              <th>Unit</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="empty">Loading…</td></tr>
            )}
            {!loading && records.length === 0 && (
              <tr><td colSpan={6} className="empty">No wire types found.</td></tr>
            )}
            {records.map((row, i) => (
              <tr key={row.id}>
                <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                {editId === row.id ? (
                  <>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min="0.1"
                        className={`mri${editErrors.diameter_mm ? ' error' : ''}`}
                        value={editData.diameter_mm}
                        onChange={e => setEditData(d => ({ ...d, diameter_mm: e.target.value }))}
                        style={{ width: 90 }}
                      />
                      {editErrors.diameter_mm && (
                        <div className="field-error">{editErrors.diameter_mm}</div>
                      )}
                    </td>
                    <td>
                      <select
                        className="mri-sel"
                        value={editData.grade}
                        onChange={e => setEditData(d => ({ ...d, grade: e.target.value }))}
                        style={{ width: 100 }}
                      >
                        {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>kg</td>
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
                    <td className="num-cell">{row.diameter_mm}<span className="unit">mm</span></td>
                    <td>{row.grade}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>kg</td>
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
    </div>
  )
}
