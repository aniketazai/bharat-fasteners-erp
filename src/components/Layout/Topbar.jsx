import { useRef, useState, useEffect } from 'react'
import { User, LogOut, Settings, Menu } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useRole } from '../../contexts/RoleContext'
import AccountSettingsModal from '../AccountSettingsModal'

function AccountMenu({ user, signOut }) {
  const [open, setOpen]     = useState(false)
  const [showSettings, setShow] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const initial = user?.email?.[0]?.toUpperCase() || '?'

  return (
    <>
      <div className="account-menu" ref={ref}>
        <div className="account-avatar" onClick={() => setOpen(v => !v)} title={user?.email}>
          {initial}
        </div>
        {open && (
          <div className="account-dropdown">
            <div className="acct-email">{user?.email}</div>
            <button className="acct-item" onClick={() => { setOpen(false); setShow(true) }}>
              <Settings size={13} /> Account Settings
            </button>
            <button className="acct-item danger" onClick={() => { setOpen(false); signOut() }}>
              <LogOut size={13} /> Logout
            </button>
          </div>
        )}
      </div>
      {showSettings && <AccountSettingsModal onClose={() => setShow(false)} />}
    </>
  )
}

export default function Topbar({ onHamburger }) {
  const { user, signOut } = useAuth()
  const { profile }       = useRole()

  const now    = new Date()
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`

  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button className="mobile-hamburger" onClick={onHamburger} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <div className="logo-wrap">
          <div className="logo-icon">BF</div>
          <div>
            <div className="logo-text">BHARAT <span>FASTENERS</span></div>
            <span className="logo-sub">PRODUCTION ERP</span>
          </div>
        </div>
      </div>

      <div className="topbar-right">
        <span className="date-badge">{dateStr}</span>
        {user && <AccountMenu user={user} signOut={signOut} />}
      </div>
    </header>
  )
}
