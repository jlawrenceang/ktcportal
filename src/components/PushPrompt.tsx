import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { pushSupported, isPushOn, enablePush } from '../lib/push'
import { useT } from '../lib/i18n'

// Soft "turn on phone alerts?" popup shown shortly after login. The actual
// browser permission prompt only fires on the explicit "Turn on" tap (a user
// gesture, as browsers require). Shows at most once per session and never again
// once the user enables it or taps "Not now". Always re-enableable from the
// ⊞ Menu → 🔔 Phone alerts.
const KEY = 'ktc_push_prompt' // localStorage: 'enabled' | 'dismissed'
const SEEN = 'ktc_push_prompt_seen' // sessionStorage: shown this session

export default function PushPrompt() {
  const { t } = useT()
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
      if (sessionStorage.getItem(SEEN)) return
      sessionStorage.setItem(SEEN, '1')
      // Small delay so it doesn't slam in during the post-login transition.
      setTimeout(() => { if (!cancelled) setOpen(true) }, 1200)
    })()
    return () => { cancelled = true }
  }, [])

  if (!open) return null

  async function turnOn() {
    setBusy(true); setErr(null)
    try {
      const r = await enablePush()
      if (r.ok) { localStorage.setItem(KEY, 'enabled'); setOpen(false) }
      else setErr(r.error ?? t('Could not enable alerts.'))
    } finally {
      setBusy(false)
    }
  }
  function notNow() {
    localStorage.setItem(KEY, 'dismissed') // don't auto-ask again
    setOpen(false)
  }

  return createPortal(
    <div className="ktc-modal-backdrop" onClick={() => setOpen(false)}>
      <div className="ktc-glass ktc-modal-panel" role="dialog" aria-modal="true" aria-label={t('Turn on phone alerts?')}
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 380, padding: 22, textAlign: 'center' }}>
        <div style={{ fontSize: 34, lineHeight: 1 }} aria-hidden>🔔</div>
        <h2 style={{ margin: '10px 0 4px', fontSize: 18, fontWeight: 700 }}>{t('Turn on phone alerts?')}</h2>
        <p className="ktc-label" style={{ fontSize: 13.5, lineHeight: 1.6, margin: '0 0 16px' }}>
          {t('Get notified on this device when there’s an update — replies, approvals, payments and job-order activity.')}
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
