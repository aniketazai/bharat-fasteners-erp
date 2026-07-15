import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useRole } from '../contexts/RoleContext'

const ROLES = ['operator', 'member']  // admin is not assignable via UI
const ROLE_COLOR = { admin: 'var(--accent)', operator: 'var(--blue)', member: 'var(--green)' }
const ROLE_DESC  = {
  admin:    'Full access — all pages, masters & team management',
  operator: 'Operations access — RM, Production, Plating, most Masters',
  member:   'Dashboard only — overview access',
}

function RoleBadge({ role }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      background: ROLE_COLOR[role] + '22', color: ROLE_COLOR[role],
      fontFamily: 'var(--cond)', fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
      border: `1px solid ${ROLE_COLOR[role]}44`, textTransform: 'uppercase',
    }}>{role}</span>
  )
}

export default function AccountSettingsModal({ onClose }) {
  const { user }             = useAuth()
  const { role, profile, refetch } = useRole()

  const [tab, setTab]           = useState('profile')
  const [displayName, setName]  = useState('')
  const [nameMsg, setNameMsg]   = useState(null)
  const [nameSaving, setNS]     = useState(false)

  const [newPwd, setNewPwd]     = useState('')
  const [confPwd, setConfPwd]   = useState('')
  const [pwdMsg, setPwdMsg]     = useState(null)
  const [pwdSaving, setPS]      = useState(false)

  // Team management (admin only)
  const [team, setTeam]         = useState([])
  const [teamLoading, setTL]    = useState(false)
  const [teamMsg, setTeamMsg]   = useState(null)

  useEffect(() => {
    setName(profile?.display_name || user?.email?.split('@')[0] || '')
  }, [profile, user])

  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (tab === 'team' && role === 'admin') loadTeam()
  }, [tab, role])

  async function loadTeam() {
    setTL(true)
    const { data } = await supabase.from('user_profiles').select('*').order('created_at')
    setTeam(data || [])
    setTL(false)
  }

  async function saveProfile(e) {
    e.preventDefault()
    if (!displayName.trim()) return
    setNS(true); setNameMsg(null)
    const { error: authErr } = await supabase.auth.updateUser({ data: { display_name: displayName.trim() } })
    await supabase.from('user_profiles').update({ display_name: displayName.trim() }).eq('id', user.id)
    setNS(false)
    setNameMsg(authErr ? { ok: false, text: authErr.message } : { ok: true, text: 'Profile updated!' })
    refetch()
  }

  async function changePassword(e) {
    e.preventDefault()
    setPwdMsg(null)
    if (!newPwd) return setPwdMsg({ ok: false, text: 'Enter a new password.' })
    if (newPwd.length < 6) return setPwdMsg({ ok: false, text: 'Must be at least 6 characters.' })
    if (newPwd !== confPwd) return setPwdMsg({ ok: false, text: 'Passwords do not match.' })
    setPS(true)
    const { error } = await supabase.auth.updateUser({ password: newPwd })
    setPS(false)
    if (error) { setPwdMsg({ ok: false, text: error.message }) }
    else { setPwdMsg({ ok: true, text: 'Password changed successfully!' }); setNewPwd(''); setConfPwd('') }
  }

  async function changeRole(profileId, newRole) {
    setTeamMsg(null)
    const { error } = await supabase.from('user_profiles').update({ role: newRole }).eq('id', profileId)
    if (error) { setTeamMsg({ ok: false, text: error.message }) }
    else {
      setTeamMsg({ ok: true, text: 'Role updated.' })
      loadTeam()
      if (profileId === user.id) refetch()
    }
  }

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'

  const tabs = [
    ['profile',  '👤 Profile'],
    ['password', '🔒 Password'],
    ['info',     'ℹ Info'],
    ...(role === 'admin' ? [['team', '👥 Team']] : []),
  ]

  function Msg({ msg }) {
    if (!msg) return null
    return (
      <div style={{
        padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 12,
        background: msg.ok ? 'var(--greenbg)' : 'var(--redbg)',
        color: msg.ok ? 'var(--green)' : 'var(--red)',
        border: `1px solid ${msg.ok ? 'var(--greenbr)' : 'var(--redbr)'}`,
        fontFamily: 'var(--cond)', fontWeight: 600,
      }}>{msg.text}</div>
    )
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 600, animation: 'fadeIn .15s ease' }} />

      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 480, maxWidth: 'calc(100vw - 32px)',
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 12, boxShadow: 'var(--shadow-lg)', zIndex: 700,
        overflow: 'hidden', animation: 'fadeIn .15s ease',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontFamily: 'var(--cond)', fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {user?.email?.[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--cond)', fontSize: 14, fontWeight: 700 }}>
                  {profile?.display_name || user?.email?.split('@')[0]}
                </span>
                {role && <RoleBadge role={role} />}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{user?.email}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 22, lineHeight: 1, padding: '2px 6px', borderRadius: 4 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {tabs.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              flex: 1, padding: '10px 4px', background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === key ? 'var(--accent)' : 'transparent'}`,
              color: tab === key ? 'var(--accent)' : 'var(--muted)',
              fontFamily: 'var(--cond)', fontSize: 10, fontWeight: 700, letterSpacing: '.05em',
              cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap',
            }}>{label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', minHeight: 220, maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>

          {/* PROFILE */}
          {tab === 'profile' && (
            <form onSubmit={saveProfile}>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Email Address</label>
                <input value={user?.email || ''} readOnly style={{ background: 'var(--bg4)', color: 'var(--muted)', cursor: 'not-allowed' }} />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Display Name</label>
                <input value={displayName} onChange={e => setName(e.target.value)} placeholder="Your name" />
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Your Role</label>
                <div style={{ padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                  {role ? <RoleBadge role={role} /> : '—'}
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{ROLE_DESC[role] || ''}</span>
                </div>
              </div>
              <Msg msg={nameMsg} />
              <button className="btn-add" type="submit" disabled={nameSaving}>{nameSaving ? 'SAVING…' : 'SAVE PROFILE'}</button>
            </form>
          )}

          {/* PASSWORD */}
          {tab === 'password' && (
            <form onSubmit={changePassword}>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>Choose a strong password (min 6 characters).</p>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>New Password</label>
                <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="New password" autoComplete="new-password" />
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Confirm New Password</label>
                <input type="password" value={confPwd} onChange={e => setConfPwd(e.target.value)} placeholder="Re-enter new password" autoComplete="new-password" />
              </div>
              <Msg msg={pwdMsg} />
              <button className="btn-add" type="submit" disabled={pwdSaving}>{pwdSaving ? 'CHANGING…' : 'CHANGE PASSWORD'}</button>
            </form>
          )}

          {/* INFO */}
          {tab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                ['User ID',       user?.id?.slice(0,16) + '…'],
                ['Email',         user?.email],
                ['Member Since',  memberSince],
                ['Current Role',  null],
                ['App',           'Bharat Fasteners ERP'],
                ['Version',       'v1.0.0'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)', fontFamily: 'var(--cond)', fontSize: 11, fontWeight: 600, letterSpacing: '.04em' }}>{label}</span>
                  {label === 'Current Role'
                    ? <RoleBadge role={role || 'operator'} />
                    : <span style={{ fontFamily: 'var(--cond)', fontWeight: 700, fontSize: 12 }}>{value}</span>
                  }
                </div>
              ))}
            </div>
          )}

          {/* TEAM (admin only) */}
          {tab === 'team' && (
            <div>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.6 }}>
                Assign roles to team members. Changes take effect immediately on their next page load.
              </p>

              {/* Role legend */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {['operator', 'member'].map(r => (
                  <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--bg3)', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <RoleBadge role={r} />
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{ROLE_DESC[r]}</span>
                  </div>
                ))}
              </div>

              <Msg msg={teamMsg} />

              {teamLoading
                ? <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)', fontSize: 12 }}>Loading…</div>
                : (
                  <div className="tbl-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Email</th>
                          <th>Current Role</th>
                          <th>Change Role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {team.map(member => (
                          <tr key={member.id}>
                            <td style={{ fontWeight: 700, fontFamily: 'var(--cond)', fontSize: 12 }}>
                              {member.display_name || member.email?.split('@')[0]}
                              {member.id === user.id && <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 6 }}>(you)</span>}
                            </td>
                            <td style={{ fontSize: 11, color: 'var(--muted)' }}>{member.email}</td>
                            <td><RoleBadge role={member.role} /></td>
                            <td>
                              {member.role === 'admin'
                                ? <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--cond)' }}>Cannot change</span>
                                : (
                                  <select
                                    value={member.role}
                                    onChange={e => changeRole(member.id, e.target.value)}
                                    style={{ fontFamily: 'var(--cond)', fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer' }}
                                  >
                                    {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                                  </select>
                                )
                              }
                            </td>
                          </tr>
                        ))}
                        {team.length === 0 && <tr><td colSpan={4} className="empty">No users found.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </div>
          )}
        </div>
      </div>
    </>
  )
}
