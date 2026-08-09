import { useEffect, useState, Fragment } from 'react'
import { ChevronDown } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const today = () => new Date().toISOString().slice(0, 10)
const EMPTY_ADJ = { direction: 'add', quantity_nos: '', stock_type: 'PLATED', entry_date: today(), notes: '' }

function downloadExcel(filename, headers, rows) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = headers.map((h, i) => {
    const maxLen = Math.max(String(h).length, ...rows.map(r => String(r[i] ?? '').length))
    return { wch: Math.min(Math.max(maxLen + 2, 10), 40) }
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  XLSX.writeFile(wb, filename.replace(/\.csv$/i, '.xlsx'))
}

const ST = {
  PLATED:   { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0', cls: 'b-ok'   },
  PARTIAL:  { bg: '#FFF7ED', color: '#D97706', border: '#FED7AA', cls: 'b-warn' },
  UNPLATED: { bg: '#FEF2F2', color: '#DC2626', border: '#FCA5A5', cls: 'b-red'  },
}

export default function FinishedGoods() {
  const { user } = useAuth()
  const [rows, setRows]       = useState([])
  const [ordersByScrew, setOrdersByScrew] = useState({}) // screw_id → [{order_no, customer_name, remaining}, ...]
  const [expanded, setExpanded] = useState({}) // screw_id → bool
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('All')

  // Stock correction (writes to fg_opening_stock, same table Orders/Dispatch/
  // Dashboard already read — so a correction here stays consistent everywhere)
  const [adjustSid, setAdjustSid] = useState(null)
  const [adjForm, setAdjForm]     = useState(EMPTY_ADJ)
  const [adjErr, setAdjErr]       = useState({})
  const [adjSaving, setAdjSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [prodRes, platRes, orderItemRes, dispRes, openRes, screwRes, openOrderItemsRes] = await Promise.all([
      supabase.from('production_entries')
        .select('screw_id, output_nos, screw:screw_id(screw_code, screw_name)'),
      supabase.from('plating_entries')
        .select('screw_id, received_qty_nos'),
      supabase.from('order_items')
        .select('id, screw_id'),
      supabase.from('dispatch_entries')
        .select('order_item_id, quantity_nos'),
      supabase.from('fg_opening_stock')
        .select('screw_id, quantity_nos, stock_type, direction'),
      supabase.from('output_screw_master')
        .select('id, screw_code, screw_name'),
      // Order items with their parent order — filtered to open ones client-side
      // below (Supabase's embedded-resource filtering isn't reliable here).
      supabase.from('order_items')
        .select('screw_id, order_qty, dispatched_qty, order:order_id(order_no, status, customer:customer_id(customer_name))'),
    ])

    // Screw lookup
    const screwLookup = {}
    for (const s of (screwRes.data || [])) screwLookup[s.id] = { code: s.screw_code, name: s.screw_name }

    // Produced per screw (from production entries)
    const prodMap = {}
    for (const p of (prodRes.data || [])) {
      if (!p.screw_id) continue
      if (!prodMap[p.screw_id]) prodMap[p.screw_id] = { code: p.screw?.screw_code || screwLookup[p.screw_id]?.code || '—', name: p.screw?.screw_name || screwLookup[p.screw_id]?.name || '—', produced: 0 }
      prodMap[p.screw_id].produced += (p.output_nos || 0)
    }

    // Plated (received from plating) per screw
    const platedMap = {}
    for (const p of (platRes.data || [])) {
      if (!p.screw_id || !p.received_qty_nos) continue
      platedMap[p.screw_id] = (platedMap[p.screw_id] || 0) + (p.received_qty_nos || 0)
    }

    // Opening stock / corrections: adds to produced + plated (PLATED) or
    // produced only (UNPLATED). direction flips the sign — quantity_nos
    // itself is always stored positive (DB CHECK), REMOVE entries subtract.
    for (const o of (openRes.data || [])) {
      if (!o.screw_id) continue
      const signed = o.direction === 'REMOVE' ? -o.quantity_nos : o.quantity_nos
      if (!prodMap[o.screw_id]) prodMap[o.screw_id] = { code: screwLookup[o.screw_id]?.code || '—', name: screwLookup[o.screw_id]?.name || '—', produced: 0 }
      prodMap[o.screw_id].produced += signed
      if (o.stock_type === 'PLATED') platedMap[o.screw_id] = (platedMap[o.screw_id] || 0) + signed
    }

    // Dispatched per screw (via order_items mapping)
    const itemToScrew = {}
    for (const i of (orderItemRes.data || [])) {
      if (i.id && i.screw_id) itemToScrew[i.id] = i.screw_id
    }
    const dispMap = {}
    for (const d of (dispRes.data || [])) {
      const sid = d.order_item_id ? itemToScrew[d.order_item_id] : null
      if (!sid) continue
      dispMap[sid] = (dispMap[sid] || 0) + (d.quantity_nos || 0)
    }

    // Build rows
    const result = Object.keys(prodMap).map(sid => {
      const produced   = prodMap[sid].produced
      const plated     = platedMap[sid] || 0
      const dispatched = dispMap[sid]   || 0
      const unplated   = Math.max(produced - plated, 0)
      const fgStock    = Math.max(plated - dispatched, 0)

      let status = 'UNPLATED'
      if (plated > 0) status = (plated + dispatched >= produced) ? 'PLATED' : 'PARTIAL'

      return { sid, code: prodMap[sid].code, name: prodMap[sid].name, produced, plated, unplated, dispatched, fgStock, status }
    }).sort((a, b) => b.fgStock - a.fgStock)

    // Group open orders per screw so FG stock can be traced back to what it's
    // waiting on. Plating itself isn't order-specific, so this is "which open
    // orders need this screw", not a strict reservation of stock.
    const obs = {}
    for (const it of (openOrderItemsRes.data || [])) {
      if (!it.screw_id || !it.order) continue
      if (!['Open', 'In Progress', 'Partial'].includes(it.order.status)) continue
      const remaining = Math.max((it.order_qty || 0) - (it.dispatched_qty || 0), 0)
      if (remaining <= 0) continue
      if (!obs[it.screw_id]) obs[it.screw_id] = []
      obs[it.screw_id].push({
        order_no: it.order.order_no,
        customer_name: it.order.customer?.customer_name || '—',
        order_qty: it.order_qty || 0,
        dispatched_qty: it.dispatched_qty || 0,
        remaining,
      })
    }
    setOrdersByScrew(obs)

    setRows(result)
    setLoading(false)
  }

  function toggleExpand(sid) {
    setExpanded(prev => ({ ...prev, [sid]: !prev[sid] }))
  }

  function openAdjust(sid) {
    setExpanded(prev => ({ ...prev, [sid]: false }))
    setAdjustSid(sid)
    setAdjForm(EMPTY_ADJ)
    setAdjErr({})
  }

  function validateAdj(f) {
    const e = {}
    const n = parseInt(f.quantity_nos)
    if (!f.quantity_nos || isNaN(n) || n <= 0) e.quantity_nos = 'Enter a quantity greater than 0.'
    return e
  }

  async function saveAdjust(ev) {
    ev.preventDefault()
    const errs = validateAdj(adjForm)
    if (Object.keys(errs).length) { setAdjErr(errs); return }
    setAdjSaving(true)
    const n = parseInt(adjForm.quantity_nos)
    const { error } = await supabase.from('fg_opening_stock').insert({
      screw_id:     adjustSid,
      quantity_nos: n,
      direction:    adjForm.direction === 'remove' ? 'REMOVE' : 'ADD',
      stock_type:   adjForm.stock_type,
      entry_date:   adjForm.entry_date || today(),
      notes:        adjForm.notes.trim() || null,
      created_by:   user?.id,
    })
    setAdjSaving(false)
    if (error) { setAdjErr({ _: `Could not save: ${error.message}` }); return }
    setAdjustSid(null)
    load()
  }

  const counts = { PLATED: 0, PARTIAL: 0, UNPLATED: 0 }
  for (const r of rows) counts[r.status]++
  const filtered = filter === 'All' ? rows : rows.filter(r => r.status === filter)

  const FILTER_BTNS = [
    { key: 'All',      label: `All (${rows.length})`,           active: '#D96B10' },
    { key: 'PLATED',   label: `Plated (${counts.PLATED})`,      active: '#16A34A' },
    { key: 'PARTIAL',  label: `Partial (${counts.PARTIAL})`,    active: '#D97706' },
    { key: 'UNPLATED', label: `Unplated (${counts.UNPLATED})`,  active: '#DC2626' },
  ]

  return (
    <div className="main page-enter">
      <div className="sh">
        <span className="sh-num">FG</span>
        <span className="sh-title">FINISHED GOODS</span>
        <span className="sh-desc">Plating status per product · {rows.length} screws</span>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-n">{rows.length}</div>
          <div className="stat-l">Total Products</div>
        </div>
        <div className="stat" style={{ borderLeftColor: '#16A34A' }}>
          <div className="stat-n" style={{ color: '#16A34A' }}>{counts.PLATED}</div>
          <div className="stat-l">Fully Plated</div>
        </div>
        <div className="stat" style={{ borderLeftColor: '#D97706' }}>
          <div className="stat-n" style={{ color: '#D97706' }}>{counts.PARTIAL}</div>
          <div className="stat-l">Partially Plated</div>
        </div>
        <div className="stat" style={{ borderLeftColor: '#DC2626' }}>
          <div className="stat-n" style={{ color: '#DC2626' }}>{counts.UNPLATED}</div>
          <div className="stat-l">Unplated</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }} className="no-print">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTER_BTNS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              fontSize: 11, padding: '5px 14px', borderRadius: 20,
              fontFamily: 'var(--cond)', fontWeight: 700, letterSpacing: '.05em', cursor: 'pointer',
              background: filter === f.key ? f.active : 'var(--bg2)',
              border: `1px solid ${filter === f.key ? 'transparent' : 'var(--border)'}`,
              color: filter === f.key ? '#fff' : 'var(--text)',
              transition: 'all .15s',
            }}>{f.label}</button>
          ))}
        </div>
        <button className="btn-add" onClick={() => downloadExcel('fg-stock.xlsx',
          ['#', 'Screw Name', 'Produced (nos)', 'Plated (nos)', 'Unplated (nos)', 'Dispatched (nos)', 'FG Stock (nos)', 'Status'],
          filtered.map((r, i) => [i+1, r.name, r.produced, r.plated, r.unplated, r.dispatched, r.fgStock, r.status])
        )}>↓ EXPORT EXCEL</button>
      </div>

      {adjustSid && (() => {
        const row = rows.find(r => r.sid === adjustSid)
        return (
          <div className="form-card" style={{ borderLeftColor: 'var(--accent)' }}>
            <div className="form-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>ADJUST STOCK — {row?.name}</span>
              <button className="btn-clear" style={{ margin: 0 }} onClick={() => setAdjustSid(null)}>✕</button>
            </div>
            <form onSubmit={saveAdjust}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Direction</label>
                  <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                    {[{ k: 'add', l: '+ ADD STOCK', c: '#16A34A' }, { k: 'remove', l: '− REMOVE STOCK', c: '#DC2626' }].map(d => {
                      const active = adjForm.direction === d.k
                      return (
                        <button key={d.k} type="button" onClick={() => setAdjForm(f => ({ ...f, direction: d.k }))}
                          style={{
                            flex: 1, padding: '8px 0', borderRadius: 6, cursor: 'pointer',
                            fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 12, letterSpacing: '.05em',
                            background: active ? d.c + '18' : 'var(--bg2)',
                            border: `2px solid ${active ? d.c : 'var(--border)'}`,
                            color: active ? d.c : 'var(--muted)',
                          }}>{d.l}</button>
                      )
                    })}
                  </div>
                </div>
                <div className="form-group">
                  <label>Quantity (nos) *</label>
                  <input type="number" min="1"
                    className={adjErr.quantity_nos ? 'error' : ''}
                    value={adjForm.quantity_nos}
                    onChange={e => setAdjForm(f => ({ ...f, quantity_nos: e.target.value }))}
                    placeholder="e.g. 50" />
                  {adjErr.quantity_nos && <span className="field-error">{adjErr.quantity_nos}</span>}
                </div>
                <div className="form-group">
                  <label>Stock Type</label>
                  <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                    {['PLATED', 'UNPLATED'].map(t => {
                      const s = ST[t]
                      const active = adjForm.stock_type === t
                      return (
                        <button key={t} type="button" onClick={() => setAdjForm(f => ({ ...f, stock_type: t }))}
                          style={{
                            flex: 1, padding: '8px 0', borderRadius: 6, cursor: 'pointer',
                            fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 12, letterSpacing: '.05em',
                            background: active ? s.bg : 'var(--bg2)',
                            border: `2px solid ${active ? s.color : 'var(--border)'}`,
                            color: active ? s.color : 'var(--muted)',
                          }}>{t}</button>
                      )
                    })}
                  </div>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={adjForm.entry_date}
                    onChange={e => setAdjForm(f => ({ ...f, entry_date: e.target.value }))} />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Reason / Notes</label>
                  <input value={adjForm.notes}
                    onChange={e => setAdjForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="e.g. Physical count correction, damaged stock" />
                </div>
              </div>
              {adjErr._ && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{adjErr._}</div>}
              <div className="form-actions">
                <button className="btn-add" type="submit" disabled={adjSaving}>{adjSaving ? 'SAVING…' : 'SAVE ADJUSTMENT'}</button>
                <button className="btn-clear" type="button" onClick={() => setAdjustSid(null)}>CANCEL</button>
              </div>
            </form>
          </div>
        )
      })()}

      <div className="tbl-wrap">
        <table data-export>
          <thead>
            <tr>
              <th style={{ width: 24 }} data-no-export></th>
              <th style={{ width: 36 }}>#</th>
              <th>Screw Name</th>
              <th style={{ textAlign: 'right' }}>Produced</th>
              <th style={{ textAlign: 'right' }}>Plated</th>
              <th style={{ textAlign: 'right' }}>Unplated</th>
              <th style={{ textAlign: 'right' }}>Dispatched</th>
              <th style={{ textAlign: 'right' }}>FG Stock</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Open Orders</th>
              <th data-no-export style={{ width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={11} className="empty">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={11} className="empty">No finished goods yet.</td></tr>}
            {filtered.map((r, i) => {
              const s = ST[r.status]
              const waitingOrders = ordersByScrew[r.sid] || []
              const isExp = !!expanded[r.sid]
              return (
                <Fragment key={r.sid}>
                <tr>
                  <td>
                    {waitingOrders.length > 0 && (
                      <button onClick={() => toggleExpand(r.sid)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>
                        <ChevronDown size={13} style={{ transition: 'transform .2s', transform: isExp ? 'rotate(180deg)' : 'none' }} />
                      </button>
                    )}
                  </td>
                  <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                  <td style={{ fontSize: 12 }}>{r.name}</td>
                  <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>{r.produced.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', fontSize: 12, fontWeight: r.plated > 0 ? 700 : 400, color: r.plated > 0 ? '#16A34A' : 'var(--dim)' }}>
                    {r.plated > 0 ? r.plated.toLocaleString() : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12, fontWeight: r.unplated > 0 ? 700 : 400, color: r.unplated > 0 ? '#DC2626' : 'var(--dim)' }}>
                    {r.unplated > 0 ? r.unplated.toLocaleString() : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--muted)' }}>
                    {r.dispatched > 0 ? r.dispatched.toLocaleString() : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 14, color: r.fgStock > 0 ? '#16A34A' : 'var(--dim)' }}>
                      {r.fgStock > 0 ? r.fgStock.toLocaleString() : '—'}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: 12,
                      fontSize: 10, fontFamily: 'var(--cond)', fontWeight: 700, letterSpacing: '.06em',
                      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                    }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12 }}>
                    {waitingOrders.length > 0
                      ? <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                          {waitingOrders.reduce((s, w) => s + w.remaining, 0).toLocaleString()}
                          <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 4 }}>
                            ({waitingOrders.length} order{waitingOrders.length !== 1 ? 's' : ''})
                          </span>
                        </span>
                      : <span style={{ color: 'var(--dim)' }}>—</span>}
                  </td>
                  <td className="no-print">
                    <button className="btn-icon" style={{ fontSize: 10, color: 'var(--blue)' }} onClick={() => openAdjust(r.sid)}>ADJUST</button>
                  </td>
                </tr>

                {isExp && waitingOrders.length > 0 && (
                  <tr style={{ background: 'var(--bg3)' }}>
                    <td colSpan={11} style={{ padding: 0 }}>
                      <div style={{ padding: '10px 12px 14px 40px' }}>
                        <div style={{ fontFamily: 'var(--cond)', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                          Open Orders Waiting On {r.name}
                        </div>
                        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              {['Order No', 'Customer', 'Order Qty', 'Dispatched', 'Still Needed'].map((h, hi) => (
                                <th key={h} style={{
                                  textAlign: hi >= 2 ? 'right' : 'left', color: 'var(--muted)', fontSize: 10,
                                  fontFamily: 'var(--cond)', fontWeight: 600, letterSpacing: '.06em',
                                  padding: '5px 8px', borderBottom: '1px solid var(--border)',
                                }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {waitingOrders.map((w, wi) => (
                              <tr key={wi}>
                                <td style={{ padding: '6px 8px', fontFamily: 'var(--cond)', fontWeight: 700 }}>{w.order_no}</td>
                                <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{w.customer_name}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{w.order_qty.toLocaleString()}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', color: w.dispatched_qty > 0 ? 'var(--green)' : 'var(--dim)' }}>
                                  {w.dispatched_qty > 0 ? w.dispatched_qty.toLocaleString() : '—'}
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>
                                  {w.remaining.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              )
            })}
          </tbody>
          {!loading && filtered.length > 0 && (() => {
            const tot = filtered.reduce((acc, r) => ({
              produced: acc.produced + r.produced,
              plated: acc.plated + r.plated,
              unplated: acc.unplated + r.unplated,
              dispatched: acc.dispatched + r.dispatched,
              fgStock: acc.fgStock + r.fgStock,
            }), { produced: 0, plated: 0, unplated: 0, dispatched: 0, fgStock: 0 })
            const neededTotal = filtered.reduce((s, r) => s + (ordersByScrew[r.sid] || []).reduce((s2, w) => s2 + w.remaining, 0), 0)
            const td = (content, extra = {}) => (
              <td style={{ padding: '7px 8px', fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 12, background: '#f5f4f2', borderTop: '2px solid var(--border2)', ...extra }}>{content}</td>
            )
            return (
              <tfoot>
                <tr>
                  {td(`TOTAL — ${filtered.length} screws`, { colSpan: 4, fontSize: 11, letterSpacing: '.04em' })}
                  {td(tot.produced.toLocaleString(), { textAlign: 'right', color: 'var(--muted)' })}
                  {td(tot.plated.toLocaleString(), { textAlign: 'right', color: '#16A34A' })}
                  {td(tot.unplated > 0 ? tot.unplated.toLocaleString() : '—', { textAlign: 'right', color: tot.unplated > 0 ? '#DC2626' : 'var(--dim)' })}
                  {td(tot.dispatched > 0 ? tot.dispatched.toLocaleString() : '—', { textAlign: 'right', color: 'var(--muted)' })}
                  {td(tot.fgStock.toLocaleString(), { textAlign: 'right', color: '#16A34A', fontSize: 14 })}
                  {td('')}
                  {td(neededTotal > 0 ? neededTotal.toLocaleString() : '—', { textAlign: 'right', color: 'var(--accent)' })}
                  {td('')}
                </tr>
              </tfoot>
            )
          })()}
        </table>
      </div>
    </div>
  )
}
