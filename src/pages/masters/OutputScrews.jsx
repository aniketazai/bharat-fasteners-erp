import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const EMPTY_FORM = { screw_code: '', screw_name: '' }

export default function OutputScrews() {
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
  const [search, setSearch]         = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('output_screw_master')
      .select('*')
      .order('screw_code')
    setRecords(data || [])
    setLoading(false)
  }

  function isDupCode(code, excludeId = null) {
    return records.some(
      r => r.id !== excludeId && r.screw_code.toLowerCase() === code.trim().toLowerCase()
    )
  }

  function validate(data, excludeId = null) {
    const errs = {}
    if (!data.screw_code.trim())                   errs.screw_code = 'Screw code is required.'
    else if (isDupCode(data.screw_code, excludeId)) errs.screw_code = 'Screw code already exists.'
    if (!data.screw_name.trim())                   errs.screw_name = 'Screw name is required.'
    return errs
  }

  async function handleAdd(e) {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) { setFormErrors(errs); return }

    setSaving(true)
    const { error } = await supabase.from('output_screw_master').insert({
      screw_code: form.screw_code.trim().toUpperCase(),
      screw_name: form.screw_name.trim(),
      created_by: user?.id,
    })
    setSaving(false)
    if (error) { setFormErrors({ screw_code: error.message }); return }
    setForm(EMPTY_FORM)
    setShowForm(false)
    load()
  }

  function startEdit(row) {
    setEditId(row.id)
    setEditData({ screw_code: row.screw_code, screw_name: row.screw_name })
    setEditErrors({})
  }

  async function handleEditSave(id) {
    const errs = validate(editData, id)
    if (Object.keys(errs).length) { setEditErrors(errs); return }

    const { error } = await supabase.from('output_screw_master').update({
      screw_code: editData.screw_code.trim().toUpperCase(),
      screw_name: editData.screw_name.trim(),
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

  const active   = records.filter(r => r.status === 'Active').length
  const inactive = records.filter(r => r.status === 'Inactive').length
  const filtered = search.trim()
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
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
              <div className="form-group">
                <label>Screw Code *</label>
                <input
                  className={formErrors.screw_code ? 'error' : ''}
                  value={form.screw_code}
                  onChange={e => setForm(f => ({ ...f, screw_code: e.target.value }))}
                  placeholder="e.g. SC001"
                />
                {formErrors.screw_code && <span className="field-error">{formErrors.screw_code}</span>}
              </div>
              <div className="form-group">
                <label>Screw Name *</label>
                <input
                  className={formErrors.screw_name ? 'error' : ''}
                  value={form.screw_name}
                  onChange={e => setForm(f => ({ ...f, screw_name: e.target.value }))}
                  placeholder="e.g. M4x12 CSK Screw"
                />
                {formErrors.screw_name && <span className="field-error">{formErrors.screw_name}</span>}
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
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="empty">Loading…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="empty">
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
                        style={{ minWidth: 180 }}
                      />
                      {editErrors.screw_name && <div className="field-error">{editErrors.screw_name}</div>}
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
                    <td className="num-cell">{row.screw_code}</td>
                    <td>{row.screw_name}</td>
                    <td><span className={`badge ${row.status === 'Active' ? 'b-ok' : 'b-warn'}`}>{row.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-icon" onClick={() => startEdit(row)}>EDIT</button>
                        <button className="btn-icon" onClick={() => toggleStatus(row)} style={{ color: row.status === 'Active' ? 'var(--red)' : 'var(--green)' }}>
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
