import { Suspense, useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { lazyWithReload } from './lib/lazyWithReload'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { I18nProvider, useT } from './lib/i18n'
import TourProvider from './components/TourProvider'
import { WalkthroughProvider } from './components/Walkthrough'
import FirstRunSetup from './components/FirstRunSetup'
import ProtectedRoute from './components/ProtectedRoute'
import SessionSupersededOverlay from './components/SessionSupersededOverlay'
import ServerBusyBanner from './components/ServerBusyBanner'
import MfaChallenge from './components/MfaChallenge'
import { supabase } from './lib/supabase'
import RouteLoader from './components/RouteLoader'
import HeroSlideshow from './components/HeroSlideshow'
import PublicShell from './components/PublicShell'
import AuthRail from './components/AuthRail'
import { useBroker } from './lib/useBroker'
import { hasAdminAccess, isStaff } from './lib/types'
import { isNativeApp } from './lib/nativeDevice'
import { Browser } from '@capacitor/browser'
import Login from './pages/Login'
import Confirmed from './pages/Confirmed'
import EmailChangeConfirm from './pages/EmailChangeConfirm'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Agreement from './pages/Agreement'
import Home from './pages/Home'
import Account from './pages/Account'
import JobOrder from './pages/JobOrder'
import VerifyId from './pages/VerifyId'
import MyJobOrders from './pages/MyJobOrders'
import AdminRoute from './admin/AdminRoute'
import { type Permission } from './lib/usePermissions'

const APP_TARGET = import.meta.env.VITE_APP_TARGET ?? 'prod'
const PUBLIC_PORTAL_URL = import.meta.env.VITE_PUBLIC_PORTAL_URL ?? 'https://portal.ktcterminal.com'

// Code-split: customers never download the admin portal (and vice versa for
// the rarely-visited print view) — keeps the first paint lean.
const JobOrderPrint = lazyWithReload(() => import('./pages/JobOrderPrint'))
const Verify = lazyWithReload(() => import('./pages/Verify'))
const Calculator = lazyWithReload(() => import('./pages/Calculator'))
const AppHome = lazyWithReload(() => import('./app/AppHome'))
const AppChecker = lazyWithReload(() => import('./app/AppChecker'))
const NativeDevice = lazyWithReload(() => import('./app/NativeDevice'))
const Vessels = lazyWithReload(() => import('./pages/Vessels'))
const SupportTickets = lazyWithReload(() => import('./pages/SupportTickets'))
const Releases = lazyWithReload(() => import('./pages/Releases'))
const MyRequests = lazyWithReload(() => import('./pages/MyRequests'))
const Notifications = lazyWithReload(() => import('./pages/Notifications'))
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
const VesselSchedule = lazyWithReload(() => import('./admin/VesselSchedule'))
const Logs = lazyWithReload(() => import('./admin/Logs'))
const Security = lazyWithReload(() => import('./admin/Security'))
const AccountStaff = lazyWithReload(() => import('./admin/AccountStaff'))
const SupportInbox = lazyWithReload(() => import('./admin/SupportInbox'))
const AdminNotifications = lazyWithReload(() => import('./admin/NotificationsPage'))
const AdminReleases = lazyWithReload(() => import('./admin/Releases'))
const PaymentOrderDesk = lazyWithReload(() => import('./admin/PaymentOrderDesk'))
const ChargeApproval = lazyWithReload(() => import('./admin/ChargeApproval'))
const Reconciliation = lazyWithReload(() => import('./admin/Reconciliation'))
const ChargeAuditView = lazyWithReload(() => import('./admin/ChargeAuditView'))

function Protected({ children }: { children: ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>
}

function Admin({ children, perm }: { children: ReactNode; perm?: Permission | Permission[] }) {
  return (
    <ProtectedRoute>
      <AdminRoute perm={perm}>{children}</AdminRoute>
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
  if (broker?.staff_role === 'cashier') return <Navigate to="/app/payment-orders" replace />
  if (broker?.staff_role === 'csr') return <Navigate to="/app/support" replace />
  if (hasAdminAccess(broker)) return <Navigate to="/admin" replace />
  return <Home />
}

// Root route: a signed-out visitor sees the public access rail (rendered inside the
// shared PublicShell's Outlet); a signed-in session goes straight to its role landing
// (no landing detour, no forced accept gate).
function RootGate() {
  const { session, loading } = useAuth()
  if (loading) return <RouteLoader />
  if (!session) return <AuthRail />
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
    // The shared public pages ("/", "/login", "/register") fade their own right column
    // (PublicShell's .ktc-public-swap) — skip the app-level fade so the persistent card
    // chrome doesn't re-fade on navigation between them.
    if (pathname === '/' || pathname === '/login' || pathname === '/register') return
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

// Logged-in app backdrop — a dimmed KTC terminal aerial behind the shell, one per
// role (the staff side was previously blank). Skips the public auth flow (PublicBackdrop
// owns that) and the public /verify QR page. Edit ROLE_PHOTO to re-assign images.
const APP_BG_PUBLIC = new Set([
  '/', '/login', '/register', '/confirmed', '/forgot-password', '/reset-password',
  '/email-change-confirm', '/agreement', '/irr', '/terms', '/privacy',
])
const ROLE_PHOTO: Record<string, number> = {
  customer: 1, owner: 3, admin: 16, operations: 11, cashier: 8, checker: 20, csr: 5,
}
function AppBackdrop() {
  const { session } = useAuth()
  const { broker } = useBroker()
  const { pathname } = useLocation()
  if (!session || APP_BG_PUBLIC.has(pathname) || pathname.startsWith('/verify/')) return null
  const role = !broker ? 'customer'
    : broker.is_owner ? 'owner'
    : broker.staff_role ? broker.staff_role
    : broker.is_admin ? 'admin' : 'customer'
  const n = ROLE_PHOTO[role] ?? 1
  return (
    <div
      className="ktc-app-backdrop"
      aria-hidden
      style={{ '--app-bg-photo': `url('/photos/${n}.jpg')` } as CSSProperties}
    />
  )
}

// Pre-auth / public paths where a (possibly transient) session must NOT be
// MFA-gated: the login flow, email-confirmation, password reset, the public
// agreement, and the public slip-verification QR target (/verify/:id).
const MFA_BYPASS = new Set([
  '/login', '/register', '/confirmed', '/forgot-password', '/reset-password',
  '/email-change-confirm', '/agreement', '/irr', '/terms', '/privacy',
])

// ONE gate for the WHOLE app. A logged-in session with an enrolled TOTP factor
// must pass the aal2 challenge before ANYTHING app-related renders — routes,
// first-run setup, notifications, overlays, tours, Lara, modals. Nothing leaks
// at aal1. (The connectivity banner is rendered OUTSIDE this gate so a network
// notice still shows during the challenge.) ProtectedRoute keeps its own aal
// read for the aal2-gated single-session claim; by the time any route mounts
// here the session is already aal2, so its MFA branch is now defense-in-depth.
function MfaGate({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const { pathname } = useLocation()
  const [aal, setAal] = useState<{ current: string; next: string } | null>(null)
  useEffect(() => {
    if (!session) { setAal(null); return }
    let active = true
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (active) setAal({ current: data?.currentLevel ?? 'aal1', next: data?.nextLevel ?? 'aal1' })
    })
    return () => { active = false }
  }, [session])

  // Logged-out, or on a public/pre-auth path → never gate (login + public flow).
  if (!session || MFA_BYPASS.has(pathname) || pathname.startsWith('/verify/')) return <>{children}</>
  // Session present but the level isn't known yet → hold so the app can't flash first.
  if (!aal) return <RouteLoader />
  // MFA enrolled but not yet satisfied → render ONLY the challenge, nothing else.
  if (aal.next === 'aal2' && aal.current !== 'aal2') {
    return <MfaChallenge onVerified={() => setAal({ current: 'aal2', next: 'aal2' })} />
  }
  return <>{children}</>
}

function NativeStaffOnlyGate({ children }: { children: ReactNode }) {
  const { t } = useT()
  const { session } = useAuth()
  const { broker, loading } = useBroker()
  const { pathname } = useLocation()
  if (!isNativeApp() || !session || APP_BG_PUBLIC.has(pathname) || pathname.startsWith('/verify/')) return <>{children}</>
  if (loading) return <RouteLoader />
  if (isStaff(broker)) return <>{children}</>
  return (
    <div className="ktc-page" style={{ display: 'grid', placeItems: 'center', minHeight: '100%', padding: 20 }}>
      <div className="ktc-glass" style={{ width: '100%', maxWidth: 420, padding: 22, display: 'grid', gap: 12, textAlign: 'center' }}>
        <img src="/ktc-logo.png" alt="KTC" style={{ height: 38, justifySelf: 'center' }} />
        <h1 className="ktc-title" style={{ fontSize: 22 }}>{t('Internal staff app')}</h1>
        <p className="ktc-label" style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
          {t('This installed app is for KTC staff yard devices. Customer accounts should use the web portal.')}
        </p>
        <button type="button" className="ktc-btn" onClick={() => void Browser.open({ url: PUBLIC_PORTAL_URL })}>
          {t('Open customer web portal')}
        </button>
      </div>
    </div>
  )
}

function SandboxBanner() {
  if (APP_TARGET !== 'sandbox') return null
  let ref = 'sandbox'
  try {
    ref = new URL(import.meta.env.VITE_SUPABASE_URL).host.split('.')[0] || ref
  } catch { /* keep fallback */ }
  return (
    <div
      aria-label="Sandbox database build"
      style={{
        position: 'fixed',
        left: 10,
        bottom: 10,
        zIndex: 2147483000,
        pointerEvents: 'none',
        padding: '5px 9px',
        borderRadius: 8,
        background: '#facc15',
        color: '#111827',
        border: '1px solid rgba(17,24,39,.25)',
        font: '700 11px/1.2 system-ui, sans-serif',
        letterSpacing: 0,
        boxShadow: '0 8px 20px rgba(15,23,42,.18)',
      }}
    >
      SANDBOX DB · {ref}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
    <I18nProvider>
      <BrowserRouter>
        <WalkthroughProvider>
        <TourProvider>
        <ServerBusyBanner />
        <SandboxBanner />
        <MfaGate>
        <NativeStaffOnlyGate>
        <FirstRunSetup />
        <SessionSupersededOverlay />
        <PublicBackdrop />
        <AppBackdrop />
        <Suspense fallback={<RouteLoader />}>
        <RouteFade>
        <Routes>
          {/* Shared public shell: the landing ("/"), sign-in ("/login"), and create-account
              ("/register") render the SAME card — top letterhead, left intro+services, and
              footer persist (rendered once in PublicShell); only the right column (the routed
              Outlet) swaps between the access buttons and the auth form. */}
          <Route element={<PublicShell />}>
            <Route path="/" element={<RootGate />} />
            <Route path="/login" element={<Login />} />
            {/* Walk-in QR target — opens Login straight in sign-up mode */}
            <Route path="/register" element={<Login />} />
          </Route>
          <Route path="/confirmed" element={<Confirmed />} />
          <Route path="/email-change-confirm" element={<EmailChangeConfirm />} />
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
          <Route path="/account" element={<Protected><Account /></Protected>} />
          <Route path="/verify-id" element={<Protected><VerifyId /></Protected>} />
          <Route path="/job-order" element={<Protected><JobOrder /></Protected>} />
          <Route path="/job-order/:id/print" element={<Protected><JobOrderPrint /></Protected>} />
          <Route path="/calculator" element={<Protected><Calculator /></Protected>} />
          <Route path="/vessels" element={<Protected><Vessels /></Protected>} />
          {/* /accreditation removed 2026-06-11 (page deleted; consignee accreditation
              disabled per ADR-0007) — old links fall through to the catch-all → / */}
          <Route path="/job-orders" element={<Protected><MyJobOrders /></Protected>} />
          <Route path="/support" element={<Protected><SupportTickets /></Protected>} />
          <Route path="/releases" element={<Protected><Releases /></Protected>} />
          <Route path="/requests" element={<Protected><MyRequests /></Protected>} />
          <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
          <Route path="/manual" element={<Protected><Manual /></Protected>} />

          {/* Installable staff app (focused, role-aware) */}
          <Route path="/app" element={<Admin><AppHome /></Admin>} />
          <Route path="/app/device" element={<Admin><NativeDevice /></Admin>} />
          <Route path="/app/checker" element={<Admin perm="confirm_xray"><AppChecker /></Admin>} />
          <Route path="/app/payment-orders" element={<Admin perm="review_payments"><PaymentOrderDesk app /></Admin>} />
          <Route path="/app/support" element={<Admin perm="manage_support"><SupportInbox app /></Admin>} />
          <Route path="/app/operations" element={<Admin perm={['accept_orders', 'process_job_orders', 'hold_reject_orders', 'assess_rps', 'complete_orders']}><AllJobOrders app /></Admin>} />

          {/* Admin portal */}
          {/* perm mirrors the AdminBottomNav GRID 1:1 (see AdminRoute). Routes left
              ungated are universal-to-staff: their own account, notifications, manual. */}
          <Route path="/admin" element={<Admin perm="manage_approvals"><Dashboard /></Admin>} />
          <Route path="/admin/account" element={<Admin><AccountStaff /></Admin>} />
          <Route path="/admin/approvals" element={<Admin perm="manage_approvals"><Approvals /></Admin>} />
          <Route path="/admin/customers" element={<Admin perm="manage_customers"><Brokers /></Admin>} />
          <Route path="/admin/customers/:id" element={<Admin perm="manage_customers"><CustomerDetail /></Admin>} />
          <Route path="/admin/consignees" element={<Admin perm={['manage_consignees', 'review_consignee_requests']}><Consignees /></Admin>} />
          <Route path="/admin/job-orders" element={<Admin perm="view_job_orders"><AllJobOrders /></Admin>} />
          <Route path="/admin/new-job-order" element={<Admin perm="file_job_orders"><AdminNewJobOrder /></Admin>} />
          <Route path="/admin/checker" element={<Admin perm="view_xray_queue"><Checker /></Admin>} />
          <Route path="/admin/payment-orders" element={<Admin perm="review_payments"><PaymentOrderDesk /></Admin>} />
          <Route path="/admin/charges" element={<Admin perm="complete_orders"><ChargeApproval /></Admin>} />
          <Route path="/admin/reconciliation" element={<Admin perm="manage_approvals"><Reconciliation /></Admin>} />
          <Route path="/admin/charge-audit" element={<Admin perm="review_payments"><ChargeAuditView /></Admin>} />
          <Route path="/admin/releases" element={<Admin perm={['verify_release_docs', 'review_payments']}><AdminReleases /></Admin>} />
          <Route path="/admin/vessel-schedule" element={<Admin perm="manage_vessel_schedule"><VesselSchedule /></Admin>} />
          <Route path="/admin/logs" element={<Admin perm="manage_approvals"><Logs /></Admin>} />
          <Route path="/admin/security" element={<Admin perm="manage_approvals"><Security /></Admin>} />
          <Route path="/admin/settings" element={<Admin perm="manage_pricing"><Settings /></Admin>} />
          <Route path="/admin/bulletin" element={<Admin perm="manage_pricing"><BulletinBoardAdmin /></Admin>} />
          <Route path="/admin/support" element={<Admin perm="manage_support"><SupportInbox /></Admin>} />
          <Route path="/admin/notifications" element={<Admin><AdminNotifications /></Admin>} />
          <Route path="/admin/manual" element={<Admin><AdminManual /></Admin>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </RouteFade>
        </Suspense>
        </NativeStaffOnlyGate>
        </MfaGate>
        </TourProvider>
        </WalkthroughProvider>
      </BrowserRouter>
    </I18nProvider>
    </AuthProvider>
  )
}
