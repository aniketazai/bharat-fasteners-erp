import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

const EMPTY_FORM = { screw_name: '', wire_id: '', conversion_ratio_per_kg: '' }

function wireLabel(w) { return w ? `${w.diameter_mm}mm – ${w.grade}` : '—' }

// Screw code is still stored on every record (Orders, Plating, Production,
// Dispatch and Finished Goods all key off it), but it's never shown or typed
// separately here — it's just set to match the screw name, so there's only
// one thing to manage: the name.
function isDupName(records, name, excludeId = null) {
  return records.some(
    r => r.id !== excludeId && r.screw_name.trim().toLowerCase() === name.trim().toLowerCase()
  )
}

export default function OutputScrews() {
  const { user } = useAuth()
  const [records, setRecords]       = useState([])
  const [wires, setWires]           = useState([])
  const [convByScrew, setConvByScrew] = useState({}) // screw_id -> conversion_master row (matching rm_wire_id)
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
    const [screwRes, wireRes, convRes] = await Promise.all([
      supabase.from('output_screw_master').select('*').order('screw_code'),
      supabase.from('rm_wire_master').select('id, diameter_mm, grade').eq('status', 'Active').order('diameter_mm'),
      supabase.from('conversion_master').select('*'),
    ])
    const screws = screwRes.data || []
    const conv   = convRes.data || []
    // For each screw, find the conversion_master row matching its default wire
    // (rm_wire_id) so the ratio shown here lines up with the wire type shown here.
    const map = {}
    for (const s of screws) {
      if (s.rm_wire_id) {
        map[s.id] = conv.find(c => c.screw_id === s.id && c.wire_id === s.rm_wire_id) || null
      }
    }
    setRecords(screws)
    setWires(wireRes.data || [])
    setConvByScrew(map)
    setLoading(false)
  }

  function validate(data, excludeId = null) {
    const errs = {}
    if (!data.screw_name.trim())                        errs.screw_name = 'Screw name is required.'
    else if (isDupName(records, data.screw_name, excludeId)) errs.screw_name = 'A screw with this name already exists.'
    if (data.conversion_ratio_per_kg) {
      const ratio = parseFloat(data.conversion_ratio_per_kg)
      if (isNaN(ratio) || ratio <= 0) errs.conversion_ratio_per_kg = 'Ratio must be > 0.'
      if (!data.wire_id) errs.wire_id = 'Select a wire type to go with the ratio.'
    }
    return errs
  }

  // Saves the screw's wire type (rm_wire_id) and, if given, upserts the
  // matching conversion_master row so the nos/kg ratio travels with it.
  async function saveWireAndConversion(screwId, wireId, ratio) {
    await supabase.from('output_screw_master').update({ rm_wire_id: wireId || null }).eq('id', screwId)

    if (!wireId || !ratio) return null
    const { data: existing } = await supabase
      .from('conversion_master')
      .select('id')
      .eq('screw_id', screwId)
      .eq('wire_id', wireId)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase.from('conversion_master')
        .update({ conversion_ratio_per_kg: parseFloat(ratio) })
        .eq('id', existing.id)
      return error
    } else {
      const { error } = await supabase.from('conversion_master').insert({
        screw_id: screwId,
        wire_id: wireId,
        conversion_ratio_per_kg: parseFloat(ratio),
        created_by: user?.id,
      })
      return error
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) { setFormErrors(errs); return }

    setSaving(true)
    const { data, error } = await supabase.from('output_screw_master').insert({
      screw_code: form.screw_name.trim(),
      screw_name: form.screw_name.trim(),
      created_by: user?.id,
    }).select()
    if (error || !data?.length) { setSaving(false); setFormErrors({ screw_name: error?.message || 'Failed to create screw.' }); return }

    if (form.wire_id) {
      const convErr = await saveWireAndConversion(data[0].id, form.wire_id, form.conversion_ratio_per_kg)
      if (convErr) { setSaving(false); setFormErrors({ wire_id: convErr.message }); return }
    }

    setSaving(false)
    setForm(EMPTY_FORM)
    setShowForm(false)
    load()
  }

  function startEdit(row) {
    setEditId(row.id)
    const conv = convByScrew[row.id]
    setEditData({
      screw_name: row.screw_name,
      wire_id: row.rm_wire_id || '',
      conversion_ratio_per_kg: conv ? String(conv.conversion_ratio_per_kg) : '',
    })
    setEditErrors({})
  }

  async function handleEditSave(id) {
    const errs = validate(editData, id)
    if (Object.keys(errs).length) { setEditErrors(errs); return }

    const { error } = await supabase.from('output_screw_master').update({
      screw_code: editData.screw_name.trim(),
      screw_name: editData.screw_name.trim(),
    }).eq('id', id)
    if (error) { setEditErrors({ screw_name: error.message }); return }

    const convErr = await saveWireAndConversion(id, editData.wire_id, editData.conversion_ratio_per_kg)
    if (convErr) { setEditErrors({ wire_id: convErr.message }); return }

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
    ? records.filter(r => r.screw_name.toLowerCase().includes(search.toLowerCase()))
    : records

  const wireMap = Object.fromEntries(wires.map(w => [w.id, w]))

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
          placeholder="Search screw name…"
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
                <label>Screw Name *</label>
                <input
                  className={formErrors.screw_name ? 'error' : ''}
                  value={form.screw_name}
                  onChange={e => setForm(f => ({ ...f, screw_name: e.target.value }))}
                  placeholder="e.g. M4x12 CSK Screw"
                />
                {formErrors.screw_name && <span className="field-error">{formErrors.screw_name}</span>}
              </div>
              <div className="form-group">
                <label>Wire Type</label>
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
                <label>Conversion Ratio (nos/kg)</label>
                <input
                  type="number" step="0.01" min="0.01"
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
              <th>Screw Name</th>
              <th>Wire Type</th>
              <th>Conversion (nos/kg)</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="empty">
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
                        className={`mri${editErrors.screw_name ? ' error' : ''}`}
                        value={editData.screw_name}
                        onChange={e => setEditData(d => ({ ...d, screw_name: e.target.value }))}
                        style={{ minWidth: 180 }}
                      />
                      {editErrors.screw_name && <div className="field-error">{editErrors.screw_name}</div>}
                    </td>
                    <td>
                      <select
                        className={`mri-sel${editErrors.wire_id ? ' error' : ''}`}
                        value={editData.wire_id}
                        onChange={e => setEditData(d => ({ ...d, wire_id: e.target.value }))}
                        style={{ minWidth: 130 }}
                      >
                        <option value="">— none —</option>
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
                        placeholder="e.g. 800"
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
                    <td>{row.screw_name}</td>
                    <td style={{ fontSize: 12 }}>{wireLabel(wireMap[row.rm_wire_id])}</td>
                    <td className="num-cell">
                      {convByScrew[row.id]
                        ? <>{convByScrew[row.id].conversion_ratio_per_kg}<span className="unit">nos/kg</span></>
                        : '—'}
                    </td>
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
