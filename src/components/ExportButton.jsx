import { useEffect, useRef, useState } from 'react'

export default function ExportButton({ filename = 'export' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function outside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  function buildData() {
    const table = document.querySelector('table[data-export]')
    if (!table) return null
    const allTh = [...table.querySelectorAll('thead th')]
    const exportIdx = []
    const headers = []
    allTh.forEach((th, i) => {
      if (th.hasAttribute('data-no-export')) return
      const text = th.textContent.trim()
      if (text) { exportIdx.push(i); headers.push(text) }
    })
    const rows = [...table.querySelectorAll('tbody tr')]
      .filter(tr => !tr.querySelector('td[colspan]'))
      .map(tr => {
        const tds = [...tr.querySelectorAll('td')]
        return exportIdx.map(i => (tds[i]?.textContent ?? '').trim())
      })
    return { headers, rows }
  }

  function downloadCSV() {
    const data = buildData()
    if (!data) return
    const esc = v => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [data.headers.map(esc).join(','), ...data.rows.map(r => r.map(esc).join(','))]
    // BOM ensures Excel opens with correct encoding
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${filename}.csv`; a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  function printPage() {
    setOpen(false)
    setTimeout(() => window.print(), 50)
  }

  const itemStyle = {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '10px 16px', background: 'none', border: 'none',
    fontFamily: 'var(--cond)', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', color: 'var(--text)', letterSpacing: '.04em',
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: '#16A34A', color: '#fff', border: 'none',
          fontFamily: 'var(--cond)', fontSize: 12, fontWeight: 700,
          padding: '8px 14px', borderRadius: 'var(--radius-sm)',
          cursor: 'pointer', letterSpacing: '.06em',
        }}
      >
        ↓ EXPORT
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 200,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 6px 20px rgba(0,0,0,.12)', minWidth: 170, overflow: 'hidden',
        }}>
          <button
            onClick={downloadCSV}
            style={{ ...itemStyle, borderBottom: '1px solid var(--border)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            📊 Excel (CSV)
          </button>
          <button
            onClick={printPage}
            style={itemStyle}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            🖨️ Print / PDF
          </button>
        </div>
      )}
    </div>
  )
}
