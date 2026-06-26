import { Suspense, useEffect, useRef, type ReactNode } from 'react'
import { lazyWithReload } from './lib/lazyWithReload'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { I18nProvider } from './lib/i18n'
import TourProvider from './components/TourProvider'
import FirstRunSetup from './components/FirstRunSetup'
import ProtectedRoute from './components/ProtectedRoute'
import SessionSupersededOverlay from './components/SessionSupersededOverlay'
import ServerBusyBanner from './components/ServerBusyBanner'
import RouteLoader from './components/RouteLoader'
import HeroSlideshow from './components/HeroSlideshow'
import { useBroker } from './lib/useBroker'
import { hasAdminAccess } from './lib/types'
import Login from './pages/Login'
import Landing from './pages/Landing'
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
const JobOrderPrint = lazyWithReload(() => import('./pages/JobOrderPrint'))
const Verify = lazyWithReload(() => import('./pages/Verify'))
const Payment = lazyWithReload(() => import('./pages/Payment'))
const Calculator = lazyWithReload(() => import('./pages/Calculator'))
const AppHome = lazyWithReload(() => import('./app/AppHome'))
const AppChecker = lazyWithReload(() => import('./app/AppChecker'))
const Vessels = lazyWithReload(() => import('./pages/Vessels'))
const SupportTickets = lazyWithReload(() => import('./pages/SupportTickets'))
const Releases = lazyWithReload(() => import('./pages/Releases'))
const MyRequests = lazyWithReload(() => import('./pages/MyRequests'))
const Manual = lazyWithReload(() => import('./pages/Manual'))
const AdminManual = lazyWithReload(() => import('./admin/ManualPage'))
const Dashboard = lazyWithReload(() => import('./admin/Dashboard'))
const Approvals = lazyWithReload(() => import('./admin/Approvals'))
const Brokers = lazyWithReload(() => import('./admin/Brokers'))
const CustomerDetail = lazyWithReload(() => import('./admin/CustomerDetail'))
const Consignees = lazyWithReload(() => import('./admin/Consignees'))
const AllJobOrders = lazyWithReload(() => import('./admin/AllJobOrders'))
const AdminNewJobOrder = lazyWithReload(() => import('./admin/NewJobOrder'))
const Settings = lazyWithReload(() => import('./admin/Settings'))
const BulletinBoardAdmin = lazyWithReload(() => import('./admin/BulletinBoardAdmin'))
const Checker = lazyWithReload(() => import('./admin/Checker'))
const CashierStation = lazyWithReload(() => import('./admin/CashierStation'))
const VesselSchedule = lazyWithReload(() => import('./admin/VesselSchedule'))
const Logs = lazyWithReload(() => import('./admin/Logs'))
const Security = lazyWithReload(() => import('./admin/Security'))
const SupportInbox = lazyWithReload(() => import('./admin/SupportInbox'))
const AdminReleases = lazyWithReload(() => import('./admin/Releases'))

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
  if (loading) return <RouteLoader />
  // Operational roles land on their FOCUSED single-purpose screen (web + app);
  // the full portal is one tap away via "Open full portal".
  if (broker?.staff_role === 'checker') return <Navigate to="/app/checker" replace />
  if (broker?.staff_role === 'operations') return <Navigate to="/app/operations" replace />
  if (broker?.staff_role === 'cashier') return <Navigate to="/app/cashier" replace />
  if (broker?.staff_role === 'csr') return <Navigate to="/app/support" replace />
  if (hasAdminAccess(broker)) return <Navigate to="/admin" replace />
  return <Home />
}

// Root route: a signed-out visitor sees the public Landing; a signed-in session
// goes straight to its role landing (no landing detour, no forced accept gate).
function RootGate() {
  const { session, loading } = useAuth()
  if (loading) return <RouteLoader />
  if (!session) return <Landing />
  return <Protected><RoleLanding /></Protected>
}

// Replays a gentle fade on each navigation. height:100% keeps the viewport-height
// chain intact (the public Landing/Login center via minHeight:100%, and RouteLoader
// fills the viewport) — without it, the inserted wrapper collapses to content height.
// Opacity-only animation (see .ktc-route) — NO transform, so a page's fixed/sticky
// chrome resolves against the viewport. We restart the animation by REFLOW, not a
// React key: a key would remount the whole routed subtree and discard in-page state
// on param-only navigation (e.g. /job-order/1/pay → /job-order/2/pay).
function RouteFade({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.classList.remove('ktc-route')
    void el.offsetWidth // force reflow so the fade animation can replay
    el.classList.add('ktc-route')
  }, [pathname])
  return <div ref={ref} className="ktc-route" style={{ height: '100%' }}>{children}</div>
}

// Persistent terminal-photo backdrop for the public auth flow. Rendered ONCE at the
// app level (outside RouteFade), shown only on landing / sign-in / create-account — so
// navigating between them just fades the card content over the SAME photo (no backdrop
// re-fade, no page-reload feel). On every other route it renders nothing.
function PublicBackdrop() {
  const { pathname } = useLocation()
  if (pathname !== '/' && pathname !== '/login' && pathname !== '/register') return null
  return (
    <div className="ktc-public-bg" aria-hidden="true">
      <HeroSlideshow />
      <div className="ktc-landing__scrim" />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
    <I18nProvider>
      <BrowserRouter>
        <TourProvider>
        <FirstRunSetup />
        <SessionSupersededOverlay />
        <ServerBusyBanner />
        <PublicBackdrop />
        <Suspense fallback={<RouteLoader />}>
        <RouteFade>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Walk-in QR target — opens Login straight in sign-up mode */}
          <Route path="/register" element={<Login />} />
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
          <Route path="/" element={<RootGate />} />
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
          <Route path="/releases" element={<Protected><Releases /></Protected>} />
          <Route path="/requests" element={<Protected><MyRequests /></Protected>} />
          <Route path="/manual" element={<Protected><Manual /></Protected>} />

          {/* Installable staff app (focused, role-aware) */}
          <Route path="/app" element={<Protected><AppHome /></Protected>} />
          <Route path="/app/checker" element={<Admin><AppChecker /></Admin>} />
          <Route path="/app/cashier" element={<Admin><CashierStation app /></Admin>} />
          <Route path="/app/support" element={<Admin><SupportInbox app /></Admin>} />
          <Route path="/app/operations" element={<Admin><AllJobOrders app /></Admin>} />

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
          <Route path="/admin/releases" element={<Admin><AdminReleases /></Admin>} />
          <Route path="/admin/vessel-schedule" element={<Admin><VesselSchedule /></Admin>} />
          <Route path="/admin/logs" element={<Admin><Logs /></Admin>} />
          <Route path="/admin/security" element={<Admin><Security /></Admin>} />
          <Route path="/admin/settings" element={<Admin><Settings /></Admin>} />
          <Route path="/admin/bulletin" element={<Admin><BulletinBoardAdmin /></Admin>} />
          <Route path="/admin/support" element={<Admin><SupportInbox /></Admin>} />
          <Route path="/admin/manual" element={<Admin><AdminManual /></Admin>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </RouteFade>
        </Suspense>
        </TourProvider>
      </BrowserRouter>
    </I18nProvider>
    </AuthProvider>
  )
}
