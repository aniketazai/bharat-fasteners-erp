import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

export default function PlatingTypes() {
  const { user } = useAuth()
  const [records, setRecords]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [newName, setNewName]       = useState('')
  const [formError, setFormError]   = useState('')
  const [saving, setSaving]         = useState(false)
  const [editId, setEditId]         = useState(null)
  const [editName, setEditName]     = useState('')
  const [editError, setEditError]   = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('plating_type_master')
      .select('*')
      .order('plating_name')
    setRecords(data || [])
    setLoading(false)
  }

  function isDup(name, excludeId = null) {
    return records.some(
      r => r.id !== excludeId && r.plating_name.toLowerCase() === name.trim().toLowerCase()
    )
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim())     { setFormError('Name is required.'); return }
    if (isDup(newName))      { setFormError('Plating type already exists.'); return }

    setSaving(true)
    const { error } = await supabase.from('plating_type_master').insert({
      plating_name: newName.trim(),
      created_by:   user?.id,
    })
    setSaving(false)
    if (error) { setFormError(error.message); return }
    setNewName('')
    setShowForm(false)
    load()
  }

  async function handleEditSave(id) {
    setEditError('')
    if (!editName.trim())       { setEditError('Name is required.'); return }
    if (isDup(editName, id))    { setEditError('Plating type already exists.'); return }

    const { error } = await supabase.from('plating_type_master')
      .update({ plating_name: editName.trim() })
      .eq('id', id)
    if (error) { setEditError(error.message); return }
    setEditId(null)
    load()
  }

  async function toggleStatus(row) {
    const next = row.status === 'Active' ? 'Inactive' : 'Active'
    await supabase.from('plating_type_master').update({ status: next }).eq('id', row.id)
    load()
  }

  const active   = records.filter(r => r.status === 'Active').length
  const inactive = records.filter(r => r.status === 'Inactive').length

  return (
    <div className="main page-enter">
      <div className="sh">
        <span className="sh-num">M5</span>
        <span className="sh-title">PLATING TYPES</span>
        <span className="sh-desc">Plating method master · {records.length} records</span>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(3,1fr)', maxWidth: 480 }}>
        <div className="stat">
          <div className="stat-n">{records.length}</div>
          <div className="stat-l">Total Types</div>
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
          onClick={() => { setShowForm(v => !v); setFormError(''); setNewName('') }}
        >
          {showForm ? '✕  CANCEL' : '+ ADD PLATING TYPE'}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <div className="form-title">NEW PLATING TYPE</div>
          <form onSubmit={handleAdd}>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
              <div className="form-group">
                <label>Plating Name *</label>
                <input
                  className={formError ? 'error' : ''}
                  value={newName}
                  onChange={e => { setNewName(e.target.value); setFormError('') }}
                  placeholder="e.g. Nickel"
                  autoFocus
                />
                {formError && <span className="field-error">{formError}</span>}
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-add" type="submit" disabled={saving}>
                {saving ? 'SAVING…' : 'SAVE'}
              </button>
              <button
                className="btn-clear"
                type="button"
                onClick={() => { setShowForm(false); setNewName(''); setFormError('') }}
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
              <th>Plating Type</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="empty">Loading…</td></tr>
            )}
            {!loading && records.length === 0 && (
              <tr><td colSpan={4} className="empty">No plating types found.</td></tr>
            )}
            {records.map((row, i) => (
              <tr key={row.id}>
                <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                {editId === row.id ? (
                  <>
                    <td>
                      <input
                        className={`mri${editError ? ' error' : ''}`}
                        value={editName}
                        onChange={e => { setEditName(e.target.value); setEditError('') }}
                        style={{ width: 180 }}
                        autoFocus
                      />
                      {editError && <div className="field-error">{editError}</div>}
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
                          onClick={() => { setEditId(null); setEditError('') }}
                        >
                          CANCEL
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ fontWeight: 500 }}>{row.plating_name}</td>
                    <td>
                      <span className={`badge ${row.status === 'Active' ? 'b-ok' : 'b-warn'}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn-icon"
                          onClick={() => { setEditId(row.id); setEditName(row.plating_name); setEditError('') }}
                        >
                          EDIT
                        </button>
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
