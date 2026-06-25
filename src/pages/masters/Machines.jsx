import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const EMPTY_FORM = { machine_code: '', machine_name: '', machine_type: 'Header' }

export default function Machines() {
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
      .from('machines')
      .select('*')
      .order('machine_code')
    setRecords(data || [])
    setLoading(false)
  }

  function isDupCode(code, excludeId = null) {
    return records.some(
      r => r.id !== excludeId && r.machine_code.toLowerCase() === code.trim().toLowerCase()
    )
  }

  async function handleAdd(e) {
    e.preventDefault()
    const errs = {}
    if (!form.machine_code.trim()) errs.machine_code = 'Code is required.'
    else if (isDupCode(form.machine_code)) errs.machine_code = 'Machine code already exists.'
    if (!form.machine_name.trim()) errs.machine_name = 'Name is required.'
    if (Object.keys(errs).length) { setFormErrors(errs); return }

    setSaving(true)
    const { error } = await supabase.from('machines').insert({
      machine_code: form.machine_code.trim().toUpperCase(),
      machine_name: form.machine_name.trim(),
      machine_type: form.machine_type,
      created_by:   user?.id,
    })
    setSaving(false)
    if (error) { setFormErrors({ machine_code: error.message }); return }
    setForm(EMPTY_FORM)
    setShowForm(false)
    load()
  }

  function startEdit(row) {
    setEditId(row.id)
    setEditData({ machine_code: row.machine_code, machine_name: row.machine_name, machine_type: row.machine_type })
    setEditErrors({})
  }

  async function handleEditSave(id) {
    const errs = {}
    if (!editData.machine_code.trim()) errs.machine_code = 'Code is required.'
    else if (isDupCode(editData.machine_code, id)) errs.machine_code = 'Machine code already exists.'
    if (!editData.machine_name.trim()) errs.machine_name = 'Name is required.'
    if (Object.keys(errs).length) { setEditErrors(errs); return }

    const { error } = await supabase.from('machines').update({
      machine_code: editData.machine_code.trim().toUpperCase(),
      machine_name: editData.machine_name.trim(),
      machine_type: editData.machine_type,
    }).eq('id', id)
    if (error) { setEditErrors({ machine_code: error.message }); return }
    setEditId(null)
    load()
  }

  async function toggleStatus(row) {
    const next = row.status === 'Active' ? 'Inactive' : 'Active'
    await supabase.from('machines').update({ status: next }).eq('id', row.id)
    load()
  }

  const active   = records.filter(r => r.status === 'Active').length
  const inactive = records.filter(r => r.status === 'Inactive').length

  return (
    <div className="main page-enter">
      <div className="sh">
        <span className="sh-num">M1</span>
        <span className="sh-title">MACHINES</span>
        <span className="sh-desc">Header machine master · {records.length} records</span>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(3,1fr)', maxWidth: 480 }}>
        <div className="stat">
          <div className="stat-n">{records.length}</div>
          <div className="stat-l">Total Machines</div>
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
          {showForm ? '✕  CANCEL' : '+ ADD MACHINE'}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <div className="form-title">NEW MACHINE</div>
          <form onSubmit={handleAdd}>
            <div className="form-grid">
              <div className="form-group">
                <label>Machine Code *</label>
                <input
                  className={formErrors.machine_code ? 'error' : ''}
                  value={form.machine_code}
                  onChange={e => setForm(f => ({ ...f, machine_code: e.target.value }))}
                  placeholder="e.g. W1-H-11"
                />
                {formErrors.machine_code && <span className="field-error">{formErrors.machine_code}</span>}
              </div>
              <div className="form-group">
                <label>Machine Name *</label>
                <input
                  className={formErrors.machine_name ? 'error' : ''}
                  value={form.machine_name}
                  onChange={e => setForm(f => ({ ...f, machine_name: e.target.value }))}
                  placeholder="e.g. W1 Header 11"
                />
                {formErrors.machine_name && <span className="field-error">{formErrors.machine_name}</span>}
              </div>
              <div className="form-group">
                <label>Type</label>
                <select
                  value={form.machine_type}
                  onChange={e => setForm(f => ({ ...f, machine_type: e.target.value }))}
                >
                  <option value="Header">Header</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-add" type="submit" disabled={saving}>
                {saving ? 'SAVING…' : 'SAVE MACHINE'}
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
              <th>Machine Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="empty">Loading…</td></tr>
            )}
            {!loading && records.length === 0 && (
              <tr><td colSpan={6} className="empty">No machines found.</td></tr>
            )}
            {records.map((row, i) => (
              <tr key={row.id}>
                <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                {editId === row.id ? (
                  <>
                    <td>
                      <input
                        className={`mri${editErrors.machine_code ? ' error' : ''}`}
                        value={editData.machine_code}
                        onChange={e => setEditData(d => ({ ...d, machine_code: e.target.value }))}
                        style={{ width: 110 }}
                      />
                      {editErrors.machine_code && (
                        <div className="field-error">{editErrors.machine_code}</div>
                      )}
                    </td>
                    <td>
                      <input
                        className={`mri${editErrors.machine_name ? ' error' : ''}`}
                        value={editData.machine_name}
                        onChange={e => setEditData(d => ({ ...d, machine_name: e.target.value }))}
                      />
                      {editErrors.machine_name && (
                        <div className="field-error">{editErrors.machine_name}</div>
                      )}
                    </td>
                    <td>
                      <select
                        className="mri-sel"
                        value={editData.machine_type}
                        onChange={e => setEditData(d => ({ ...d, machine_type: e.target.value }))}
                        style={{ width: 90 }}
                      >
                        <option value="Header">Header</option>
                        <option value="Other">Other</option>
                      </select>
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
                    <td className="num-cell">{row.machine_code}</td>
                    <td>{row.machine_name}</td>
                    <td>
                      <span className={`badge ${row.machine_type === 'Header' ? 'b-blue' : 'b-orange'}`}>
                        {row.machine_type}
                      </span>
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
    </div>
  )
}
