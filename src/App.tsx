import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import { useBroker } from './lib/useBroker'
import { hasAdminAccess } from './lib/types'
import Login from './pages/Login'
import Agreement from './pages/Agreement'
import Home from './pages/Home'
import JobOrder from './pages/JobOrder'
import Accreditation from './pages/Accreditation'
import MyJobOrders from './pages/MyJobOrders'
import AdminRoute from './admin/AdminRoute'
import Dashboard from './admin/Dashboard'
import Approvals from './admin/Approvals'
import Brokers from './admin/Brokers'
import Consignees from './admin/Consignees'
import AllJobOrders from './admin/AllJobOrders'
import Settings from './admin/Settings'

function Protected({ children }: { children: ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>
}

function Admin({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <AdminRoute>{children}</AdminRoute>
    </ProtectedRoute>
  )
}

// Admins land in the admin portal; brokers see the broker home.
function RoleLanding() {
  const { broker, loading } = useBroker()
  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <span className="ktc-label">Loading…</span>
      </div>
    )
  }
  if (hasAdminAccess(broker)) return <Navigate to="/admin" replace />
  return <Home />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Public — readable before registering and linked from the registration consent */}
          <Route path="/agreement" element={<Agreement />} />
          {/* Old split docs now folded into the one agreement */}
          <Route path="/irr" element={<Navigate to="/agreement" replace />} />
          <Route path="/terms" element={<Navigate to="/agreement" replace />} />
          <Route path="/privacy" element={<Navigate to="/agreement" replace />} />

          {/* Broker portal */}
          <Route path="/" element={<Protected><RoleLanding /></Protected>} />
          <Route path="/job-order" element={<Protected><JobOrder /></Protected>} />
          <Route path="/accreditation" element={<Protected><Accreditation /></Protected>} />
          <Route path="/job-orders" element={<Protected><MyJobOrders /></Protected>} />

          {/* Admin portal */}
          <Route path="/admin" element={<Admin><Dashboard /></Admin>} />
          <Route path="/admin/approvals" element={<Admin><Approvals /></Admin>} />
          <Route path="/admin/brokers" element={<Admin><Brokers /></Admin>} />
          <Route path="/admin/consignees" element={<Admin><Consignees /></Admin>} />
          <Route path="/admin/job-orders" element={<Admin><AllJobOrders /></Admin>} />
          <Route path="/admin/settings" element={<Admin><Settings /></Admin>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
