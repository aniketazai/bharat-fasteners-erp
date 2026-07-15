import { useState } from 'react'
import { supabase } from '../lib/supabase'

const TABLES = ['order_items', 'orders', 'production_entries', 'dispatch_entries', 'plating_entries', 'rm_lot']

const NEW_MACHINES = [
  // W1 Rollers
  ...Array.from({ length: 10 }, (_, i) => ({
    machine_code: `W1R${String(i + 1).padStart(2, '0')}-ROLLER`,
    machine_name: `W1R${String(i + 1).padStart(2, '0')}-Roller`,
    machine_type: 'Roller',
  })),
  // W2 Headers
  ...Array.from({ length: 17 }, (_, i) => ({
    machine_code: `W2H${String(i + 1).padStart(2, '0')}-HEADER`,
    machine_name: `W2H${String(i + 1).padStart(2, '0')}-Header`,
    machine_type: 'Header',
  })),
  // W2 Rollers
  ...Array.from({ length: 8 }, (_, i) => ({
    machine_code: `W2R${String(i + 1).padStart(2, '0')}-ROLLER`,
    machine_name: `W2R${String(i + 1).padStart(2, '0')}-Roller`,
    machine_type: 'Roller',
  })),
]

const DELETE_CODES = ['W1R01-OTHER', 'W1R02-OTHER']

export default function ResetData() {
  const [status, setStatus]         = useState('')
  const [done, setDone]             = useState(false)
  const [running, setRunning]       = useState(false)
  const [machStatus, setMachStatus] = useState('')
  const [machDone, setMachDone]     = useState(false)
  const [machRunning, setMachRunning] = useState(false)

  async function handleReset() {
    if (!window.confirm('This will permanently delete ALL transactional data. Are you sure?')) return
    setRunning(true)
    const errors = []
    for (const table of TABLES) {
      setStatus(`Clearing ${table}...`)
      const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (error) errors.push(`${table}: ${error.message}`)
    }
    setRunning(false)
    if (errors.length) {
      setStatus('Errors:\n' + errors.join('\n'))
    } else {
      setStatus('All transactional data deleted successfully.')
      setDone(true)
    }
  }

  async function handleMachines() {
    setMachRunning(true)

    // Delete old machines
    setMachStatus('Deleting W1R01-other & W1R02-other...')
    for (const code of DELETE_CODES) {
      await supabase.from('machines').delete().ilike('machine_code', code)
    }

    // Insert new machines (skip duplicates)
    setMachStatus('Fetching existing machines...')
    const { data: existing } = await supabase.from('machines').select('machine_code')
    const existingCodes = new Set((existing || []).map(m => m.machine_code.toUpperCase()))

    const toInsert = NEW_MACHINES.filter(m => !existingCodes.has(m.machine_code.toUpperCase()))
    setMachStatus(`Inserting ${toInsert.length} new machines...`)

    if (toInsert.length > 0) {
      const { error } = await supabase.from('machines').insert(toInsert)
      if (error) {
        setMachStatus('Error: ' + error.message)
        setMachRunning(false)
        return
      }
    }

    setMachRunning(false)
    setMachDone(true)
    setMachStatus(`Done. Deleted 2 old entries, added ${toInsert.length} new machines.`)
  }

  return (
    <div style={{ padding: 40, maxWidth: 520, margin: '60px auto', fontFamily: 'var(--sans)', display: 'flex', flexDirection: 'column', gap: 40 }}>

      {/* Reset transactional data */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Reset Transactional Data</h2>
        <p style={{ color: '#666', fontSize: 13, marginBottom: 16 }}>
          Deletes all orders, production, RM lots, dispatch, and plating entries. Masters are untouched.
        </p>
        {!done && (
          <button onClick={handleReset} disabled={running}
            style={{ background: running ? '#ccc' : '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer' }}>
            {running ? 'Deleting...' : 'Delete All Transactional Data'}
          </button>
        )}
        {status && <pre style={{ marginTop: 14, fontSize: 12, color: done ? 'green' : '#333', whiteSpace: 'pre-wrap' }}>{status}</pre>}
        {done && <p style={{ marginTop: 10, color: 'green', fontWeight: 600 }}>✓ Done. App is clean and ready for the owner.</p>}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb' }} />

      {/* Machine setup */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Setup Machines</h2>
        <p style={{ color: '#666', fontSize: 13, marginBottom: 6 }}>Removes W1R01-other & W1R02-other, then adds:</p>
        <ul style={{ fontSize: 12, color: '#555', marginBottom: 16, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>W1R01-Roller → W1R10-Roller (10 machines)</li>
          <li>W2H01-Header → W2H17-Header (17 machines)</li>
          <li>W2R01-Roller → W2R08-Roller (8 machines)</li>
        </ul>
        {!machDone && (
          <button onClick={handleMachines} disabled={machRunning}
            style={{ background: machRunning ? '#ccc' : '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: machRunning ? 'not-allowed' : 'pointer' }}>
            {machRunning ? 'Working...' : 'Setup Machines'}
          </button>
        )}
        {machStatus && <pre style={{ marginTop: 14, fontSize: 12, color: machDone ? 'green' : '#333', whiteSpace: 'pre-wrap' }}>{machStatus}</pre>}
        {machDone && <p style={{ marginTop: 10, color: 'green', fontWeight: 600 }}>✓ Machines updated successfully.</p>}
      </div>

    </div>
  )
}
