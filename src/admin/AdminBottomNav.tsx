import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useAuth } from '../lib/AuthContext'
import { usePermissions, type Permission } from '../lib/usePermissions'
import { useTour } from '../components/TourProvider'
import { useT } from '../lib/i18n'
import LangToggle from '../components/LangToggle'
import ThemeToggle from '../components/ThemeToggle'

// Admin bottom tab bar — the SAME pattern as the customer BottomNav (floating
// bar on all widths + ⊞ Menu grid popup), so the staff portal matches the
// customer portal. Tabs + grid are gated by the owner-tweakable role
// permissions; the ⊞ Menu holds every destination the role can reach so nothing
// is lost when a tab doesn't fit the 5-icon bar.
const ip = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const HomeIcon = () => (<svg {...ip}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-6h6v6" /></svg>)
const GridIcon = () => (<svg {...ip}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>)
const OrdersIcon = () => (<svg {...ip}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>)
const ApprovalsIcon = () => (<svg {...ip}><path d="M16 11l2 2 4-4" /><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>)
const VesselIcon = () => (<svg {...ip}><path d="M3 18a3 3 0 0 0 2.5 1.5h13A3 3 0 0 0 21 18l-2-6H5l-2 6Z" /><path d="M12 12V4M8 8h8M12 4h.01" /></svg>)
const CheckerIcon = () => (<svg {...ip}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>)
const MenuIcon = GridIcon
const NewIcon = () => (<svg {...ip}><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /><path d="M12 11v6M9 14h6" /></svg>)
const UsersIcon = () => (<svg {...ip}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>)
const BuildingIcon = () => (<svg {...ip}><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" /></svg>)
const GearIcon = () => (<svg {...ip}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 14a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>)
const LogsIcon = () => (<svg {...ip}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>)
const ShieldIcon = () => (<svg {...ip}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>)
const CashIcon = () => (<svg {...ip}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></svg>)
const ManualIcon = () => (<svg {...ip}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>)
const SupportIcon = () => (<svg {...ip}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>)
const DashIcon = GridIcon

type Dest = { to: string; label: string; perm?: Permission; icon: ReactNode; end?: boolean }

// Everything a role can reach — the ⊞ Menu grid. Order = the admin's mental map.
const GRID: Dest[] = [
  { to: '/admin', label: 'Dashboard', perm: 'manage_approvals', icon: <DashIcon />, end: true },
  { to: '/admin/job-orders', label: 'Job Orders', perm: 'view_job_orders', icon: <OrdersIcon /> },
  { to: '/admin/new-job-order', label: 'New JO', perm: 'file_job_orders', icon: <NewIcon /> },
  { to: '/admin/checker', label: 'X-ray Checker', perm: 'confirm_xray', icon: <CheckerIcon /> },
  { to: '/admin/cashier', label: 'Cashier', perm: 'review_payments', icon: <CashIcon /> },
  { to: '/admin/approvals', label: 'Approvals', perm: 'manage_approvals', icon: <ApprovalsIcon /> },
  { to: '/admin/customers', label: 'Customers', perm: 'manage_customers', icon: <UsersIcon /> },
  { to: '/admin/consignees', label: 'Consignees', perm: 'manage_consignees', icon: <BuildingIcon /> },
  { to: '/admin/vessel-schedule', label: 'Vessels', perm: 'manage_vessel_schedule', icon: <VesselIcon /> },
  { to: '/admin/settings', label: 'Settings', perm: 'manage_pricing', icon: <GearIcon /> },
  { to: '/admin/logs', label: 'Logs', perm: 'manage_approvals', icon: <LogsIcon /> },
  { to: '/admin/support', label: 'Support', perm: 'manage_support', icon: <SupportIcon /> },
  { to: '/admin/security', label: '2FA', perm: 'manage_approvals', icon: <ShieldIcon /> },
  { to: '/admin/manual', label: 'Manual', icon: <ManualIcon /> },
]

export default function AdminBottomNav() {
  const { t } = useT()
  const { signOut } = useAuth()
  const { can, broker } = usePermissions()
  const navigate = useNavigate()
  const { replayPageTour, hasPageTour } = useTour()
  const [open, setOpen] = useState(false)

  const home = broker?.staff_role === 'checker' ? '/admin/checker'
    : broker?.staff_role === 'operations' ? '/admin/job-orders'
    : broker?.staff_role === 'cashier' ? '/admin/cashier'
    : broker?.staff_role === 'csr' ? '/admin/support'
    : '/admin'

  // Primary tabs: Home + up to 3 of the most-used destinations the role can
  // reach (deduped against Home), then ⊞ Menu. Everything else lives in Menu.
  const candidates: Dest[] = [
    { to: '/admin/job-orders', label: 'Orders', perm: 'view_job_orders', icon: <OrdersIcon /> },
    { to: '/admin/support', label: 'Support', perm: 'manage_support', icon: <SupportIcon /> },
    { to: '/admin/cashier', label: 'Cashier', perm: 'review_payments', icon: <CashIcon /> },
    { to: '/admin/approvals', label: 'Approvals', perm: 'manage_approvals', icon: <ApprovalsIcon /> },
    { to: '/admin/vessel-schedule', label: 'Vessels', perm: 'manage_vessel_schedule', icon: <VesselIcon /> },
    { to: '/admin/checker', label: 'Checker', perm: 'confirm_xray', icon: <CheckerIcon /> },
  ]
  const tabs: Dest[] = [{ to: home, label: 'Home', icon: <HomeIcon />, end: true }]
  const seen = new Set([home])
  for (const c of candidates) {
    if (tabs.length >= 4) break
    if (seen.has(c.to)) continue
    if (c.perm && !can(c.perm)) continue
    seen.add(c.to); tabs.push(c)
  }

  const grid = GRID.filter((g) => !g.perm || can(g.perm))

  async function handleSignOut() {
    setOpen(false)
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <>
      {createPortal(
        <nav className="ktc-tabbar" aria-label={t('Sections')}>
          {tabs.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.end}
              className={({ isActive }) => `ktc-tab${isActive ? ' is-active' : ''}`}>
              <span className="ktc-tab-icon">{tab.icon}</span>
              <span className="ktc-tab-label">{t(tab.label)}</span>
            </NavLink>
          ))}
          <button type="button" className={`ktc-tab${open ? ' is-active' : ''}`}
            aria-expanded={open} aria-label={t('Menu')} onClick={() => setOpen(true)}>
            <span className="ktc-tab-icon"><MenuIcon /></span>
            <span className="ktc-tab-label">{t('Menu')}</span>
          </button>
        </nav>,
        document.body,
      )}

      {open && createPortal(
        <div className="ktc-menusheet-backdrop" onClick={() => setOpen(false)}>
          <div className="ktc-menusheet" role="dialog" aria-label={t('Menu')} onClick={(e) => e.stopPropagation()}>
            <div className="ktc-menusheet-head">
              <span style={{ fontSize: 14, fontWeight: 700 }}>{t('All sections')}</span>
              <button type="button" aria-label={t('Close')} onClick={() => setOpen(false)}
                style={{ fontSize: 20, lineHeight: 1, border: 0, background: 'none', cursor: 'pointer', color: 'hsl(var(--ink-2))' }}>✕</button>
            </div>
            <div className="ktc-menu-grid">
              {grid.map((g) => (
                <NavLink key={g.to} to={g.to} end={g.end} onClick={() => setOpen(false)}
                  className="ktc-menu-tile">
                  <span className="ktc-menu-tile-icon">{g.icon}</span>
                  <span className="ktc-menu-tile-label">{t(g.label)}</span>
                </NavLink>
              ))}
            </div>
            <div className="ktc-menusheet-foot">
              <span className="ktc-drawer-label" style={{ padding: '0 0 8px 2px' }}>{t('Settings')}</span>
              {hasPageTour && (
                <button type="button" className="ktc-menu-setting" onClick={() => { setOpen(false); replayPageTour() }}>
                  <span className="ktc-nav-help-q" aria-hidden>?</span>
                  <span style={{ flex: 1 }}>{t('Quick tour')}</span>
                </button>
              )}
              <div className="ktc-menu-setting">
                <span style={{ flex: 1 }}>{t('Language')}</span>
                <LangToggle />
              </div>
              <div className="ktc-menu-setting">
                <span style={{ flex: 1 }}>{t('Dark mode')}</span>
                <ThemeToggle />
              </div>
              <button type="button" className="ktc-menu-setting" onClick={() => void handleSignOut()}>
                <span style={{ flex: 1 }}>{t('Sign out')}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
