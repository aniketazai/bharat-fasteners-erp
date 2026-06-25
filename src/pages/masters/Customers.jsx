import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const EMPTY_FORM = { customer_name: '', contact_person: '', phone: '', address: '' }

export default function Customers() {
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
      .from('customer_master')
      .select('*')
      .order('customer_name')
    setRecords(data || [])
    setLoading(false)
  }

  function isDupName(name, excludeId = null) {
    return records.some(
      r => r.id !== excludeId && r.customer_name.toLowerCase() === name.trim().toLowerCase()
    )
  }

  async function handleAdd(e) {
    e.preventDefault()
    const errs = {}
    if (!form.customer_name.trim())      errs.customer_name = 'Customer name is required.'
    else if (isDupName(form.customer_name)) errs.customer_name = 'Customer name already exists.'
    if (Object.keys(errs).length) { setFormErrors(errs); return }

    setSaving(true)
    const { error } = await supabase.from('customer_master').insert({
      customer_name:  form.customer_name.trim(),
      contact_person: form.contact_person.trim() || null,
      phone:          form.phone.trim() || null,
      address:        form.address.trim() || null,
      created_by:     user?.id,
    })
    setSaving(false)
    if (error) { setFormErrors({ customer_name: error.message }); return }
    setForm(EMPTY_FORM)
    setShowForm(false)
    load()
  }

  function startEdit(row) {
    setEditId(row.id)
    setEditData({
      customer_name:  row.customer_name,
      contact_person: row.contact_person || '',
      phone:          row.phone || '',
      address:        row.address || '',
    })
    setEditErrors({})
  }

  async function handleEditSave(id) {
    const errs = {}
    if (!editData.customer_name.trim())       errs.customer_name = 'Customer name is required.'
    else if (isDupName(editData.customer_name, id)) errs.customer_name = 'Customer name already exists.'
    if (Object.keys(errs).length) { setEditErrors(errs); return }

    const { error } = await supabase.from('customer_master').update({
      customer_name:  editData.customer_name.trim(),
      contact_person: editData.contact_person.trim() || null,
      phone:          editData.phone.trim() || null,
      address:        editData.address.trim() || null,
    }).eq('id', id)
    if (error) { setEditErrors({ customer_name: error.message }); return }
    setEditId(null)
    load()
  }

  async function toggleStatus(row) {
    const next = row.status === 'Active' ? 'Inactive' : 'Active'
    await supabase.from('customer_master').update({ status: next }).eq('id', row.id)
    load()
  }

  const active   = records.filter(r => r.status === 'Active').length
  const inactive = records.filter(r => r.status === 'Inactive').length

  return (
    <div className="main page-enter">
      <div className="sh">
        <span className="sh-num">M4</span>
        <span className="sh-title">CUSTOMERS</span>
        <span className="sh-desc">Customer master · {records.length} records</span>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(3,1fr)', maxWidth: 480 }}>
        <div className="stat">
          <div className="stat-n">{records.length}</div>
          <div className="stat-l">Total Customers</div>
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
          {showForm ? '✕  CANCEL' : '+ ADD CUSTOMER'}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <div className="form-title">NEW CUSTOMER</div>
          <form onSubmit={handleAdd}>
            <div className="form-grid">
              <div className="form-group">
                <label>Customer Name *</label>
                <input
                  className={formErrors.customer_name ? 'error' : ''}
                  value={form.customer_name}
                  onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                  placeholder="e.g. Tata Motors Ltd."
                />
                {formErrors.customer_name && (
                  <span className="field-error">{formErrors.customer_name}</span>
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
                {saving ? 'SAVING…' : 'SAVE CUSTOMER'}
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
              <th>Customer Name</th>
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
              <tr><td colSpan={7} className="empty">No customers found.</td></tr>
            )}
            {records.map((row, i) => (
              <tr key={row.id}>
                <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                {editId === row.id ? (
                  <>
                    <td>
                      <input
                        className={`mri${editErrors.customer_name ? ' error' : ''}`}
                        value={editData.customer_name}
                        onChange={e => setEditData(d => ({ ...d, customer_name: e.target.value }))}
                        style={{ minWidth: 150 }}
                      />
                      {editErrors.customer_name && (
                        <div className="field-error">{editErrors.customer_name}</div>
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
                    <td style={{ fontWeight: 500 }}>{row.customer_name}</td>
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
