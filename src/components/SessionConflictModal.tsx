import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { useT } from '../lib/i18n'

// Shown by ProtectedRoute when a fresh login finds this account already
// signed in on another device. The user chooses: Terminate the other session
// and continue here, or Cancel (abandon this login, leave the other alone).
// Terminate is always available, so this is a confirmation — not a lockout.
export default function SessionConflictModal() {
  const { t } = useT()
  const { terminateOtherSession, cancelSessionClaim } = useAuth()
  const [busy, setBusy] = useState<'terminate' | 'cancel' | null>(null)

  async function terminate() {
    if (busy) return
    setBusy('terminate')
    await terminateOtherSession()
    // On success ProtectedRoute renders the portal; no need to reset busy.
  }
  async function cancel() {
    if (busy) return
    setBusy('cancel')
    await cancelSessionClaim()
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
      <div className="ktc-glass" style={{ padding: 32, maxWidth: 440, width: '100%' }}>
        <div style={{ fontSize: 30, marginBottom: 6 }} aria-hidden>🔐</div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 650 }}>
          {t('Already signed in on another device')}
        </h1>
        <p className="ktc-label" style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.6 }}>
          {t('This account is currently signed in on another device or browser. Only one device can be signed in at a time. Sign out the other session and continue here, or cancel and leave it as it is.')}
        </p>
        <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
          <button className="ktc-btn" type="button" disabled={!!busy} onClick={() => void terminate()}>
            {busy === 'terminate' ? t('Signing out the other device…') : t('Terminate other session & continue')}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void cancel()}
            style={{
              border: '1px solid hsl(var(--line))',
              borderRadius: 10,
              padding: '10px 16px',
              fontWeight: 600,
              fontSize: 14,
              cursor: busy ? 'default' : 'pointer',
              background: 'rgba(255,255,255,0.7)',
              color: 'hsl(var(--ink-2))',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy === 'cancel' ? t('Cancelling…') : t('Cancel')}
          </button>
        </div>
        <p className="ktc-label" style={{ marginTop: 16, fontSize: 12, opacity: 0.75, lineHeight: 1.5 }}>
          {t('If this wasn’t you, cancel and change your password.')}
        </p>
      </div>
    </div>
  )
}
