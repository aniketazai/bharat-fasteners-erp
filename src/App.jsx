import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Topbar from './components/Layout/Topbar'
import StageNav from './components/Layout/StageNav'
import MastersSidebar from './components/Layout/MastersSidebar'
import Login from './pages/Login'
import Orders from './pages/Orders'
import RMRequirement from './pages/RMRequirement'
import RMLot from './pages/RMLot'
import Production from './pages/Production'
import Plating from './pages/Plating'
import Dispatch from './pages/Dispatch'
import Summary from './pages/Summary'
import Machines from './pages/masters/Machines'
import RMWire from './pages/masters/RMWire'
import OutputScrews from './pages/masters/OutputScrews'
import Customers from './pages/masters/Customers'
import PlatingTypes from './pages/masters/PlatingTypes'
import './styles/theme.css'

function AppShell() {
  const { user, loading } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

  return (
    <>
      <Topbar onMastersOpen={() => setSidebarOpen(true)} />
      <StageNav />
      <MastersSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Routes>
        <Route path="/" element={<Navigate to="/orders" replace />} />
        <Route path="/login" element={<Navigate to="/orders" replace />} />
        <Route path="/orders"         element={<Orders />} />
        <Route path="/rm-requirement" element={<RMRequirement />} />
        <Route path="/rm-lot"         element={<RMLot />} />
        <Route path="/production"     element={<Production />} />
        <Route path="/plating"        element={<Plating />} />
        <Route path="/dispatch"       element={<Dispatch />} />
        <Route path="/summary"        element={<Summary />} />
        <Route path="/masters/machines"      element={<Machines />} />
        <Route path="/masters/rm-wire"       element={<RMWire />} />
        <Route path="/masters/screws"        element={<OutputScrews />} />
        <Route path="/masters/customers"     element={<Customers />} />
        <Route path="/masters/plating-types" element={<PlatingTypes />} />
        <Route path="*" element={<Navigate to="/orders" replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  )
}
