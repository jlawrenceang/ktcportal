import { useEffect, useState, type MouseEvent } from 'react'
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useTour } from './TourProvider'
import { useT } from '../lib/i18n'
import LangToggle from './LangToggle'
import ThemeToggle from './ThemeToggle'
import InstallButton from './InstallButton'
import PushToggle from './PushToggle'
import { WatchWalkthroughButton, PlayIcon } from './Walkthrough'

// Persistent bottom tab bar — the single navigation on ALL widths (a centered
// floating bar on desktop too). 5 icons: Home · Orders · Vessels · Rates · ⊞ Menu.
//   * Orders opens a small popup (New Order / My Orders).
//   * ⊞ Menu opens a phone-style grid popup with everything else (My Account,
//     Manual) + language/theme/sign out — it replaces the old hamburger drawer.
const ip = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const HomeIcon = () => (<svg {...ip}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9 21v-6h6v6" /></svg>)
const NewIcon = () => (<svg {...ip}><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /><path d="M12 11v6M9 14h6" /></svg>)
const OrdersIcon = () => (<svg {...ip}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>)
const AccountIcon = () => (<svg {...ip}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>)
const MenuIcon = () => (<svg {...ip}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>)
const VesselIcon = () => (<svg {...ip}><path d="M3 18a3 3 0 0 0 2.5 1.5h13A3 3 0 0 0 21 18l-2-6H5l-2 6Z" /><path d="M12 12V4M8 8h8M12 4h.01" /></svg>)
const CalcIcon = () => (<svg {...ip}><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></svg>)
const ManualIcon = () => (<svg {...ip}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>)
const SupportIcon = () => (<svg {...ip}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>)
const ReleaseIcon = () => (<svg {...ip}><rect x="2" y="7" width="13" height="11" rx="1" /><path d="M15 11h4l3 3v4h-7" /><path d="M6 18.5a1.5 1.5 0 0 0 3 0M16 18.5a1.5 1.5 0 0 0 3 0" /></svg>)

const ORDER_LINKS = [
  { to: '/job-order', label: 'New Order', icon: <NewIcon /> },
  { to: '/job-orders', label: 'My Orders', icon: <OrdersIcon /> },
]
const GRID = [
  { to: '/job-order', label: 'New Job Order', icon: <NewIcon /> },
  { to: '/job-orders', label: 'My Job Orders', icon: <OrdersIcon /> },
  { to: '/releases', label: 'Release / Pull-out', icon: <ReleaseIcon /> },
  { to: '/vessels', label: 'Vessel Schedule', icon: <VesselIcon /> },
  { to: '/calculator', label: 'Rate Calculator', icon: <CalcIcon /> },
  { to: '/account', label: 'My Account', icon: <AccountIcon /> },
  { to: '/manual', label: 'User Manual', icon: <ManualIcon /> },
  { to: '/support', label: 'Help & Support', icon: <SupportIcon /> },
]

export default function BottomNav({
  pendingMode = false,
  onPendingBlocked,
}: {
  pendingMode?: boolean
  onPendingBlocked?: (kind: 'feature' | 'support' | 'tour') => void
}) {
  const { t } = useT()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const loc = useLocation()
  const { replayPageTour, hasPageTour } = useTour()
  const [sheet, setSheet] = useState<null | 'orders' | 'menu'>(null)
  const [attention, setAttention] = useState(0)

  const ordersActive = loc.pathname.startsWith('/job-order') // /job-order, /job-orders, detail routes
  const restricted = new Set(['/job-order', '/job-orders', '/releases', '/vessels', '/calculator', '/support'])
  function blockPending(kind: 'feature' | 'support' | 'tour' = 'feature') {
    setSheet(null)
    onPendingBlocked?.(kind)
  }
  function pendingLinkClick(e: MouseEvent, to: string) {
    if (!pendingMode || !restricted.has(to)) return
    e.preventDefault()
    blockPending(to === '/support' ? 'support' : 'feature')
  }

  // Orders needing the customer's action (on hold / a rejected charge proof) → a
  // badge on the Orders tab. Server-side via the RPC (spans job_orders → charges
  // post-cutover). Refetched on navigation so it stays fresh.
  useEffect(() => {
    if (pendingMode) { setAttention(0); return }
    void supabase.rpc('my_attention_count').then(({ data }) => setAttention((data as number) ?? 0))
  }, [loc.pathname, pendingMode])

  async function handleSignOut() {
    setSheet(null)
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <>
      {/* Portaled to <body> so `position: fixed` is relative to the viewport and
          can't be trapped by an ancestor's transform/filter/backdrop-filter —
          that's what made the bar scroll away instead of staying stuck. */}
      {createPortal(
        <nav className="ktc-tabbar" aria-label={t('Sections')}>
        <NavLink to="/" end data-tour="tab-home" className={({ isActive }) => `ktc-tab${isActive ? ' is-active' : ''}`}>
          <span className="ktc-tab-icon"><HomeIcon /></span>
          <span className="ktc-tab-label">{t('Home')}</span>
        </NavLink>
        <button type="button" className={`ktc-tab${ordersActive || sheet === 'orders' ? ' is-active' : ''}`}
          data-tour="tab-orders" aria-expanded={sheet === 'orders'} onClick={() => pendingMode ? blockPending('feature') : setSheet(sheet === 'orders' ? null : 'orders')}>
          <span className="ktc-tab-icon">
            <OrdersIcon />
            {attention > 0 && <span aria-hidden className="ktc-tab-badge">{attention > 9 ? '9+' : attention}</span>}
          </span>
          <span className="ktc-tab-label">{t('Orders')}</span>
        </button>
        <NavLink to="/vessels" data-tour="tab-vessels" onClick={(e) => pendingLinkClick(e, '/vessels')} className={({ isActive }) => `ktc-tab${isActive ? ' is-active' : ''}`}>
          <span className="ktc-tab-icon"><VesselIcon /></span>
          <span className="ktc-tab-label">{t('Vessels')}</span>
        </NavLink>
        <NavLink to="/calculator" data-tour="tab-rates" onClick={(e) => pendingLinkClick(e, '/calculator')} className={({ isActive }) => `ktc-tab${isActive ? ' is-active' : ''}`}>
          <span className="ktc-tab-icon"><CalcIcon /></span>
          <span className="ktc-tab-label">{t('Rates')}</span>
        </NavLink>
        <button type="button" className={`ktc-tab${sheet === 'menu' ? ' is-active' : ''}`}
          data-tour="tab-menu" aria-expanded={sheet === 'menu'} aria-label={t('Menu')} onClick={() => setSheet('menu')}>
          <span className="ktc-tab-icon"><MenuIcon /></span>
          <span className="ktc-tab-label">{t('Menu')}</span>
        </button>
        </nav>,
        document.body,
      )}

      {sheet === 'orders' && createPortal(
        <div className="ktc-menusheet-backdrop" onClick={() => setSheet(null)}>
          <div className="ktc-menusheet" role="dialog" aria-label={t('Job Orders')} onClick={(e) => e.stopPropagation()}>
            <div className="ktc-menusheet-head">
              <span style={{ fontSize: 14, fontWeight: 700 }}>{t('Job Orders')}</span>
              <button type="button" aria-label={t('Close')} onClick={() => setSheet(null)}
                style={{ fontSize: 20, lineHeight: 1, border: 0, background: 'none', cursor: 'pointer', color: 'hsl(var(--ink-2))' }}>✕</button>
            </div>
            <div className="ktc-menu-grid ktc-menu-grid--orders" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {ORDER_LINKS.map((g) => (
                <Link key={g.to} to={g.to} className="ktc-menu-tile" onClick={(e) => { if (pendingMode) { e.preventDefault(); blockPending('feature') } else setSheet(null) }}>
                  <span className="ktc-menu-tile-icon">{g.icon}</span>
                  <span className="ktc-menu-tile-label">{t(g.label)}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {sheet === 'menu' && createPortal(
        <div className="ktc-menusheet-backdrop" onClick={() => setSheet(null)}>
          <div className="ktc-menusheet" role="dialog" aria-label={t('Menu')} onClick={(e) => e.stopPropagation()}>
            <div className="ktc-menusheet-head">
              <span style={{ fontSize: 14, fontWeight: 700 }}>{t('Explore the app')}</span>
              <button type="button" aria-label={t('Close')} onClick={() => setSheet(null)}
                style={{ fontSize: 20, lineHeight: 1, border: 0, background: 'none', cursor: 'pointer', color: 'hsl(var(--ink-2))' }}>✕</button>
            </div>
            <div className="ktc-menu-grid">
              {GRID.map((g) => (
                <Link key={g.to + g.label} to={g.to} className="ktc-menu-tile" onClick={(e) => { if (pendingMode && restricted.has(g.to)) { e.preventDefault(); blockPending(g.to === '/support' ? 'support' : 'feature') } else setSheet(null) }}>
                  <span className="ktc-menu-tile-icon">{g.icon}</span>
                  <span className="ktc-menu-tile-label">{t(g.label)}</span>
                </Link>
              ))}
            </div>
            <div className="ktc-menusheet-foot">
              <span className="ktc-drawer-label" style={{ padding: '0 0 8px 2px' }}>{t('Settings')}</span>
              {hasPageTour && (
                <button type="button" className="ktc-menu-setting" onClick={() => { setSheet(null); pendingMode ? blockPending('tour') : replayPageTour() }}>
                  <span className="ktc-nav-help-q" aria-hidden>?</span>
                  <span style={{ flex: 1 }}>{t('Quick tour')}</span>
                </button>
              )}
              <WatchWalkthroughButton className="ktc-menu-setting" onClick={() => setSheet(null)}>
                <span style={{ flex: 1, textAlign: 'left', display: 'inline-flex', alignItems: 'center', gap: 8 }}><PlayIcon size={16} /> {t('Watch walkthrough')}</span>
              </WatchWalkthroughButton>
              <div className="ktc-menu-setting">
                <span style={{ flex: 1 }}>{t('Language')}</span>
                <LangToggle />
              </div>
              <div className="ktc-menu-setting">
                <span style={{ flex: 1 }}>{t('Dark mode')}</span>
                <ThemeToggle />
              </div>
              <PushToggle variant="menu" />
              <InstallButton />
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
