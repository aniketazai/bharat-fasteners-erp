import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import ExportButton from '../components/ExportButton'

export default function RMRequirement() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [stock, setStock]     = useState({}) // wire_id → current_kg

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)

    // 1. Active orders
    const { data: ordData } = await supabase.from('orders')
      .select('id, order_no, customer:customer_id(customer_name)')
      .in('status', ['Open', 'In Progress'])
      .order('created_at')

    const orderIds = (ordData || []).map(o => o.id)
    const ordMap   = Object.fromEntries((ordData || []).map(o => [o.id, o]))

    // 2. Order items for those orders (non-completed)
    const { data: itemData } = orderIds.length
      ? await supabase.from('order_items')
          .select('*, screw:screw_id(screw_code,screw_name), wire:wire_id(diameter_mm,grade)')
          .in('order_id', orderIds)
          .neq('status', 'Completed')
      : { data: [] }

    // 3. Conversions
    const { data: convData } = await supabase.from('conversion_master')
      .select('screw_id, wire_id, conversion_ratio_per_kg, wire:wire_id(diameter_mm,grade)')

    // 4. RM lot stock
    const { data: lotData } = await supabase.from('rm_lot')
      .select('wire_id, txn_type, quantity_kg')

    // Stock per wire
    const stockMap = {}
    for (const e of (lotData || [])) {
      const sign = e.txn_type === 'Issue' ? -1 : 1
      stockMap[e.wire_id] = (stockMap[e.wire_id] || 0) + sign * parseFloat(e.quantity_kg)
    }
    setStock(stockMap)

    // Conversion map: screw_id → { wire_id, ratio, wire }
    const convMap = {}
    for (const c of (convData || [])) {
      if (!convMap[c.screw_id]) convMap[c.screw_id] = c
    }

    // Compute per item
    const computed = (itemData || []).map(item => {
      const remaining = Math.max((item.order_qty || 0) - (item.dispatched_qty || 0), 0)

      // Use item.wire_id if set, else fallback to conversion master
      const conv        = convMap[item.screw_id]
      const wireId      = item.wire_id || conv?.wire_id
      const wireInfo    = item.wire || conv?.wire
      const reqKg       = conv ? +(remaining / conv.conversion_ratio_per_kg).toFixed(2) : null
      const wireStock   = wireId ? +(stockMap[wireId] || 0).toFixed(2) : null
      const gap         = reqKg !== null && wireStock !== null ? +(reqKg - wireStock).toFixed(2) : null
      const order       = ordMap[item.order_id] || {}

      return { ...item, remaining, conv, wireId, wireInfo, reqKg, wireStock, gap, order }
    })

    setRows(computed)
    setLoading(false)
  }

  const totalReqKg   = rows.reduce((s, r) => s + (r.reqKg || 0), 0).toFixed(1)
  const ordersOk     = rows.filter(r => r.gap !== null && r.gap <= 0).length
  const ordersShort  = rows.filter(r => r.gap !== null && r.gap > 0).length

  return (
    <div className="main page-enter">
      <div className="sh">
        <span className="sh-num">02</span>
        <span className="sh-title">RM REQUIREMENT</span>
        <span className="sh-desc">Live wire requirement per open order item</span>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-n">{rows.length}</div><div className="stat-l">Open Items</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--accent)' }}>
          <div className="stat-n" style={{ color: 'var(--accent)' }}>{totalReqKg}</div><div className="stat-l">Total kg Required</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--green)' }}>
          <div className="stat-n" style={{ color: 'var(--green)' }}>{ordersOk}</div><div className="stat-l">Stock OK</div>
        </div>
        <div className="stat" style={{ borderLeftColor: 'var(--red)' }}>
          <div className="stat-n" style={{ color: 'var(--red)' }}>{ordersShort}</div><div className="stat-l">Shortfall</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }} className="no-print">
        <ExportButton filename="rm-requirement" />
      </div>
      <div className="tbl-wrap">
        <table data-export>
          <thead>
            <tr>
              <th>#</th>
              <th>Order No</th>
              <th>Customer</th>
              <th>Screw</th>
              <th style={{ textAlign: 'right' }}>Remaining (nos)</th>
              <th>Wire Type</th>
              <th style={{ textAlign: 'right' }}>Required (kg)</th>
              <th style={{ textAlign: 'right' }}>In Stock (kg)</th>
              <th style={{ textAlign: 'right' }}>Gap (kg)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} className="empty">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={10} className="empty">No open order items.</td></tr>}
            {rows.map((r, i) => {
              const ok    = r.gap !== null && r.gap <= 0
              const short = r.gap !== null && r.gap > 0
              return (
                <tr key={r.id}>
                  <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                  <td><span style={{ fontFamily: 'var(--cond)', fontWeight: 700 }}>{r.order?.order_no}</span></td>
                  <td style={{ fontSize: 12 }}>{r.order?.customer?.customer_name || '—'}</td>
                  <td>
                    <span style={{ fontFamily: 'var(--cond)', fontWeight: 600, fontSize: 12 }}>{r.screw?.screw_code}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}> {r.screw?.screw_name}</span>
                  </td>
                  <td className="num-cell" style={{ textAlign: 'right' }}>{r.remaining.toLocaleString()}</td>
                  <td style={{ fontSize: 12 }}>
                    {r.wireInfo
                      ? `${r.wireInfo.diameter_mm}mm – ${r.wireInfo.grade}`
                      : <span style={{ color: 'var(--dim)', fontStyle: 'italic' }}>No conversion</span>
                    }
                  </td>
                  <td className="num-cell" style={{ textAlign: 'right', color: 'var(--accent)' }}>
                    {r.reqKg !== null ? r.reqKg : '—'}
                  </td>
                  <td className="num-cell" style={{ textAlign: 'right', color: r.wireStock > 0 ? 'var(--green)' : 'var(--red)' }}>
                    {r.wireStock !== null ? r.wireStock : '—'}
                  </td>
                  <td className="num-cell" style={{ textAlign: 'right', color: ok ? 'var(--green)' : short ? 'var(--red)' : 'var(--dim)' }}>
                    {r.gap !== null ? (r.gap > 0 ? `+${r.gap}` : r.gap) : '—'}
                  </td>
                  <td>
                    {!r.conv
                      ? <span className="badge b-warn">NO CONV</span>
                      : ok
                        ? <span className="badge b-ok">SUFFICIENT</span>
                        : <span className="badge b-red">SHORTFALL</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Wire stock summary */}
      <div style={{ marginTop: 24 }}>
        <div className="sum-section-title">CURRENT WIRE STOCK</div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Wire Type</th>
                <th style={{ textAlign: 'right' }}>Stock (kg)</th>
                <th>Level</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stock).length === 0 && <tr><td colSpan={3} className="empty">No RM Lot entries yet.</td></tr>}
              {Object.entries(stock).map(([wid, kg]) => {
                const row = rows.find(r => r.wireId === wid)
                const wireLabel = row?.wireInfo
                  ? `${row.wireInfo.diameter_mm}mm – ${row.wireInfo.grade}`
                  : `Wire …${wid.slice(-6)}`
                return (
                  <tr key={wid}>
                    <td style={{ fontSize: 12, fontFamily: 'var(--cond)', fontWeight: 600 }}>{wireLabel}</td>
                    <td className="num-cell" style={{ textAlign: 'right', color: kg > 0 ? 'var(--green)' : 'var(--red)' }}>
                      {kg.toFixed(2)}<span className="unit">kg</span>
                    </td>
                    <td>{kg > 0 ? <span className="badge b-ok">IN STOCK</span> : <span className="badge b-red">EMPTY</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
