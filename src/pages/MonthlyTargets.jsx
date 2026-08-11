import { useEffect, useRef, useState, Fragment } from 'react'
import { ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const EMPTY_ITEM = { screw_id: '', target_qty: '', notes: '' }

function monthLabel() {
  return new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

// Searchable screw combobox, excluding screws that already have a target for this customer
function ScrewPicker({ screws, excludeIds, value, onChange, hasError }) {
  const label = id => screws.find(s => s.id === id)?.screw_name || ''
  const [text, setText] = useState(() => label(value))
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => { setText(label(value)) }, [value, screws.length])
  useEffect(() => {
    function outside(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setText(label(value)) } }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [value, screws])

  const available = screws.filter(s => !excludeIds.has(s.id))
  const isTyping = text.length > 0 && text !== label(value)
  const filtered = isTyping ? available.filter(s => s.screw_name.toLowerCase().includes(text.toLowerCase())) : available

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={text}
        onChange={e => { setText(e.target.value); onChange(''); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Search screw type…"
        className={hasError ? 'error' : ''}
        style={{ width: '100%' }}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 300, background: '#fff', border: '1px solid var(--border)', borderRadius: 7, maxHeight: 220, overflowY: 'auto', boxShadow: '0 6px 20px rgba(0,0,0,.13)' }}>
          {filtered.map(s => (
            <div key={s.id}
              onMouseDown={() => { onChange(s.id); setText(s.screw_name); setOpen(false) }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <span style={{ fontFamily: 'var(--cond)', fontWeight: 600 }}>{s.screw_name}</span>
            </div>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 300, background: '#fff', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: 'var(--muted)', boxShadow: '0 6px 20px rgba(0,0,0,.13)' }}>
          {isTyping ? `No match for "${text}"` : 'All screw types already have a target for this party'}
        </div>
      )}
    </div>
  )
}

export default function MonthlyTargets() {
  const { user } = useAuth()
  const [customers, setCustomers]   = useState([])
  const [screws, setScrews]         = useState([])
  const [targetsByCust, setTByCust] = useState({}) // customer_id → [{id, screw_id, target_qty, notes}]
  const [orderedMap, setOrderedMap] = useState({})  // `${customer_id}|${screw_id}` → nos ordered this month
  const [orderedScrewsByCust, setOrderedScrews] = useState({}) // customer_id → Set(screw_id) ordered this month
  const [loading, setLoading]       = useState(true)
  const [expanded, setExpanded]     = useState({})  // customer_id → bool

  const [addingFor, setAddingFor]   = useState(null) // customer_id currently adding an item for
  const [itemForm, setItemForm]     = useState(EMPTY_ITEM)
  const [itemErrs, setItemErrs]     = useState({})
  const [saving, setSaving]         = useState(false)

  const [editRow, setEditRow]       = useState(null) // target row being edited {id, customer_id, screw_id, target_qty, notes}
  const [editQty, setEditQty]       = useState('')
  const [editErr, setEditErr]       = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

    const [custRes, targetRes, screwRes, itemRes] = await Promise.all([
      supabase.from('customer_master').select('id,customer_name').eq('status', 'Active').order('customer_name'),
      supabase.from('customer_monthly_targets').select('id, customer_id, screw_id, target_qty, notes'),
      supabase.from('output_screw_master').select('id,screw_name').eq('status', 'Active').order('screw_name'),
      // Filtered client-side — embedded-resource filtering on Supabase isn't
      // reliable here (same reasoning as RMRequirement.jsx / FinishedGoods.jsx).
      supabase.from('order_items').select('screw_id, order_qty, order:order_id(customer_id, order_date, status)'),
    ])

    setCustomers(custRes.data || [])
    setScrews(screwRes.data || [])

    const tByC = {}
    for (const t of (targetRes.data || [])) {
      if (!tByC[t.customer_id]) tByC[t.customer_id] = []
      tByC[t.customer_id].push(t)
    }
    setTByCust(tByC)

    const om = {}
    const osc = {}
    for (const it of (itemRes.data || [])) {
      const o = it.order
      if (!o || !o.customer_id || o.status === 'Cancelled') continue
      if (!o.order_date || o.order_date < monthStart || o.order_date > monthEnd) continue
      const key = `${o.customer_id}|${it.screw_id}`
      om[key] = (om[key] || 0) + (it.order_qty || 0)
      if (!osc[o.customer_id]) osc[o.customer_id] = new Set()
      osc[o.customer_id].add(it.screw_id)
    }
    setOrderedMap(om)
    setOrderedScrews(osc)

    setLoading(false)
  }

  function screwName(id) { return screws.find(s => s.id === id)?.screw_name || '—' }
  function toggleExpand(cid) { setExpanded(p => ({ ...p, [cid]: !p[cid] })) }

  function openAdd(cid, presetScrewId = '') {
    setExpanded(p => ({ ...p, [cid]: true }))
    setAddingFor(cid)
    setItemForm({ ...EMPTY_ITEM, screw_id: presetScrewId })
    setItemErrs({})
  }

  function validateItem(f) {
    const e = {}
    if (!f.screw_id) e.screw_id = 'Select a screw type.'
    const n = parseInt(f.target_qty)
    if (!f.target_qty || isNaN(n) || n <= 0) e.target_qty = 'Enter a target greater than 0.'
    return e
  }

  async function saveItem(ev) {
    ev.preventDefault()
    const errs = validateItem(itemForm)
    if (Object.keys(errs).length) { setItemErrs(errs); return }
    setSaving(true)
    const { error } = await supabase.from('customer_monthly_targets').insert({
      customer_id: addingFor,
      screw_id:    itemForm.screw_id,
      target_qty:  parseInt(itemForm.target_qty),
      notes:       itemForm.notes.trim() || null,
      created_by:  user?.id,
    })
    setSaving(false)
    if (error) { setItemErrs({ _: `Could not save: ${error.message}` }); return }
    setAddingFor(null)
    load()
  }

  function openEdit(row) {
    setEditRow(row)
    setEditQty(String(row.target_qty))
    setEditErr('')
  }

  async function saveEdit() {
    const n = parseInt(editQty)
    if (!editQty || isNaN(n) || n <= 0) { setEditErr('Enter a target greater than 0.'); return }
    const { error } = await supabase.from('customer_monthly_targets').update({ target_qty: n }).eq('id', editRow.id)
    if (error) { setEditErr(error.message); return }
    setEditRow(null)
    load()
  }

  async function deleteItem(id) {
    if (!window.confirm('Remove this target line?')) return
    await supabase.from('customer_monthly_targets').delete().eq('id', id)
    load()
  }

  const custRows = customers.map(c => {
    const trackedItems = targetsByCust[c.id] || []
    const trackedIds   = new Set(trackedItems.map(t => t.screw_id))
    const orderedIds   = orderedScrewsByCust[c.id] || new Set()
    // Screws ordered this month with no target set yet — surfaced automatically
    // so a new product a party has started ordering never goes unnoticed.
    const untrackedItems = [...orderedIds].filter(sid => !trackedIds.has(sid))
      .map(sid => ({ id: null, screw_id: sid, target_qty: 0, notes: null, virtual: true }))
    const items = [...trackedItems, ...untrackedItems]
    const totalTarget  = trackedItems.reduce((s, t) => s + t.target_qty, 0)
    const totalOrdered = items.reduce((s, t) => s + (orderedMap[`${c.id}|${t.screw_id}`] || 0), 0)
    const over = totalTarget > 0 && totalOrdered > totalTarget
    return {
      id: c.id, name: c.customer_name, items,
      itemCount: trackedItems.length, untrackedCount: untrackedItems.length,
      totalTarget, totalOrdered, remaining: totalTarget - totalOrdered, over,
    }
  }).sort((a, b) => {
    const aItems = a.itemCount + a.untrackedCount, bItems = b.itemCount + b.untrackedCount
    if (aItems !== bItems) return bItems - aItems
    return b.totalOrdered - a.totalOrdered
  })

  const trackedCount  = custRows.filter(r => r.itemCount > 0).length
  const grandTarget   = custRows.reduce((s, r) => s + r.totalTarget, 0)
  const grandOrdered  = custRows.reduce((s, r) => s + r.totalOrdered, 0)
  const overCount     = custRows.filter(r => r.over).length
  const newItemCount  = custRows.reduce((s, r) => s + r.untrackedCount, 0)

  return (
    <div className="main page-enter">
      <div className="sh">
        <span className="sh-num">MT</span>
        <span className="sh-title">MONTHLY ORDER TARGET</span>
        <span className="sh-desc">{monthLabel()} · target per party per screw type · auto-syncs with Orders</span>
      </div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
        <div className="stat"><div className="stat-n">{trackedCount}</div><div className="stat-l">Parties Tracked</div></div>
        <div className="stat" style={{ borderLeftColor: 'var(--accent)' }}>
          <div className="stat-n" style={{ color: 'var(--accent)' }}>{grandTarget.toLocaleString()}</div><div className="stat-l">Total Target (nos)</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--green)' }}>
          <div className="stat-n" style={{ color: 'var(--green)' }}>{grandOrdered.toLocaleString()}</div><div className="stat-l">Ordered This Month</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--red)' }}>
          <div className="stat-n" style={{ color: overCount > 0 ? 'var(--red)' : 'var(--dim)' }}>{overCount}</div><div className="stat-l">Parties Over Target</div>
        </div>
        <div className="stat" style={{ borderLeftColor: '#D97706' }}>
          <div className="stat-n" style={{ color: newItemCount > 0 ? '#D97706' : 'var(--dim)' }}>{newItemCount}</div><div className="stat-l">New Items (No Target)</div>
        </div>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 24 }}></th>
              <th style={{ width: 36 }}>#</th>
              <th>Party</th>
              <th style={{ textAlign: 'right' }}>Items Tracked</th>
              <th style={{ textAlign: 'right' }}>Total Target</th>
              <th style={{ textAlign: 'right' }}>Ordered This Month</th>
              <th style={{ textAlign: 'right' }}>Remaining</th>
              <th style={{ width: 110 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="empty">Loading…</td></tr>}
            {!loading && custRows.length === 0 && <tr><td colSpan={8} className="empty">No parties found.</td></tr>}
            {custRows.map((r, i) => {
              const isExp = !!expanded[r.id]
              return (
                <Fragment key={r.id}>
                <tr>
                  <td>
                    {(r.itemCount + r.untrackedCount) > 0 && (
                      <button onClick={() => toggleExpand(r.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--muted)', display: 'flex' }}>
                        <ChevronDown size={13} style={{ transition: 'transform .2s', transform: isExp ? 'rotate(180deg)' : 'none' }} />
                      </button>
                    )}
                  </td>
                  <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                  <td style={{ fontSize: 13, fontFamily: 'var(--cond)', fontWeight: 600 }}>{r.name}</td>
                  <td className="num-cell" style={{ textAlign: 'right', color: r.itemCount ? 'var(--text)' : 'var(--dim)' }}>
                    {r.itemCount || (r.untrackedCount ? 0 : '—')}
                    {r.untrackedCount > 0 && (
                      <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, color: '#D97706' }}>+{r.untrackedCount} new</span>
                    )}
                  </td>
                  <td className="num-cell" style={{ textAlign: 'right', color: r.totalTarget ? 'var(--text)' : 'var(--dim)' }}>
                    {r.totalTarget ? r.totalTarget.toLocaleString() : '—'}
                  </td>
                  <td className="num-cell" style={{ textAlign: 'right', color: r.totalOrdered ? 'var(--green)' : 'var(--dim)' }}>
                    {r.totalOrdered ? r.totalOrdered.toLocaleString() : '—'}
                  </td>
                  <td className="num-cell" style={{ textAlign: 'right', fontWeight: 700, color: !r.itemCount ? 'var(--dim)' : r.over ? 'var(--red)' : 'var(--green)' }}>
                    {r.itemCount ? (r.over ? `+${Math.abs(r.remaining).toLocaleString()} over` : r.remaining.toLocaleString()) : '—'}
                  </td>
                  <td>
                    <button className="btn-icon" style={{ fontSize: 10, color: 'var(--blue)' }} onClick={() => openAdd(r.id)}>+ ADD ITEM</button>
                  </td>
                </tr>

                {isExp && (r.itemCount + r.untrackedCount) > 0 && (
                  <tr style={{ background: 'var(--bg3)' }}>
                    <td colSpan={8} style={{ padding: 0 }}>
                      <div style={{ padding: '10px 12px 14px 40px' }}>
                        <div style={{ fontFamily: 'var(--cond)', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                          {r.name} — Item Breakdown
                        </div>
                        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              {['Screw', 'Target', 'Ordered This Month', 'Remaining', 'Progress', 'Notes', ''].map((h, hi) => (
                                <th key={h} style={{ textAlign: hi >= 1 && hi <= 3 ? 'right' : 'left', color: 'var(--muted)', fontSize: 10, fontFamily: 'var(--cond)', fontWeight: 600, letterSpacing: '.06em', padding: '5px 8px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {r.items.map(it => {
                              const ordered = orderedMap[`${r.id}|${it.screw_id}`] || 0
                              if (it.virtual) {
                                return (
                                  <tr key={`new-${it.screw_id}`} style={{ background: '#FFFBEB' }}>
                                    <td style={{ padding: '6px 8px', fontFamily: 'var(--cond)', fontWeight: 600 }}>
                                      {screwName(it.screw_id)}
                                      <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, letterSpacing: '.05em', color: '#D97706', border: '1px solid #FDE68A', background: '#FEF3C7', borderRadius: 4, padding: '1px 5px' }}>NEW</span>
                                    </td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--dim)' }}>— not set —</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>{ordered.toLocaleString()}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--dim)' }}>—</td>
                                    <td style={{ padding: '6px 8px', color: 'var(--dim)' }}>—</td>
                                    <td style={{ padding: '6px 8px', color: 'var(--muted)', fontSize: 11 }}>Ordered without a target this month</td>
                                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                                      <button className="btn-icon" style={{ fontSize: 10, color: 'var(--blue)' }} onClick={() => openAdd(r.id, it.screw_id)}>SET TARGET</button>
                                    </td>
                                  </tr>
                                )
                              }
                              const remaining = it.target_qty - ordered
                              const over = ordered > it.target_qty
                              const pct = it.target_qty > 0 ? Math.min(100, Math.round(ordered / it.target_qty * 100)) : 0
                              const isEditing = editRow?.id === it.id
                              return (
                                <tr key={it.id}>
                                  <td style={{ padding: '6px 8px', fontFamily: 'var(--cond)', fontWeight: 600 }}>{screwName(it.screw_id)}</td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                    {isEditing ? (
                                      <input type="number" min="1" value={editQty} autoFocus
                                        onChange={e => setEditQty(e.target.value)}
                                        style={{ width: 90, textAlign: 'right' }} />
                                    ) : it.target_qty.toLocaleString()}
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', color: ordered > 0 ? 'var(--green)' : 'var(--dim)' }}>
                                    {ordered > 0 ? ordered.toLocaleString() : '—'}
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: over ? 'var(--red)' : 'var(--green)' }}>
                                    {over ? `+${Math.abs(remaining).toLocaleString()} over` : remaining.toLocaleString()}
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                      <div style={{ width: 70, height: 5, background: 'var(--bg4)', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                                        <div style={{ width: `${pct}%`, height: '100%', background: over ? 'var(--red)' : pct >= 90 ? '#D97706' : 'var(--green)' }} />
                                      </div>
                                      <span style={{ fontFamily: 'var(--cond)', fontSize: 10, fontWeight: 700 }}>{pct}%</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: '6px 8px', color: 'var(--muted)', fontSize: 11 }}>{it.notes || '—'}</td>
                                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                                    {isEditing ? (
                                      <>
                                        <button className="btn-icon" style={{ fontSize: 10, color: 'var(--green)' }} onClick={saveEdit}>SAVE</button>
                                        <button className="btn-icon" style={{ fontSize: 10 }} onClick={() => setEditRow(null)}>✕</button>
                                        {editErr && <div className="field-error">{editErr}</div>}
                                      </>
                                    ) : (
                                      <>
                                        <button className="btn-icon" style={{ fontSize: 10, color: 'var(--blue)' }} onClick={() => openEdit(it)}>EDIT</button>
                                        <button className="btn-icon" style={{ fontSize: 10, color: 'var(--red)' }} onClick={() => deleteItem(it.id)}>DEL</button>
                                      </>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}

                {addingFor === r.id && (
                  <tr style={{ background: 'var(--bg3)' }}>
                    <td colSpan={8} style={{ padding: '12px 12px 14px 40px' }}>
                      <form onSubmit={saveItem} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div className="form-group" style={{ minWidth: 220 }}>
                          <label>Screw Type *</label>
                          <ScrewPicker
                            screws={screws}
                            excludeIds={new Set((targetsByCust[r.id] || []).map(t => t.screw_id))}
                            value={itemForm.screw_id}
                            onChange={id => setItemForm(f => ({ ...f, screw_id: id }))}
                            hasError={!!itemErrs.screw_id}
                          />
                          {itemErrs.screw_id && <span className="field-error">{itemErrs.screw_id}</span>}
                        </div>
                        <div className="form-group" style={{ width: 140 }}>
                          <label>Target (nos) *</label>
                          <input type="number" min="1"
                            className={itemErrs.target_qty ? 'error' : ''}
                            value={itemForm.target_qty}
                            onChange={e => setItemForm(f => ({ ...f, target_qty: e.target.value }))}
                            placeholder="e.g. 50000" />
                          {itemErrs.target_qty && <span className="field-error">{itemErrs.target_qty}</span>}
                        </div>
                        <div className="form-group" style={{ minWidth: 180, flex: 1 }}>
                          <label>Notes</label>
                          <input value={itemForm.notes}
                            onChange={e => setItemForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Optional" />
                        </div>
                        <div style={{ display: 'flex', gap: 6, paddingBottom: 2 }}>
                          <button className="btn-add" type="submit" disabled={saving}>{saving ? 'SAVING…' : 'ADD'}</button>
                          <button className="btn-clear" type="button" onClick={() => setAddingFor(null)}>CANCEL</button>
                        </div>
                        {itemErrs._ && <div style={{ color: 'var(--red)', fontSize: 12, width: '100%' }}>{itemErrs._}</div>}
                      </form>
                    </td>
                  </tr>
                )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
