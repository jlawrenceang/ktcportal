import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { pushSupported, isPushOn, enablePush } from '../lib/push'
import { useT } from '../lib/i18n'
import { useAuth } from '../lib/AuthContext'

// Soft "turn on notifications?" popup shown right after the first-run language
// choice (so it's a clean yes/no, one screen after the language gate). The actual
// browser permission prompt only fires on the explicit "Turn on" tap (a user
// gesture, as browsers require). Auto-shows at most ONCE PER ACCOUNT — the flags
// are keyed by user id so every account that signs in is asked once (matters on
// shared / kiosk devices) but is never re-nagged after. Re-enableable any time
// from the 🔔 bell.
const keyFor = (uid: string | null) => (uid ? `ktc_push_prompt_${uid}` : 'ktc_push_prompt') // 'enabled' | 'dismissed'
const seenFor = (uid: string | null) => (uid ? `ktc_push_prompt_seen_${uid}` : 'ktc_push_prompt_seen')

export default function PushPrompt() {
  const { t, langChosen } = useT()
  const { session } = useAuth()
  const uid = session?.user?.id ?? null
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)

  // When shown: move focus into the dialog and close on Escape.
  useEffect(() => {
    if (!open) return
    primaryRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    // Wait for the signed-in account AND its first-run language choice, so the
    // order is: language gate → this notification prompt (no overlap), in the
    // chosen language. Keyed per account so each user is asked once.
    if (!uid || !langChosen) return
    const KEY = keyFor(uid)
    const SEEN = seenFor(uid)
    if (!pushSupported()) return
    if (localStorage.getItem(KEY)) return
    if (Notification.permission === 'denied') return
    let cancelled = false
    void (async () => {
      // Already subscribed on this browser — nothing to ask.
      if (await isPushOn()) { localStorage.setItem(KEY, 'enabled'); return }
      // Permission already granted but no subscription yet — subscribe quietly.
      if (Notification.permission === 'granted') {
        const r = await enablePush()
        if (r.ok) localStorage.setItem(KEY, 'enabled')
        return
      }
      // Fires at most once per account — never re-nags on later logins.
      if (localStorage.getItem(SEEN)) return
      // Mark "seen" only when the popup ACTUALLY opens. Setting it before the
      // delay meant an unmount / navigation within the 1.2s would burn the flag
      // and the prompt would then never appear again.
      setTimeout(() => {
        if (cancelled) return
        localStorage.setItem(SEEN, '1')
        setOpen(true)
      }, 1200)
    })()
    return () => { cancelled = true }
  }, [langChosen, uid])

  if (!open) return null

  async function turnOn() {
    setBusy(true); setErr(null)
    try {
      const r = await enablePush()
      if (r.ok) { localStorage.setItem(keyFor(uid), 'enabled'); setOpen(false) }
      else setErr(r.error ?? t('Could not enable alerts.'))
    } finally {
      setBusy(false)
    }
  }
  function notNow() {
    localStorage.setItem(keyFor(uid), 'dismissed') // don't auto-ask this account again
    setOpen(false)
  }

  return createPortal(
    <div className="ktc-modal-backdrop" onClick={() => setOpen(false)}>
      <div className="ktc-glass ktc-modal-panel" role="dialog" aria-modal="true" aria-label={t('Turn on notifications?')}
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 380, padding: 22, textAlign: 'center' }}>
        <div style={{ fontSize: 34, lineHeight: 1 }} aria-hidden>🔔</div>
        <h2 style={{ margin: '10px 0 4px', fontSize: 18, fontWeight: 700 }}>{t('Turn on notifications?')}</h2>
        <p className="ktc-label" style={{ fontSize: 13.5, lineHeight: 1.6, margin: '0 0 8px' }}>
          {t('Get notified on this device when there’s an update — replies, approvals, payments and job-order activity.')}
        </p>
        <p className="ktc-label" style={{ fontSize: 12, lineHeight: 1.5, opacity: 0.75, margin: '0 0 16px' }}>
          {t('No pressure — you can turn notifications on or off anytime from the 🔔 bell or in Settings.')}
        </p>
        {err && <p style={{ color: 'var(--acc-2)', fontSize: 12.5, margin: '0 0 10px' }}>{err}</p>}
        <div style={{ display: 'grid', gap: 8 }}>
          <button ref={primaryRef} type="button" className="ktc-btn" disabled={busy} onClick={() => void turnOn()}>
            {busy ? t('…') : t('Turn on alerts')}
          </button>
          <button type="button" className="ktc-btn-secondary" onClick={notNow}>{t('Not now')}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
