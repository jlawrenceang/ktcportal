import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useBroker } from '../lib/useBroker'
import { useT } from '../lib/i18n'
import { useTour } from './TourProvider'
import LangToggle from './LangToggle'
import ThemeToggle from './ThemeToggle'
import { GearIcon, GlobeIcon, MoonIcon, SignOutIcon, UserIcon } from './icons'

const iconWrap = { width: 20, display: 'inline-flex', justifyContent: 'center', flex: '0 0 auto', color: 'hsl(var(--ink-2))' } as const

// Soft, visionOS-tasteful tint per staff role so the badge reads at a glance
// without shouting. Owner keeps the brand accent; the rest get muted gradients
// (white text stays legible on each). Unknown roles fall back to the accent.
const ACCENT_BG = 'linear-gradient(135deg, var(--acc), var(--acc-2))'
const ROLE_BG: Record<string, string> = {
  Owner: ACCENT_BG,
  Admin: 'linear-gradient(135deg, #6e74e8, #5057d4)',      // indigo
  Cashier: 'linear-gradient(135deg, #3fae6b, #2e9457)',    // green
  Checker: 'linear-gradient(135deg, #3fa9d6, #2e8ec0)',    // blue
  Operations: 'linear-gradient(135deg, #d9942f, #be7d1c)', // amber
  CSR: 'linear-gradient(135deg, #2fb3a6, #1f9488)',        // teal
  Customer: 'linear-gradient(135deg, #5b6b86, #43506b)',   // slate
}

// Gmail-style account menu for the top rail: a round avatar (initials) that opens
// a dropdown with the signed-in identity, Settings, the quick tour, language +
// dark-mode toggles (mirroring the ⊞ Menu), and Sign out. Shared by the customer
// Shell and the AdminShell (each passes its own settings route).
function initials(name?: string | null, email?: string | null): string {
  const src = (name || email || '').trim()
  if (!src) return '?'
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

export default function AccountMenu({ settingsTo, settingsLabel, accountTo, accountLabel, role }: { settingsTo?: string; settingsLabel?: string; accountTo?: string; accountLabel?: string; role?: string }) {
  const { t } = useT()
  const { broker } = useBroker()
  const { signOut } = useAuth()
  const { replayPageTour, hasPageTour } = useTour()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  // Close on outside click / Escape (mirrors the notification bell).
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  async function handleSignOut() {
    setOpen(false)
    await signOut()
    navigate('/login', { replace: true })
  }
  function go(to: string) { setOpen(false); navigate(to) }

  const name = broker?.full_name || broker?.email || t('Account')
  const email = broker?.email || ''
  const ini = initials(broker?.full_name, broker?.email)
  // Tint the avatar with the role color too, so the role reads at a glance from
  // the rail without opening the menu (customers have no role → brand accent).
  const avatarBg = (role && ROLE_BG[role]) || ACCENT_BG

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', flex: '0 0 auto' }}>
      <button
        type="button"
        aria-label={t('Account menu')}
        aria-expanded={open}
        title={name}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 34, height: 34, borderRadius: 999, border: '1px solid var(--glass-brd)', cursor: 'pointer', padding: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 12.5, background: avatarBg,
        }}
      >
        {ini}
      </button>

      {open && (
        <div
          className="ktc-glass"
          role="menu"
          aria-label={t('Account')}
          style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, minWidth: 248, maxWidth: '92vw', padding: 6, borderRadius: 14, zIndex: 60, background: 'var(--c-solid)', boxShadow: '0 14px 44px rgba(0,0,0,.18)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px 12px' }}>
            <span aria-hidden style={{ width: 40, height: 40, borderRadius: 999, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 15, background: avatarBg }}>{ini}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              {email && <span className="ktc-label" style={{ display: 'block', fontSize: 11.5, opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>}
              {role && (
                <span style={{
                  display: 'inline-block', marginTop: 5, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999, color: '#fff',
                  background: ROLE_BG[role] ?? ACCENT_BG,
                }}>{t(role)}</span>
              )}
            </span>
          </div>
          <div style={{ height: 1, background: 'var(--glass-brd)', margin: '2px 4px 4px' }} />
          {accountTo && (
            <button type="button" role="menuitem" className="ktc-menu-setting" onClick={() => go(accountTo)}>
              <span aria-hidden style={iconWrap}><UserIcon size={17} /></span>
              <span style={{ flex: 1 }}>{t(accountLabel ?? 'My Account')}</span>
            </button>
          )}
          {settingsTo && (
            <button type="button" role="menuitem" className="ktc-menu-setting" onClick={() => go(settingsTo)}>
              <span aria-hidden style={iconWrap}><GearIcon size={17} /></span>
              <span style={{ flex: 1 }}>{t(settingsLabel ?? 'Settings')}</span>
            </button>
          )}
          {hasPageTour && (
            <button type="button" role="menuitem" className="ktc-menu-setting" onClick={() => { setOpen(false); replayPageTour() }}>
              <span aria-hidden className="ktc-nav-help-q">?</span>
              <span style={{ flex: 1 }}>{t('Quick tour')}</span>
            </button>
          )}
          <div className="ktc-menu-setting" role="menuitem">
            <span aria-hidden style={iconWrap}><GlobeIcon size={17} /></span>
            <span style={{ flex: 1 }}>{t('Language')}</span>
            <LangToggle />
          </div>
          <div className="ktc-menu-setting" role="menuitem">
            <span aria-hidden style={iconWrap}><MoonIcon size={17} /></span>
            <span style={{ flex: 1 }}>{t('Dark mode')}</span>
            <ThemeToggle />
          </div>
          <div style={{ height: 1, background: 'var(--glass-brd)', margin: '4px 4px' }} />
          <button type="button" role="menuitem" className="ktc-menu-setting" onClick={() => void handleSignOut()}>
            <span aria-hidden style={iconWrap}><SignOutIcon size={17} /></span>
            <span style={{ flex: 1 }}>{t('Sign out')}</span>
          </button>
        </div>
      )}
    </span>
  )
}
