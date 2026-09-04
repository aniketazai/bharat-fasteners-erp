import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const today = () => new Date().toISOString().slice(0, 10)
const fmtDate = d => { if (!d) return '—'; const [y, m, dy] = d.split('-'); return `${dy}/${m}/${y.slice(2)}` }

const CHECKLIST = [
  'Visual Appearance',
  'Dimensional Accuracy',
  'Thread Gauge (Go / No-Go)',
  'Plating Thickness & Adhesion',
  'Surface Hardness',
  'Packing & Labeling',
]

export default function PDIRReport() {
  const { orderId } = useParams()
  const [searchParams] = useSearchParams()
  const dcId = searchParams.get('dc')
  const navigate = useNavigate()

  const [order, setOrder]     = useState(null)
  const [items, setItems]     = useState([])
  const [dcEntry, setDcEntry] = useState(null)
  const [loading, setLoading] = useState(true)

  const [checks, setChecks]       = useState(() => Object.fromEntries(CHECKLIST.map(c => [c, true])))
  const [result, setResult]       = useState('Accepted')
  const [remarks, setRemarks]     = useState('')
  const [reportDate, setReportDate] = useState(today())
  const [inspector, setInspector] = useState('')
  const [checkedBy, setCheckedBy] = useState('')
  const [approvedBy, setApprovedBy] = useState('')

  useEffect(() => { load() }, [orderId, dcId])

  async function load() {
    setLoading(true)
    const { data: o } = await supabase.from('orders')
      .select('*, customer:customer_id(customer_name, contact_person, phone, address)')
      .eq('id', orderId)
      .single()
    setOrder(o || null)

    if (dcId) {
      const { data: dc } = await supabase.from('dispatch_entries')
        .select('*, item:order_item_id(order_qty, dispatched_qty, screw:screw_id(screw_code,screw_name))')
        .eq('id', dcId)
        .single()
      setDcEntry(dc || null)
      setItems(dc ? [{
        id: dc.order_item_id,
        screw: dc.item?.screw,
        order_qty: dc.item?.order_qty || 0,
        qty: dc.quantity_nos || 0,
      }] : [])
    } else {
      const { data: its } = await supabase.from('order_items')
        .select('*, screw:screw_id(screw_code,screw_name)')
        .eq('order_id', orderId)
        .order('created_at')
      setItems((its || []).map(i => ({
        id: i.id,
        screw: i.screw,
        order_qty: i.order_qty || 0,
        qty: i.dispatched_qty || i.order_qty || 0,
      })))
      setDcEntry(null)
    }
    setLoading(false)
  }

  function toggleCheck(label) {
    setChecks(c => ({ ...c, [label]: !c[label] }))
  }

  if (loading) return <div className="main page-enter"><div className="empty">Loading…</div></div>
  if (!order)  return <div className="main page-enter"><div className="empty">Order not found.</div></div>

  const pdirNo = `PDIR-${order.order_no}${dcEntry ? '-' + dcEntry.dc_no : ''}`

  return (
    <div className="main page-enter">
      <style>{`
        .pdir-doc { max-width: 860px; margin: 0 auto; background: #fff; color: #111; border: 1px solid #ccc; padding: 36px 42px; font-family: Arial, Helvetica, sans-serif; }
        .pdir-doc table { width: 100%; border-collapse: collapse; }
        .pdir-doc th, .pdir-doc td { border: 1px solid #999; padding: 6px 8px; font-size: 12px; text-align: left; }
        .pdir-doc th { background: #f0f0f0; font-weight: 700; }
        .pdir-hdr { text-align: center; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 16px; }
        .pdir-hdr .co { font-size: 20px; font-weight: 800; letter-spacing: .04em; }
        .pdir-hdr .co-sub { font-size: 11px; color: #444; margin-top: 2px; }
        .pdir-hdr .doc-title { font-size: 13px; font-weight: 700; letter-spacing: .12em; margin-top: 10px; background: #111; color: #fff; display: inline-block; padding: 4px 16px; }
        .pdir-meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 14px; gap: 20px; }
        .pdir-meta .box { flex: 1; border: 1px solid #ccc; padding: 8px 12px; }
        .pdir-meta .box div { margin-bottom: 3px; }
        .pdir-meta .box b { display: inline-block; min-width: 90px; color: #444; font-weight: 600; }
        .pdir-section-title { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; margin: 18px 0 6px; color: #333; }
        .pdir-checklist { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; font-size: 12px; }
        .pdir-checklist label { display: flex; align-items: center; gap: 6px; }
        .pdir-result label { margin-right: 18px; font-size: 12px; display: inline-flex; align-items: center; gap: 5px; }
        .pdir-remarks { width: 100%; min-height: 50px; border: 1px solid #999; font-size: 12px; font-family: inherit; padding: 6px 8px; resize: vertical; }
        .pdir-sign-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 30px; }
        .pdir-sign-box { border-top: 1px solid #111; padding-top: 6px; font-size: 11px; }
        .pdir-sign-box input { width: 100%; border: none; border-bottom: 1px solid #ccc; font-size: 12px; padding: 3px 0; margin-top: 10px; font-family: inherit; }
        @media print {
          body * { visibility: hidden; }
          .pdir-doc, .pdir-doc * { visibility: visible; }
          .pdir-doc { position: absolute; left: 0; top: 0; border: none; margin: 0; max-width: 100%; }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }} className="no-print">
        <button className="btn-clear" onClick={() => navigate(-1)}>← BACK</button>
        <button className="btn-add" onClick={() => window.print()}>⬇ DOWNLOAD / PRINT PDIR</button>
      </div>

      <div className="pdir-doc">
        <div className="pdir-hdr">
          <div className="co">BHARAT FASTENERS</div>
          <div className="co-sub">[ Company address, GSTIN, phone & email — replace with your letterhead details ]</div>
          <div className="doc-title">PRE-DISPATCH INSPECTION REPORT</div>
        </div>

        <div className="pdir-meta">
          <div className="box">
            <div><b>PDIR No.</b> {pdirNo}</div>
            <div><b>Report Date</b> <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} style={{ border: 'none', font: 'inherit', fontSize: 12 }} className="no-print-border" /></div>
            <div><b>Order No.</b> {order.order_no}</div>
            <div><b>Invoice No.</b> {order.invoice_no || '—'}</div>
            <div><b>Order Date</b> {fmtDate(order.order_date)}</div>
            {dcEntry && <div><b>DC No.</b> {dcEntry.dc_no} ({fmtDate(dcEntry.dispatch_date)})</div>}
          </div>
          <div className="box">
            <div><b>Party / Buyer</b> {order.customer?.customer_name || '—'}</div>
            <div><b>Address</b> {order.customer?.address || '—'}</div>
            <div><b>Contact Person</b> {order.customer?.contact_person || '—'}</div>
            <div><b>Phone</b> {order.customer?.phone || '—'}</div>
          </div>
        </div>

        <div className="pdir-section-title">Item(s) Offered for Inspection</div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }}>Sr</th>
              <th>Description of Goods</th>
              <th style={{ textAlign: 'right' }}>Order Qty</th>
              <th style={{ textAlign: 'right' }}>Qty Offered (nos)</th>
              <th>Result</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id}>
                <td>{i + 1}</td>
                <td>{it.screw?.screw_code} — {it.screw?.screw_name}</td>
                <td style={{ textAlign: 'right' }}>{(it.order_qty || 0).toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{(it.qty || 0).toLocaleString()}</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pdir-section-title">Inspection Parameters</div>
        <div className="pdir-checklist">
          {CHECKLIST.map(label => (
            <label key={label}>
              <input type="checkbox" checked={!!checks[label]} onChange={() => toggleCheck(label)} />
              {label}
            </label>
          ))}
        </div>

        <div className="pdir-section-title">Overall Result</div>
        <div className="pdir-result">
          {['Accepted', 'Accepted with Remarks', 'Rejected'].map(r => (
            <label key={r}>
              <input type="radio" name="result" checked={result === r} onChange={() => setResult(r)} />
              {r}
            </label>
          ))}
        </div>

        <div className="pdir-section-title">Remarks</div>
        <textarea className="pdir-remarks" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional remarks…" />

        <div className="pdir-sign-grid">
          <div className="pdir-sign-box">
            Inspected By
            <input value={inspector} onChange={e => setInspector(e.target.value)} placeholder="Name & signature" />
          </div>
          <div className="pdir-sign-box">
            Checked By
            <input value={checkedBy} onChange={e => setCheckedBy(e.target.value)} placeholder="Name & signature" />
          </div>
          <div className="pdir-sign-box">
            Approved By
            <input value={approvedBy} onChange={e => setApprovedBy(e.target.value)} placeholder="Name & signature" />
          </div>
        </div>
      </div>
    </div>
  )
}
