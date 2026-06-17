import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import { I18nProvider } from './lib/i18n'
import TourProvider from './components/TourProvider'
import LanguageGate from './components/LanguageGate'
import ProtectedRoute from './components/ProtectedRoute'
import SessionSupersededOverlay from './components/SessionSupersededOverlay'
import ServerBusyBanner from './components/ServerBusyBanner'
import { useBroker } from './lib/useBroker'
import { hasAdminAccess } from './lib/types'
import Login from './pages/Login'
import Confirmed from './pages/Confirmed'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Agreement from './pages/Agreement'
import Home from './pages/Home'
import Account from './pages/Account'
import JobOrder from './pages/JobOrder'
import VerifyId from './pages/VerifyId'
import MyJobOrders from './pages/MyJobOrders'
import AdminRoute from './admin/AdminRoute'

// Code-split: customers never download the admin portal (and vice versa for
// the rarely-visited print view) — keeps the first paint lean.
const JobOrderPrint = lazy(() => import('./pages/JobOrderPrint'))
const Verify = lazy(() => import('./pages/Verify'))
const Payment = lazy(() => import('./pages/Payment'))
const Calculator = lazy(() => import('./pages/Calculator'))
const AppHome = lazy(() => import('./app/AppHome'))
const AppChecker = lazy(() => import('./app/AppChecker'))
const Vessels = lazy(() => import('./pages/Vessels'))
const SupportTickets = lazy(() => import('./pages/SupportTickets'))
const Manual = lazy(() => import('./pages/Manual'))
const AdminManual = lazy(() => import('./admin/ManualPage'))
const Dashboard = lazy(() => import('./admin/Dashboard'))
const Approvals = lazy(() => import('./admin/Approvals'))
const Brokers = lazy(() => import('./admin/Brokers'))
const CustomerDetail = lazy(() => import('./admin/CustomerDetail'))
const Consignees = lazy(() => import('./admin/Consignees'))
const AllJobOrders = lazy(() => import('./admin/AllJobOrders'))
const AdminNewJobOrder = lazy(() => import('./admin/NewJobOrder'))
const Settings = lazy(() => import('./admin/Settings'))
const BulletinBoardAdmin = lazy(() => import('./admin/BulletinBoardAdmin'))
const Checker = lazy(() => import('./admin/Checker'))
const CashierStation = lazy(() => import('./admin/CashierStation'))
const VesselSchedule = lazy(() => import('./admin/VesselSchedule'))
const Logs = lazy(() => import('./admin/Logs'))
const Security = lazy(() => import('./admin/Security'))
const SupportInbox = lazy(() => import('./admin/SupportInbox'))

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

// Staff land where their role works; customers see the broker home.
function RoleLanding() {
  const { broker, loading } = useBroker()
  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <span className="ktc-label">Loading…</span>
      </div>
    )
  }
  if (broker?.staff_role === 'checker') return <Navigate to="/admin/checker" replace />
  if (broker?.staff_role === 'operations') return <Navigate to="/admin/job-orders" replace />
  if (broker?.staff_role === 'cashier') return <Navigate to="/admin/cashier" replace />
  if (broker?.staff_role === 'csr') return <Navigate to="/admin/support" replace />
  if (hasAdminAccess(broker)) return <Navigate to="/admin" replace />
  return <Home />
}

export default function App() {
  return (
    <I18nProvider>
    <AuthProvider>
      <BrowserRouter>
        <TourProvider>
        <LanguageGate />
        <SessionSupersededOverlay />
        <ServerBusyBanner />
        <Suspense
          fallback={
            <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
              <span className="ktc-label">Loading…</span>
            </div>
          }
        >
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/confirmed" element={<Confirmed />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* Public — slip QR target: anyone can verify a Job Order is genuine + completed (no login) */}
          <Route path="/verify/:id" element={<Verify />} />
          {/* Public — readable before registering and linked from the registration consent */}
          <Route path="/agreement" element={<Agreement />} />
          {/* Old split docs now folded into the one agreement */}
          <Route path="/irr" element={<Navigate to="/agreement" replace />} />
          <Route path="/terms" element={<Navigate to="/agreement" replace />} />
          <Route path="/privacy" element={<Navigate to="/agreement" replace />} />

          {/* Broker portal */}
          <Route path="/" element={<Protected><RoleLanding /></Protected>} />
          <Route path="/account" element={<Protected><Account /></Protected>} />
          <Route path="/verify-id" element={<Protected><VerifyId /></Protected>} />
          <Route path="/job-order" element={<Protected><JobOrder /></Protected>} />
          <Route path="/job-order/:id/print" element={<Protected><JobOrderPrint /></Protected>} />
          <Route path="/job-order/:id/pay" element={<Protected><Payment /></Protected>} />
          <Route path="/calculator" element={<Protected><Calculator /></Protected>} />
          <Route path="/vessels" element={<Protected><Vessels /></Protected>} />
          {/* /accreditation removed 2026-06-11 (page deleted; consignee accreditation
              disabled per ADR-0007) — old links fall through to the catch-all → / */}
          <Route path="/job-orders" element={<Protected><MyJobOrders /></Protected>} />
          <Route path="/support" element={<Protected><SupportTickets /></Protected>} />
          <Route path="/manual" element={<Protected><Manual /></Protected>} />

          {/* Installable staff app (focused, role-aware) */}
          <Route path="/app" element={<Protected><AppHome /></Protected>} />
          <Route path="/app/checker" element={<Admin><AppChecker /></Admin>} />

          {/* Admin portal */}
          <Route path="/admin" element={<Admin><Dashboard /></Admin>} />
          <Route path="/admin/approvals" element={<Admin><Approvals /></Admin>} />
          <Route path="/admin/customers" element={<Admin><Brokers /></Admin>} />
          <Route path="/admin/customers/:id" element={<Admin><CustomerDetail /></Admin>} />
          <Route path="/admin/consignees" element={<Admin><Consignees /></Admin>} />
          <Route path="/admin/job-orders" element={<Admin><AllJobOrders /></Admin>} />
          <Route path="/admin/new-job-order" element={<Admin><AdminNewJobOrder /></Admin>} />
          <Route path="/admin/checker" element={<Admin><Checker /></Admin>} />
          <Route path="/admin/cashier" element={<Admin><CashierStation /></Admin>} />
          <Route path="/admin/vessel-schedule" element={<Admin><VesselSchedule /></Admin>} />
          <Route path="/admin/logs" element={<Admin><Logs /></Admin>} />
          <Route path="/admin/security" element={<Admin><Security /></Admin>} />
          <Route path="/admin/settings" element={<Admin><Settings /></Admin>} />
          <Route path="/admin/bulletin" element={<Admin><BulletinBoardAdmin /></Admin>} />
          <Route path="/admin/support" element={<Admin><SupportInbox /></Admin>} />
          <Route path="/admin/manual" element={<Admin><AdminManual /></Admin>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        </TourProvider>
      </BrowserRouter>
    </AuthProvider>
    </I18nProvider>
  )
}
