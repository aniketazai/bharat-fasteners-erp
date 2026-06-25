import { useAuth } from '../../contexts/AuthContext'

export default function Topbar({ onMastersOpen }) {
  const { user, signOut } = useAuth()

  const today = new Date()
  const days  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const dateStr = `${days[today.getDay()]}, ${String(today.getDate()).padStart(2,'0')}-${String(today.getMonth()+1).padStart(2,'0')}-${today.getFullYear()}`

  return (
    <header className="topbar">
      <div className="logo-wrap">
        <div className="logo-icon">BF</div>
        <div>
          <div className="logo-text">BHARAT <span>FASTENERS</span></div>
          <span className="logo-sub">PRODUCTION ERP</span>
        </div>
      </div>

      <div className="topbar-right">
        <span className="date-badge">{dateStr}</span>

        <button className="masters-btn" onClick={onMastersOpen}>
          ⚙ MASTERS
        </button>

        {user && (
          <span className="user-badge" title={user.email}>
            {user.email}
          </span>
        )}

        <button className="logout-btn" onClick={signOut}>
          LOGOUT
        </button>
      </div>
    </header>
  )
}
