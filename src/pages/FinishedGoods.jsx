import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function downloadCSV(filename, headers, rows) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const ST = {
  PLATED:   { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0', cls: 'b-ok'   },
  PARTIAL:  { bg: '#FFF7ED', color: '#D97706', border: '#FED7AA', cls: 'b-warn' },
  UNPLATED: { bg: '#FEF2F2', color: '#DC2626', border: '#FCA5A5', cls: 'b-red'  },
}

export default function FinishedGoods() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('All')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [prodRes, platRes, orderItemRes, dispRes, openRes, screwRes] = await Promise.all([
      supabase.from('production_entries')
        .select('screw_id, output_nos, screw:screw_id(screw_code, screw_name)'),
      supabase.from('plating_entries')
        .select('screw_id, received_qty'),
      supabase.from('order_items')
        .select('id, screw_id'),
      supabase.from('dispatch_entries')
        .select('order_item_id, quantity_nos'),
      supabase.from('fg_opening_stock')
        .select('screw_id, quantity_nos, stock_type'),
      supabase.from('output_screw_master')
        .select('id, screw_code, screw_name'),
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
      if (!p.screw_id || !p.received_qty) continue
      platedMap[p.screw_id] = (platedMap[p.screw_id] || 0) + (p.received_qty || 0)
    }

    // Opening stock: adds to produced + plated (PLATED) or produced only (UNPLATED)
    for (const o of (openRes.data || [])) {
      if (!o.screw_id) continue
      if (!prodMap[o.screw_id]) prodMap[o.screw_id] = { code: screwLookup[o.screw_id]?.code || '—', name: screwLookup[o.screw_id]?.name || '—', produced: 0 }
      prodMap[o.screw_id].produced += o.quantity_nos
      if (o.stock_type === 'PLATED') platedMap[o.screw_id] = (platedMap[o.screw_id] || 0) + o.quantity_nos
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

    setRows(result)
    setLoading(false)
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
        <button className="btn-add" onClick={() => downloadCSV('fg-stock.csv',
          ['#', 'Screw Code', 'Screw Name', 'Produced (nos)', 'Plated (nos)', 'Unplated (nos)', 'Dispatched (nos)', 'FG Stock (nos)', 'Status'],
          filtered.map((r, i) => [i+1, r.code, r.name, r.produced, r.plated, r.unplated, r.dispatched, r.fgStock, r.status])
        )}>↓ EXPORT CSV</button>
      </div>

      <div className="tbl-wrap">
        <table data-export>
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>Screw Code</th>
              <th>Screw Name</th>
              <th style={{ textAlign: 'right' }}>Produced</th>
              <th style={{ textAlign: 'right' }}>Plated</th>
              <th style={{ textAlign: 'right' }}>Unplated</th>
              <th style={{ textAlign: 'right' }}>Dispatched</th>
              <th style={{ textAlign: 'right' }}>FG Stock</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="empty">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={9} className="empty">No finished goods yet.</td></tr>}
            {filtered.map((r, i) => {
              const s = ST[r.status]
              return (
                <tr key={r.sid}>
                  <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                  <td><span style={{ fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 13 }}>{r.code}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.name}</td>
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
                </tr>
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
            const td = (content, extra = {}) => (
              <td style={{ padding: '7px 8px', fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 12, background: '#f5f4f2', borderTop: '2px solid var(--border2)', ...extra }}>{content}</td>
            )
            return (
              <tfoot>
                <tr>
                  {td(`TOTAL — ${filtered.length} screws`, { colSpan: 3, fontSize: 11, letterSpacing: '.04em' })}
                  {td(tot.produced.toLocaleString(), { textAlign: 'right', color: 'var(--muted)' })}
                  {td(tot.plated.toLocaleString(), { textAlign: 'right', color: '#16A34A' })}
                  {td(tot.unplated > 0 ? tot.unplated.toLocaleString() : '—', { textAlign: 'right', color: tot.unplated > 0 ? '#DC2626' : 'var(--dim)' })}
                  {td(tot.dispatched > 0 ? tot.dispatched.toLocaleString() : '—', { textAlign: 'right', color: 'var(--muted)' })}
                  {td(tot.fgStock.toLocaleString(), { textAlign: 'right', color: '#16A34A', fontSize: 14 })}
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
