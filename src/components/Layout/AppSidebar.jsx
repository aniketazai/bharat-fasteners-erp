import { useState, useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, FileText, Package,
  Cpu, Layers, Truck, Settings2, Cable, Zap,
  ArrowLeftRight, Users, Palette, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, LogOut, User, ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useRole, ROLE_PATHS } from '../../contexts/RoleContext'
import AccountSettingsModal from '../AccountSettingsModal'

const GROUPS = [
  {
    label: 'CORE',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard',  path: '/dashboard'    },
      { icon: ShieldCheck,     label: 'Users',       path: '/admin/users'  },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      { icon: ClipboardList,  label: 'Orders',       path: '/orders'         },
      { icon: FileText,       label: 'RM Req.',       path: '/rm-requirement' },
      { icon: Package,        label: 'RM Lot',        path: '/rm-lot'         },
      { icon: Cpu,            label: 'Production',    path: '/production'     },
      { icon: Layers,         label: 'Plating',       path: '/plating'        },
      { icon: Truck,          label: 'Dispatch',      path: '/dispatch'       },
    ],
  },
  {
    label: 'MASTERS',
    items: [
      { icon: Settings2,      label: 'Machines',      path: '/masters/machines'      },
      { icon: Cable,          label: 'RM Wire',       path: '/masters/rm-wire'       },
      { icon: Zap,            label: 'Output Screws', path: '/masters/screws'        },
      { icon: ArrowLeftRight, label: 'Conversions',   path: '/masters/conversions'   },
      { icon: Users,          label: 'Customers',     path: '/masters/customers'     },
      { icon: Palette,        label: 'Plating Types', path: '/masters/plating-types' },
    ],
  },
]

const ROLE_COLOR = { admin: '#D96B10', operator: '#2563EB', quality: '#16A34A', member: '#16A34A' }

const SB_GROUPS_KEY = 'bf-sb-groups'
function loadGroups() {
  try { return JSON.parse(localStorage.getItem(SB_GROUPS_KEY) || '{}') } catch { return {} }
}

export default function AppSidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const { user, signOut }  = useAuth()
  const { role, profile }  = useRole()

  const [openGroups, setOpenGroups] = useState(loadGroups)
  const [acctOpen, setAcctOpen]     = useState(false)
  const [showSettings, setShow]     = useState(false)
  const acctRef = useRef(null)

  function toggleGroup(label) {
    setOpenGroups(prev => {
      const next = { ...prev, [label]: !(prev[label] === true) }
      localStorage.setItem(SB_GROUPS_KEY, JSON.stringify(next))
      return next
    })
  }

  useEffect(() => {
    function handler(e) {
      if (acctRef.current && !acctRef.current.contains(e.target)) setAcctOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const initial  = user?.email?.[0]?.toUpperCase() || '?'
  const username = profile?.display_name || user?.email?.split('@')[0] || '?'

  // Filter nav items based on role (allowedPaths: null=all, Set=restricted, undefined=loading)
  const allowedPaths = ROLE_PATHS[role]
  const visGroups = GROUPS.map(g => ({
    ...g,
    items: g.items.filter(item => allowedPaths == null || allowedPaths.has(item.path)),
  })).filter(g => g.items.length > 0)

  return (
    <>
      <aside className={`app-sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>

        {/* Collapse toggle */}
        <button className="sb-toggle" onClick={onToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* Navigation */}
        <nav className="sb-nav">
          {visGroups.map(group => {
            const isOpen = openGroups[group.label] === true
            return (
              <div key={group.label} className="sb-group">
                {!collapsed ? (
                  <button
                    onClick={() => toggleGroup(group.label)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '10px 16px 4px',
                      background: 'none', border: 'none', cursor: 'pointer', gap: 6,
                    }}
                  >
                    <span style={{
                      fontFamily: 'var(--cond)', fontSize: 11, fontWeight: 700,
                      letterSpacing: '.12em', color: '#A8A29E',
                      textTransform: 'uppercase', whiteSpace: 'nowrap',
                    }}>
                      {group.label}
                    </span>
                    <ChevronDown
                      size={12}
                      color="#A8A29E"
                      style={{
                        flexShrink: 0,
                        transition: 'transform .18s',
                        transform: isOpen ? 'rotate(180deg)' : 'none',
                      }}
                    />
                  </button>
                ) : null}

                {(isOpen || collapsed) && group.items.map(item => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) => `sb-item${isActive ? ' active' : ''}`}
                      title={collapsed ? item.label : undefined}
                      onClick={() => onMobileClose?.()}
                    >
                      <span className="sb-icon">
                        <Icon size={15} strokeWidth={1.75} />
                      </span>
                      {!collapsed && <span style={{ fontSize: 12, letterSpacing: '.03em' }}>{item.label}</span>}
                    </NavLink>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Account button at bottom */}
        <div ref={acctRef} className="sb-account">
          <button
            onClick={() => setAcctOpen(v => !v)}
            title={collapsed ? user?.email : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              width: '100%', padding: collapsed ? '7px 0' : '8px 10px',
              background: acctOpen ? '#292524' : 'transparent',
              border: `1px solid ${acctOpen ? '#3D3935' : '#292524'}`,
              borderRadius: 7, cursor: 'pointer',
              transition: 'background .15s, border-color .15s',
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
            onMouseEnter={e => { if (!acctOpen) e.currentTarget.style.background = '#292524' }}
            onMouseLeave={e => { if (!acctOpen) e.currentTarget.style.background = 'transparent' }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: ROLE_COLOR[role] || '#D96B10', color: '#fff',
              fontFamily: 'var(--cond)', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {initial}
            </div>

            {!collapsed && (
              <>
                <div style={{ flex: 1, overflow: 'hidden', textAlign: 'left' }}>
                  <div style={{
                    fontFamily: 'var(--cond)', fontSize: 12, fontWeight: 600,
                    color: '#E7E5E4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {username}
                  </div>
                  <div style={{
                    fontSize: 9, fontFamily: 'var(--cond)', fontWeight: 700,
                    letterSpacing: '.07em', textTransform: 'uppercase',
                    color: ROLE_COLOR[role] || '#A8A09A',
                  }}>
                    {role || '…'}
                  </div>
                </div>
                <ChevronUp
                  size={13}
                  style={{
                    color: acctOpen ? '#D96B10' : '#57534E',
                    transition: 'transform .15s',
                    transform: acctOpen ? 'rotate(180deg)' : 'none',
                    flexShrink: 0,
                  }}
                />
              </>
            )}
          </button>

          {/* Popup upward */}
          {acctOpen && (
            <div style={{
              position: 'absolute', bottom: 'calc(100% + 4px)',
              left: collapsed ? 68 : 8, right: collapsed ? 'auto' : 8,
              background: '#FFFFFF', border: '1px solid var(--border)',
              borderRadius: 10, boxShadow: 'var(--shadow-lg)',
              minWidth: 210, zIndex: 500, overflow: 'hidden',
              animation: 'fadeIn .12s ease',
            }}>
              <div style={{ padding: '12px 14px', background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: ROLE_COLOR[role] || '#D96B10', color: '#fff',
                    fontFamily: 'var(--cond)', fontSize: 14, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>{initial}</div>
                  <div>
                    <div style={{ fontFamily: 'var(--cond)', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{username}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{user?.email}</div>
                  </div>
                </div>
              </div>

              <button className="acct-item" onClick={e => { e.stopPropagation(); setAcctOpen(false); setShow(true) }}>
                <User size={14} /> Account Settings
              </button>
              <button className="acct-item danger" onClick={e => { e.stopPropagation(); setAcctOpen(false); signOut() }}>
                <LogOut size={14} /> Logout
              </button>
            </div>
          )}
        </div>
      </aside>

      {showSettings && <AccountSettingsModal onClose={() => setShow(false)} />}
    </>
  )
}
