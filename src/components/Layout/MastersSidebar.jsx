import { NavLink } from 'react-router-dom'

const MASTER_LINKS = [
  { icon: '⚙',  label: 'Machines',      path: '/masters/machines'      },
  { icon: '🔩', label: 'RM Wire',        path: '/masters/rm-wire'       },
  { icon: '🔧', label: 'Output Screws',  path: '/masters/screws'        },
  { icon: '🏢', label: 'Customers',      path: '/masters/customers'     },
  { icon: '✨', label: 'Plating Types',  path: '/masters/plating-types' },
]

export default function MastersSidebar({ open, onClose }) {
  return (
    <>
      <div
        className={`sidebar-overlay${open ? ' open' : ''}`}
        onClick={onClose}
      />
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">⚙ MASTERS</span>
          <button className="sidebar-close" onClick={onClose}>×</button>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-nav-label">Reference Data</div>
          {MASTER_LINKS.map(link => (
            <NavLink
              key={link.path}
              to={link.path}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
              onClick={onClose}
            >
              <span className="sidebar-link-icon">{link.icon}</span>
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  )
}
