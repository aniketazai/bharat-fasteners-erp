import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { RoleProvider, useRole, ROLE_PATHS, ROLE_HOME } from './contexts/RoleContext'
import Topbar from './components/Layout/Topbar'
import StageNav from './components/Layout/StageNav'
import AppSidebar from './components/Layout/AppSidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import RMRequirement from './pages/RMRequirement'
import RMLot from './pages/RMLot'
import Production from './pages/Production'
import Plating from './pages/Plating'
import Dispatch from './pages/Dispatch'
import Machines from './pages/masters/Machines'
import RMWire from './pages/masters/RMWire'
import OutputScrews from './pages/masters/OutputScrews'
import Customers from './pages/masters/Customers'
import PlatingTypes from './pages/masters/PlatingTypes'
import ConversionMaster from './pages/masters/ConversionMaster'
import ResetData from './pages/ResetData'
import FinishedGoods from './pages/FinishedGoods'
import AdminUsers from './pages/admin/Users'
import './styles/theme.css'

const SB_KEY = 'bf-sb-collapsed'

function HomeRedirect() {
  const { role, loading } = useRole()
  if (loading || role === null) return null
  return <Navigate to={ROLE_HOME[role] || '/dashboard'} replace />
}

function Guard({ path, element }) {
  const { role, loading } = useRole()
  if (loading || role === null) return null        // wait until role is resolved
  const allowed = ROLE_PATHS[role]
  if (allowed === null) return element            // admin — all paths
  if (allowed && allowed.has(path)) return element
  return <Navigate to={ROLE_HOME[role] || '/dashboard'} replace />
}

function AppShell() {
  const { user, loading } = useAuth()
  const [collapsed, setCollapsed]   = useState(() => localStorage.getItem(SB_KEY) === 'true')
  const [mobileOpen, setMobileOpen] = useState(false)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <span style={{ fontFamily: 'var(--cond)', color: 'var(--muted)', fontSize: '13px', letterSpacing: '.06em' }}>LOADING…</span>
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  function toggleSidebar() {
    setCollapsed(c => {
      const next = !c
      localStorage.setItem(SB_KEY, next)
      return next
    })
  }

  const sbW = collapsed ? 52 : 220

  return (
    <>
      <Topbar onHamburger={() => setMobileOpen(o => !o)} />
      <AppSidebar collapsed={collapsed} onToggle={toggleSidebar} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      {mobileOpen && <div className="mobile-overlay" onClick={() => setMobileOpen(false)} />}
      <div id="main-content" style={{ marginLeft: sbW, transition: 'margin-left .2s cubic-bezier(.4,0,.2,1)' }}>
        <StageNav />
        <Routes>
          <Route path="/"      element={<HomeRedirect />} />
          <Route path="/login" element={<HomeRedirect />} />
          <Route path="/dashboard"      element={<Guard path="/dashboard"           element={<Dashboard />} />} />
          <Route path="/orders"         element={<Guard path="/orders"              element={<Orders />} />} />
          <Route path="/rm-requirement" element={<Guard path="/rm-requirement"      element={<RMRequirement />} />} />
          <Route path="/rm-lot"         element={<Guard path="/rm-lot"              element={<RMLot />} />} />
          <Route path="/production"     element={<Guard path="/production"          element={<Production />} />} />
          <Route path="/plating"        element={<Guard path="/plating"             element={<Plating />} />} />
          <Route path="/fg"             element={<Guard path="/fg"                  element={<FinishedGoods />} />} />
          <Route path="/dispatch"       element={<Guard path="/dispatch"            element={<Dispatch />} />} />
          <Route path="/masters/machines"      element={<Guard path="/masters/machines"      element={<Machines />} />} />
          <Route path="/masters/rm-wire"       element={<Guard path="/masters/rm-wire"       element={<RMWire />} />} />
          <Route path="/masters/screws"        element={<Guard path="/masters/screws"        element={<OutputScrews />} />} />
          <Route path="/masters/conversions"   element={<Guard path="/masters/conversions"   element={<ConversionMaster />} />} />
          <Route path="/masters/customers"     element={<Guard path="/masters/customers"     element={<Customers />} />} />
          <Route path="/masters/plating-types" element={<Guard path="/masters/plating-types" element={<PlatingTypes />} />} />
          <Route path="/admin/users" element={<Guard path="/admin/users" element={<AdminUsers />} />} />
          <Route path="/reset" element={<ResetData />} />
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </div>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RoleProvider>
          <AppShell />
        </RoleProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
