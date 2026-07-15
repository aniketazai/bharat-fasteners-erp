import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const ROLES = ['admin', 'operator', 'quality']
const ROLE_BADGE = {
  admin:    { bg: '#FFF7ED', color: '#D96B10', border: '#FED7AA' },
  operator: { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' },
  quality:  { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' },
  member:   { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0' },
}

const EMPTY_NEW = { email: '', password: '', display_name: '', role: 'operator' }

export default function AdminUsers() {
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(null) // user id being saved
  const [roleEdits, setRoleEdits] = useState({}) // id → new role

  const [showForm, setShowForm] = useState(false)
  const [newUser, setNewUser]   = useState(EMPTY_NEW)
  const [newErr, setNewErr]     = useState({})
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('user_profiles').select('*').order('created_at', { ascending: true })
    setUsers(data || [])
    setLoading(false)
  }

  async function saveRole(userId) {
    const newRole = roleEdits[userId]
    if (!newRole) return
    setSaving(userId)
    await supabase.from('user_profiles').update({ role: newRole }).eq('id', userId)
    setSaving(null)
    setRoleEdits(prev => { const n = { ...prev }; delete n[userId]; return n })
    load()
  }

  function validateNew(f) {
    const e = {}
    if (!f.email.trim() || !f.email.includes('@')) e.email = 'Valid email required.'
    if (!f.password || f.password.length < 6) e.password = 'Min 6 characters.'
    if (!f.display_name.trim()) e.display_name = 'Name required.'
    if (!f.role) e.role = 'Select a role.'
    return e
  }

  async function handleCreate(ev) {
    ev.preventDefault()
    const errs = validateNew(newUser)
    if (Object.keys(errs).length) { setNewErr(errs); return }
    setCreating(true)
    setCreateMsg('')

    const { data, error } = await supabase.auth.signUp({
      email:    newUser.email.trim().toLowerCase(),
      password: newUser.password,
    })

    if (error) {
      setNewErr({ email: error.message })
      setCreating(false)
      return
    }

    const uid = data.user?.id
    if (uid) {
      await supabase.from('user_profiles').upsert({
        id:           uid,
        email:        newUser.email.trim().toLowerCase(),
        display_name: newUser.display_name.trim(),
        role:         newUser.role,
      })
    }

    setCreating(false)
    setShowForm(false)
    setNewUser(EMPTY_NEW)
    setNewErr({})
    setCreateMsg(data.user?.identities?.length === 0
      ? 'User already exists — role updated if profile was found.'
      : `User created. ${data.session ? 'Active immediately.' : 'They may need to confirm their email (check Supabase Auth settings to disable confirmation).'}`)
    load()
  }

  const inp = { fontSize: 13, padding: '7px 10px', borderRadius: 5, border: '1px solid var(--border)', fontFamily: 'var(--font)', width: '100%', background: 'var(--bg)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }
  const lbl = { fontSize: 11, fontFamily: 'var(--cond)', fontWeight: 700, color: 'var(--muted)', letterSpacing: '.06em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }

  return (
    <div className="main page-enter">
      <div className="sh">
        <span className="sh-num">AD</span>
        <span className="sh-title">USER MANAGEMENT</span>
        <span className="sh-desc">Manage logins and role access · {users.length} users</span>
      </div>

      {/* Role legend */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { role: 'admin',    desc: 'Full access — all pages including dashboard' },
          { role: 'operator', desc: 'Production + Plating only' },
          { role: 'quality',  desc: 'RM Requirement, RM Lot, Plating, Dispatch' },
        ].map(({ role, desc }) => {
          const b = ROLE_BADGE[role]
          return (
            <div key={role} style={{ background: b.bg, border: `1px solid ${b.border}`, borderRadius: 8, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 11, color: b.color, textTransform: 'uppercase', letterSpacing: '.06em' }}>{role}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{desc}</span>
            </div>
          )
        })}
      </div>

      {/* Create user form */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn-add" onClick={() => { setShowForm(s => !s); setNewErr({}); setCreateMsg('') }}>
          {showForm ? 'CANCEL' : '+ ADD USER'}
        </button>
      </div>

      {createMsg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 7, background: '#F0FDF4', border: '1px solid #BBF7D0', fontSize: 12, color: '#16A34A' }}>
          {createMsg}
        </div>
      )}

      {showForm && (
        <div className="form-card" style={{ borderLeftColor: 'var(--accent)', marginBottom: 20 }}>
          <div className="form-title" style={{ color: 'var(--accent)' }}>CREATE NEW USER</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16, padding: '8px 10px', background: '#FFF7ED', borderRadius: 5, border: '1px solid #FED7AA' }}>
            ⚠️ For immediate login without email confirmation, disable <strong>Email Confirmations</strong> in your Supabase project: Authentication → Settings → Email → Disable "Confirm email".
          </div>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={lbl}>Display Name *</label>
                <input style={{ ...inp, borderColor: newErr.display_name ? 'var(--red)' : 'var(--border)' }}
                  value={newUser.display_name}
                  onChange={e => setNewUser(f => ({ ...f, display_name: e.target.value }))}
                  placeholder="e.g. Ravi Kumar" />
                {newErr.display_name && <span className="field-error">{newErr.display_name}</span>}
              </div>
              <div>
                <label style={lbl}>Role *</label>
                <select style={{ ...inp, borderColor: newErr.role ? 'var(--red)' : 'var(--border)' }}
                  value={newUser.role}
                  onChange={e => setNewUser(f => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
                {newErr.role && <span className="field-error">{newErr.role}</span>}
              </div>
              <div>
                <label style={lbl}>Email *</label>
                <input style={{ ...inp, borderColor: newErr.email ? 'var(--red)' : 'var(--border)' }}
                  type="email" value={newUser.email}
                  onChange={e => setNewUser(f => ({ ...f, email: e.target.value }))}
                  placeholder="user@company.com" />
                {newErr.email && <span className="field-error">{newErr.email}</span>}
              </div>
              <div>
                <label style={lbl}>Password *</label>
                <input style={{ ...inp, borderColor: newErr.password ? 'var(--red)' : 'var(--border)' }}
                  type="password" value={newUser.password}
                  onChange={e => setNewUser(f => ({ ...f, password: e.target.value }))}
                  placeholder="Min 6 characters" />
                {newErr.password && <span className="field-error">{newErr.password}</span>}
              </div>
            </div>
            <div className="form-actions" style={{ marginTop: 16 }}>
              <button className="btn-add" type="submit" disabled={creating}>
                {creating ? 'CREATING…' : 'CREATE USER'}
              </button>
              <button className="btn-clear" type="button" onClick={() => { setShowForm(false); setNewErr({}) }}>CANCEL</button>
            </div>
          </form>
        </div>
      )}

      {/* Users table */}
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>Name</th>
              <th>Email</th>
              <th>Current Role</th>
              <th>Change Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
            {!loading && users.length === 0 && <tr><td colSpan={6} className="empty">No users found. Check Supabase RLS on user_profiles.</td></tr>}
            {users.map((u, i) => {
              const b = ROLE_BADGE[u.role] || ROLE_BADGE.quality
              const editRole = roleEdits[u.id] || u.role
              const isDirty  = roleEdits[u.id] && roleEdits[u.id] !== u.role
              return (
                <tr key={u.id}>
                  <td style={{ color: 'var(--dim)', fontSize: 11 }}>{i + 1}</td>
                  <td>
                    <span style={{ fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 13 }}>{u.display_name || '—'}</span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{u.email}</td>
                  <td>
                    <span style={{ fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 11, padding: '3px 8px', borderRadius: 4, background: b.bg, color: b.color, border: `1px solid ${b.border}`, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <select
                      value={editRole}
                      onChange={e => setRoleEdits(prev => ({ ...prev, [u.id]: e.target.value }))}
                      style={{ fontSize: 12, padding: '5px 8px', borderRadius: 5, border: `1px solid ${isDirty ? '#D96B10' : 'var(--border)'}`, background: isDirty ? '#FFF7ED' : 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)', outline: 'none' }}>
                      {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                    </select>
                  </td>
                  <td>
                    {isDirty && (
                      <button className="btn-add" style={{ fontSize: 11, padding: '5px 12px' }}
                        disabled={saving === u.id}
                        onClick={() => saveRole(u.id)}>
                        {saving === u.id ? 'Saving…' : 'Save'}
                      </button>
                    )}
                    {!isDirty && <span style={{ fontSize: 11, color: 'var(--dim)' }}>—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
