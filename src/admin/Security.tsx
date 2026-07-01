import { useEffect, useState, type FormEvent } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import { hasAdminAccess } from '../lib/types'
import { useT } from '../lib/i18n'
import { ShieldIcon } from '../components/icons'
import { revokeTrustedMfaDevices } from '../lib/mfaTrust'

// /admin/security — two-factor authentication self-service for staff + owner.
// Enroll: QR (or manual secret) → 6-digit verify. Once verified, the backend
// requires aal2 (migration 0049): a password-only session can't use any
// staff permission, and ProtectedRoute shows the challenge at sign-in.
// Lost authenticator: the owner removes the factor server-side (runbook).

interface Enrolling {
  factorId: string
  qr: string      // SVG data-URI
  secret: string  // manual-entry fallback
}

export default function Security() {
  const { t } = useT()
  const { broker, loading: brokerLoading } = useBroker()
  const [verified, setVerified] = useState<{ id: string; name: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  async function loadFactors() {
    const { data, error: err } = await supabase.auth.mfa.listFactors()
    if (err) { setError(err.message); setLoading(false); return }
    setVerified((data?.totp ?? []).filter((f) => f.status === 'verified').map((f) => ({ id: f.id, name: f.friendly_name ?? null })))
    setLoading(false)
  }
  useEffect(() => { void loadFactors() }, [])

  async function startEnroll() {
    setBusy(true); setError(null); setNotice(null)
    // Clear out any abandoned half-enrollments first (they block re-enrolling).
    const { data: existing } = await supabase.auth.mfa.listFactors()
    for (const f of existing?.all ?? []) {
      if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    }
    const { data, error: err } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'KTC Portal',
      issuer: 'KTC Online Portal',
    })
    setBusy(false)
    if (err || !data) { setError(err?.message ?? t('Could not start enrollment.')); return }
    setEnrolling({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    setCode('')
  }

  async function confirmEnroll(e: FormEvent) {
    e.preventDefault()
    if (!enrolling || busy || code.trim().length < 6) return
    setBusy(true); setError(null)
    const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId: enrolling.factorId })
    if (cErr || !ch) { setBusy(false); setError(cErr?.message ?? t('Could not start the check.')); return }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: enrolling.factorId, challengeId: ch.id, code: code.trim(),
    })
    setBusy(false)
    if (vErr) { setError(t("That code didn't match — scan the QR again or re-type the code.")); setCode(''); return }
    setEnrolling(null)
    setNotice(t('✓ Two-factor authentication is ON. From now on, signing in asks for a code from your app.'))
    await loadFactors()
  }

  async function cancelEnroll() {
    if (enrolling) await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId })
    setEnrolling(null); setCode(''); setError(null)
  }

  async function removeFactor(id: string) {
    setBusy(true); setError(null); setNotice(null)
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId: id })
    setBusy(false); setConfirmRemove(false)
    if (err) { setError(err.message); return }
    setNotice(t('Two-factor authentication removed. Your account is back to password-only — consider re-enrolling.'))
    await loadFactors()
  }

  async function forgetTrustedDevices() {
    setBusy(true); setError(null); setNotice(null)
    try {
      await revokeTrustedMfaDevices()
      setNotice(t('✓ Trusted devices cleared. Every browser will ask for a code next sign-in.'))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not clear trusted devices.'))
    } finally {
      setBusy(false)
    }
  }

  // Rollout decision 2026-06-12: 2FA is for admin + owner accounts for now
  // (cashier/checker tablets stay password-only until the floor workflow is
  // settled). Enforcement (0049) keys off enrollment, so unenrolled roles
  // are unaffected.
  if (!brokerLoading && !hasAdminAccess(broker)) {
    return (
      <AdminShell>
        <div className="ktc-glass" style={{ padding: 18 }}>
          <p className="ktc-label">{t('Two-factor authentication is currently available for admin and owner accounts only.')}</p>
        </div>
      </AdminShell>
    )
  }

  return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 18, maxWidth: 620 }}>
        <h1 className="ktc-title">{t('Two-factor authentication')}</h1>
        <p className="ktc-label" style={{ marginTop: 8, lineHeight: 1.65 }}>
          {t('Adds a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password…) to your sign-in. Once enabled it\'s enforced')} <b>{t('server-side')}</b> {t('— a stolen password alone can\'t reach any staff function.')}
        </p>

        {error && <div role="alert" style={{ marginTop: 14, fontSize: 13, color: 'var(--acc-2)', padding: '10px 14px', borderRadius: 10, background: 'var(--c-h0-75-97)', border: '1px solid var(--c-h0-70-88)' }}>{error}</div>}
        {notice && <div style={{ marginTop: 14, fontSize: 13.5, padding: '10px 14px', borderRadius: 10, background: 'var(--c-h145-60-96)', border: '1px solid var(--c-h145-50-80)' }}>{notice}</div>}

        {loading ? (
          <div className="ktc-skeleton" style={{ height: 56, borderRadius: 12, marginTop: 18 }} />
        ) : enrolling ? (
          <div style={{ marginTop: 20, display: 'grid', gap: 14 }}>
            <b style={{ fontSize: 14.5 }}>{t('1 · Scan this QR code with your authenticator app')}</b>
            <img src={enrolling.qr} alt={t('TOTP enrollment QR code')} style={{ width: 190, height: 190, borderRadius: 12, border: '1px solid var(--glass-brd)', background: '#fff', padding: 8 }} />
            <span className="ktc-label" style={{ fontSize: 12.5 }}>
              {t('Can\'t scan? Enter this key manually:')} <code className="ktc-mono" style={{ userSelect: 'all' }}>{enrolling.secret}</code>
            </span>
            <form onSubmit={confirmEnroll} style={{ display: 'grid', gap: 10, maxWidth: 280 }}>
              <b style={{ fontSize: 14.5 }}>{t('2 · Enter the 6-digit code it shows')}</b>
              <input
                className="ktc-input ktc-mono"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                style={{ fontSize: 20, letterSpacing: '0.3em', textAlign: 'center' }}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="ktc-btn" type="submit" disabled={busy || code.trim().length < 6} style={{ width: 'auto', padding: '11px 22px' }}>
                  {busy ? t('Checking…') : t('Turn on 2FA')}
                </button>
                <button type="button" className="ktc-btn-secondary" onClick={() => void cancelEnroll()} style={{ padding: '11px 18px' }}>{t('Cancel')}</button>
              </div>
            </form>
          </div>
        ) : verified.length > 0 ? (
          <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 12, background: 'var(--c-h145-60-96)', border: '1px solid var(--c-h145-50-80)' }}>
              <span className="ktc-chip ktc-chip--success">{t('ON')}</span>
              <span style={{ fontSize: 14 }}>{t('Two-factor authentication is active on this account.')}</span>
            </div>
            {confirmRemove ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 13.5 }}>
                <span style={{ fontWeight: 600, color: 'var(--acc-2)' }}>{t('Remove 2FA and go back to password-only?')}</span>
                <button type="button" className="ktc-link" style={{ fontWeight: 700, color: 'var(--acc-2)' }} disabled={busy} onClick={() => void removeFactor(verified[0].id)}>
                  {busy ? t('Removing…') : t('Yes, remove it')}
                </button>
                <button type="button" className="ktc-link" onClick={() => setConfirmRemove(false)}>{t('Keep it on')}</button>
              </div>
            ) : (
              <button type="button" className="ktc-link" style={{ fontSize: 13, justifySelf: 'start', opacity: 0.85 }} onClick={() => setConfirmRemove(true)}>
                {t('Remove two-factor authentication')}
              </button>
            )}
            <span className="ktc-label" style={{ fontSize: 12, lineHeight: 1.6 }}>
              {t('Lost your authenticator? The owner can remove the factor from the server so you can sign in and re-enroll.')}
            </span>
            <div style={{ borderTop: '1px solid var(--glass-brd)', paddingTop: 12, display: 'grid', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t('Trusted browsers')}</h3>
              <span className="ktc-label" style={{ fontSize: 12, lineHeight: 1.6 }}>
                {t('Signs out "trust this device" on every browser — each will ask for a 2FA code next sign-in.')}
              </span>
              <button type="button" className="ktc-link" style={{ fontSize: 13, justifySelf: 'start', opacity: 0.85 }} disabled={busy} onClick={() => void forgetTrustedDevices()}>
                {busy ? t('Clearing…') : t('Forget trusted devices')}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 20 }}>
            <button className="ktc-btn" type="button" disabled={busy} onClick={() => void startEnroll()} style={{ width: 'auto', padding: '12px 26px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {busy ? t('Preparing…') : <><ShieldIcon size={16} /> {t('Set up two-factor authentication')}</>}
            </button>
          </div>
        )}
      </div>
    </AdminShell>
  )
}
