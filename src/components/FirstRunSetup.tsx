import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useT, type Lang } from '../lib/i18n'
import { pushSupported, isPushOn, enablePush } from '../lib/push'
import { GlobeIcon, BellIcon } from './icons'

// Public / auth-flow routes where setup must NOT appear — most importantly
// /confirmed, where the email-confirmation link establishes a transient session
// before the user actually signs in. Setup belongs on the portal, after a real
// login.
const PRE_AUTH_PATHS = new Set([
  '/login', '/confirmed', '/forgot-password', '/reset-password',
  '/agreement', '/irr', '/terms', '/privacy',
])

// One-time, first-run SETUP — shown once per account, right after sign-in and
// BEFORE the portal/tour. It folds the two device choices into a single step:
//   1. language (EN / FIL — live-previews the rest of the modal on tap)
//   2. notifications opt-in for THIS device
// Picking a language alone does NOT dismiss it; only "Continue" does, which
// commits the language and sets the per-account ktc_setup_done flag. The demo
// tour is gated on setupDone, so it runs AFTER setup — separate and skippable.
// Keyed per account (like the language flag) so shared / kiosk devices ask each
// account once. Re-enable notifications anytime from the 🔔 bell or Settings.
export default function FirstRunSetup() {
  const { session } = useAuth()
  const { t, lang, setLang, setupDone, completeSetup } = useT()
  const { pathname } = useLocation()

  const [supported] = useState(pushSupported())
  const [pushOn, setPushOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false) // session-local dismiss — survives a failed localStorage write

  // Reflect an already-subscribed device as "On"; if permission was already
  // granted on this device but there's no subscription yet, re-subscribe quietly
  // (preserves the old PushPrompt's silent-resubscribe path).
  useEffect(() => {
    if (!supported || !session) return // push state is per-account — never touch it logged out
    let cancelled = false
    void (async () => {
      if (await isPushOn()) { if (!cancelled) setPushOn(true); return }
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const r = await enablePush()
        if (!cancelled && r.ok) setPushOn(true)
      }
    })()
    return () => { cancelled = true }
  }, [supported, session])

  if (!session || setupDone || done || PRE_AUTH_PATHS.has(pathname)) return null

  const langs: { value: Lang; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'tl', label: 'Filipino (Tagalog)' },
  ]

  async function turnOnAlerts() {
    setBusy(true); setErr(null)
    try {
      const r = await enablePush()
      if (r.ok) setPushOn(true)
      else setErr(r.error ?? t('Could not enable alerts.'))
    } finally {
      setBusy(false)
    }
  }

  function finish() {
    setDone(true)   // dismiss for THIS session even if the completeSetup write below fails
    setLang(lang)   // commit the current/default language (also sets langChosen)
    completeSetup() // persist setupDone + unlock the tour
  }

  return (
    <div className="ktc-modal-backdrop" style={{ zIndex: 80 }}>
      <div className="ktc-glass ktc-modal-panel" style={{ maxWidth: 400, width: '100%', padding: '28px 26px' }}>
        <img src="/ktc-logo.png" alt="KTC Container Terminal Corp" style={{ height: 46, margin: '0 auto 14px', display: 'block' }} />
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', textAlign: 'center' }}>{t('Quick setup')}</h2>
        <p className="ktc-label" style={{ margin: '6px 0 0', fontSize: 13.5, textAlign: 'center', lineHeight: 1.5 }}>
          {t('Pick your language, then choose if you want alerts on this device.')}
        </p>

        {/* 1 — Language. Tapping switches the rest of the modal instantly. */}
        <div style={{ marginTop: 20 }}>
          <div className="ktc-label" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <GlobeIcon size={14} /> {t('Language')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {langs.map((o) => {
              const active = lang === o.value
              return (
                <button key={o.value} type="button" onClick={() => setLang(o.value)} aria-pressed={active}
                  className={active ? 'ktc-btn' : 'ktc-btn-secondary'} style={{ fontSize: 13.5 }}>
                  {o.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* 2 — Notifications (only where Web Push exists). The explicit tap is the
            user gesture browsers require for the permission prompt. */}
        {supported && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--glass-brd)' }}>
            <div className="ktc-label" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <BellIcon size={14} /> {t('Notifications')}
            </div>
            <p className="ktc-label" style={{ fontSize: 13, lineHeight: 1.55, margin: '0 0 10px' }}>
              {t('Get notified on this device when there’s an update — replies, approvals, payments and job-order activity.')}
            </p>
            {err && <p style={{ color: 'var(--acc-2)', fontSize: 12.5, margin: '0 0 8px' }}>{err}</p>}
            {pushOn ? (
              <span className="ktc-chip ktc-chip--success" style={{ fontSize: 12 }}>{t('On')}</span>
            ) : (
              <button type="button" className="ktc-btn-secondary" disabled={busy} onClick={() => void turnOnAlerts()} style={{ width: '100%' }}>
                {busy ? t('…') : t('Turn on alerts')}
              </button>
            )}
          </div>
        )}

        {/* Finish — independent of the choices above; the tour follows this. */}
        <button type="button" className="ktc-btn" onClick={finish} style={{ width: '100%', marginTop: 18 }}>
          {t('Continue to portal')}
        </button>
        <p className="ktc-label" style={{ margin: '12px 0 0', fontSize: 11.5, opacity: 0.72, textAlign: 'center', lineHeight: 1.5 }}>
          {t('You can change these anytime — language from the menu, notifications from the 🔔 bell.')}
        </p>
      </div>
    </div>
  )
}
