import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import AdminShell from './AdminShell'
import Notice, { type NoticeTone } from '../components/Notice'
import PasswordInput from '../components/PasswordInput'
import PasswordStrength from '../components/PasswordStrength'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import { useAuth } from '../lib/AuthContext'
import { passwordIssue } from '../lib/validation'
import { useT } from '../lib/i18n'

type Msg = { tone: NoticeTone; text: string } | null

// Staff "My Account" (/admin/account) — a lightweight self-service screen every
// staff role can reach (floor roles included), so they can change their own
// password without waiting on an owner reset. Staff log in with a synthetic
// @ktc-staff.local account; supabase.auth.updateUser runs on the logged-in
// session, so the password change works the same as it does for customers.
// (Email change is intentionally absent — staff don't own their login email.)
function roleLabel(b: { is_owner?: boolean; is_admin?: boolean; staff_role?: string | null } | null | undefined): string {
  if (!b) return ''
  if (b.is_owner) return 'Owner'
  if (b.staff_role === 'cashier') return 'Cashier'
  if (b.staff_role === 'checker') return 'Checker'
  if (b.staff_role === 'operations') return 'Operations'
  if (b.staff_role === 'csr') return 'CSR'
  if (b.is_admin) return 'Admin'
  return ''
}

export default function AccountStaff() {
  const { t } = useT()
  const { broker, loading } = useBroker()
  const { session } = useAuth()

  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState<Msg>(null)

  const email = broker?.email ?? session?.user.email ?? ''
  const role = roleLabel(broker)

  async function onChangePassword(e: FormEvent) {
    e.preventDefault()
    const pwIssue = passwordIssue(newPw)
    if (pwIssue) { setPwMsg({ tone: 'error', text: t(pwIssue) }); return }
    if (newPw !== newPw2) { setPwMsg({ tone: 'error', text: t('Passwords don’t match.') }); return }
    setSavingPw(true)
    setPwMsg(null)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setSavingPw(false)
    if (error) { setPwMsg({ tone: 'error', text: error.message }); return }
    setNewPw('')
    setNewPw2('')
    setPwMsg({ tone: 'success', text: t('✓ Your password was updated.') })
  }

  if (loading) {
    return <AdminShell><span className="ktc-label">{t('Loading…')}</span></AdminShell>
  }

  return (
    <AdminShell>
      <div style={{ display: 'grid', gap: 16, maxWidth: 620 }}>
        {/* Identity */}
        <div className="ktc-glass" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h1 className="ktc-title">{t('My Account')}</h1>
              <p className="ktc-label" style={{ marginTop: 6, marginBottom: 0 }}>
                {broker?.full_name || email}
              </p>
            </div>
            {role && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 999, background: 'var(--c-h220-12-88)', color: 'var(--c-h220-8-40)', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                {t(role)}
              </span>
            )}
          </div>
        </div>

        {/* Password */}
        <form onSubmit={onChangePassword} className="ktc-glass" style={{ padding: 18, display: 'grid', gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{t('Password')}</h2>
          <p className="ktc-label" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
            {t('Set a new password for your staff login. You stay signed in.')}
          </p>
          {pwMsg && <Notice tone={pwMsg.tone}>{pwMsg.text}</Notice>}
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="stPw">{t('New password')}</label>
            <PasswordInput id="stPw" minLength={8} value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
            <PasswordStrength value={newPw} />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="stPw2">{t('Confirm new password')}</label>
            <PasswordInput id="stPw2" minLength={8} value={newPw2} onChange={(e) => setNewPw2(e.target.value)} autoComplete="new-password" />
          </div>
          <button className="ktc-btn" type="submit" disabled={savingPw} style={{ width: 'auto', justifySelf: 'start', padding: '10px 20px' }}>
            {savingPw ? t('Updating…') : t('Update password')}
          </button>
        </form>

        {/* Two-factor authentication: admin/owner self-enroll lives at /admin/security.
            TODO(T2-02): floor-role 2FA self-enroll is a separate rollout decision —
            the Security enroll UI is gated to admin/owner today; surface it here once
            floor-role enforcement is settled. */}
        {(broker?.is_admin || broker?.is_owner) && (
          <div className="ktc-glass" style={{ padding: 18, display: 'grid', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{t('Two-factor authentication')}</h2>
            <p className="ktc-label" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
              {t('Add a 6-digit code from an authenticator app to your sign-in.')}
            </p>
            <Link to="/admin/security" className="ktc-link" style={{ fontSize: 13, justifySelf: 'start' }}>
              {t('Manage two-factor authentication →')}
            </Link>
          </div>
        )}
      </div>
    </AdminShell>
  )
}
