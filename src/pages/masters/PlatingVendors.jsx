import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const EMPTY_FORM = { vendor_name: '', contact_person: '', phone: '', address: '' }

export default function PlatingVendors() {
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
      .from('plating_vendor_master')
      .select('*')
      .order('vendor_name')
    setRecords(data || [])
    setLoading(false)
  }

  function isDupName(name, excludeId = null) {
    return records.some(
      r => r.id !== excludeId && r.vendor_name.toLowerCase() === name.trim().toLowerCase()
    )
  }

  async function handleAdd(e) {
    e.preventDefault()
    const errs = {}
    if (!form.vendor_name.trim())      errs.vendor_name = 'Vendor name is required.'
    else if (isDupName(form.vendor_name)) errs.vendor_name = 'Vendor name already exists.'
    if (Object.keys(errs).length) { setFormErrors(errs); return }

    setSaving(true)
    const { error } = await supabase.from('plating_vendor_master').insert({
      vendor_name:    form.vendor_name.trim(),
      contact_person: form.contact_person.trim() || null,
      phone:          form.phone.trim() || null,
      address:        form.address.trim() || null,
      created_by:     user?.id,
    })
    setSaving(false)
    if (error) { setFormErrors({ vendor_name: error.message }); return }
    setForm(EMPTY_FORM)
    setShowForm(false)
    load()
  }

  function startEdit(row) {
    setEditId(row.id)
    setEditData({
      vendor_name:    row.vendor_name,
      contact_person: row.contact_person || '',
      phone:          row.phone || '',
      address:        row.address || '',
    })
    setEditErrors({})
  }

  async function handleEditSave(id) {
    const errs = {}
    if (!editData.vendor_name.trim())       errs.vendor_name = 'Vendor name is required.'
    else if (isDupName(editData.vendor_name, id)) errs.vendor_name = 'Vendor name already exists.'
    if (Object.keys(errs).length) { setEditErrors(errs); return }

    const { error } = await supabase.from('plating_vendor_master').update({
      vendor_name:    editData.vendor_name.trim(),
      contact_person: editData.contact_person.trim() || null,
      phone:          editData.phone.trim() || null,
      address:        editData.address.trim() || null,
    }).eq('id', id)
    if (error) { setEditErrors({ vendor_name: error.message }); return }
    setEditId(null)
    load()
  }

  async function toggleStatus(row) {
    const next = row.status === 'Active' ? 'Inactive' : 'Active'
    await supabase.from('plating_vendor_master').update({ status: next }).eq('id', row.id)
    load()
  }

  const active   = records.filter(r => r.status === 'Active').length
  const inactive = records.filter(r => r.status === 'Inactive').length

  return (
    <div className="main page-enter">
      <div className="sh">
        <span className="sh-num">M7</span>
        <span className="sh-title">PLATING VENDORS</span>
        <span className="sh-desc">Plating vendor master · {records.length} records</span>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(3,1fr)', maxWidth: 480 }}>
        <div className="stat">
          <div className="stat-n">{records.length}</div>
          <div className="stat-l">Total Vendors</div>
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
          {showForm ? '✕  CANCEL' : '+ ADD VENDOR'}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <div className="form-title">NEW PLATING VENDOR</div>
          <form onSubmit={handleAdd}>
            <div className="form-grid">
              <div className="form-group">
                <label>Vendor Name *</label>
                <input
                  className={formErrors.vendor_name ? 'error' : ''}
                  value={form.vendor_name}
                  onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))}
                  placeholder="e.g. Om Dinanath Industries"
                />
                {formErrors.vendor_name && (
                  <span className="field-error">{formErrors.vendor_name}</span>
                )}
              </div>
              <div className="form-group">
                <label>Contact Person</label>
                <input
                  value={form.contact_person}
                  onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))}
                  placeholder="e.g. Ramesh Sharma"
                />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="e.g. 9876543210"
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Address</label>
                <input
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="Full address"
                />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-add" type="submit" disabled={saving}>
                {saving ? 'SAVING…' : 'SAVE VENDOR'}
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
              <th>Vendor Name</th>
              <th>Contact Person</th>
              <th>Phone</th>
              <th>Address</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="empty">Loading…</td></tr>
            )}
            {!loading && records.length === 0 && (
              <tr><td colSpan={7} className="empty">No plating vendors found.</td></tr>
            )}
            {records.map((row, i) => (
              <tr key={row.id}>
                <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                {editId === row.id ? (
                  <>
                    <td>
                      <input
                        className={`mri${editErrors.vendor_name ? ' error' : ''}`}
                        value={editData.vendor_name}
                        onChange={e => setEditData(d => ({ ...d, vendor_name: e.target.value }))}
                        style={{ minWidth: 150 }}
                      />
                      {editErrors.vendor_name && (
                        <div className="field-error">{editErrors.vendor_name}</div>
                      )}
                    </td>
                    <td>
                      <input
                        className="mri"
                        value={editData.contact_person}
                        onChange={e => setEditData(d => ({ ...d, contact_person: e.target.value }))}
                        style={{ width: 120 }}
                      />
                    </td>
                    <td>
                      <input
                        className="mri"
                        value={editData.phone}
                        onChange={e => setEditData(d => ({ ...d, phone: e.target.value }))}
                        style={{ width: 110 }}
                      />
                    </td>
                    <td>
                      <input
                        className="mri"
                        value={editData.address}
                        onChange={e => setEditData(d => ({ ...d, address: e.target.value }))}
                        style={{ minWidth: 160 }}
                      />
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
                    <td style={{ fontWeight: 500 }}>{row.vendor_name}</td>
                    <td style={{ fontSize: 12 }}>{row.contact_person || <span style={{ color: 'var(--dim)' }}>—</span>}</td>
                    <td style={{ fontSize: 12 }}>{row.phone || <span style={{ color: 'var(--dim)' }}>—</span>}</td>
                    <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.address || <span style={{ color: 'var(--dim)' }}>—</span>}
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
