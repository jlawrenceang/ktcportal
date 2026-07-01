import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../components/Shell'
import Notice, { type NoticeTone } from '../components/Notice'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import { useAuth } from '../lib/AuthContext'
import { passwordIssue } from '../lib/validation'
import PasswordInput from '../components/PasswordInput'
import PasswordStrength from '../components/PasswordStrength'
import { usePageTour } from '../components/TourProvider'
import { accountSteps } from '../components/WelcomeTour'
import { useT } from '../lib/i18n'
import PushToggle from '../components/PushToggle'

type Msg = { tone: NoticeTone; text: string } | null

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending verification',
  approved: 'Verified',
  rejected: 'Action needed',
  suspended: 'Suspended',
}
const STATUS_STYLE: Record<string, { bg: string; ink: string }> = {
  pending: { bg: 'var(--c-h40-90-86)', ink: 'var(--c-h30-75-32)' },
  approved: { bg: 'var(--c-h150-50-88)', ink: 'var(--c-h150-55-26)' },
  rejected: { bg: 'var(--c-h0-75-92)', ink: 'var(--c-h0-65-42)' },
  suspended: { bg: 'var(--c-h220-12-88)', ink: 'var(--c-h220-8-40)' },
}

export default function Account() {
  const { t } = useT()
  usePageTour('account', accountSteps)
  const { broker, loading } = useBroker()
  const { session } = useAuth()

  // Baselines track the last-saved values so we can detect real changes.
  const [baseName, setBaseName] = useState('')
  const [baseContact, setBaseContact] = useState('')
  const [fullName, setFullName] = useState('')
  const [contact, setContact] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<Msg>(null)
  const [showReverify, setShowReverify] = useState(false)
  const [smsOptOut, setSmsOptOut] = useState(false)
  const [savingSms, setSavingSms] = useState(false)
  const [smsMsg, setSmsMsg] = useState<Msg>(null)

  const [newEmail, setNewEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [emailMsg, setEmailMsg] = useState<Msg>(null)

  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState<Msg>(null)

  const email = broker?.email ?? session?.user.email ?? ''
  const approved = broker?.status === 'approved'

  useEffect(() => {
    if (!broker) return
    setBaseName(broker.full_name ?? '')
    setBaseContact(broker.contact_number ?? '')
    setFullName(broker.full_name ?? '')
    setContact(broker.contact_number ?? '')
    setSmsOptOut(!!broker.sms_opt_out)
    // Keep customers.email in sync with the (possibly just-confirmed) auth email.
    // Needs .then() to actually dispatch — a bare `void supabase.from(...).update()`
    // is a lazy builder and never runs.
    const authEmail = session?.user.email
    if (authEmail && broker.email && authEmail !== broker.email) {
      void supabase.from('customers').update({ email: authEmail }).eq('id', broker.id).then(() => undefined, () => undefined)
    }
  }, [broker, session?.user.email])

  const nameChanged = fullName.trim() !== baseName
  const contactChanged = contact.trim() !== baseContact

  async function doSaveProfile() {
    if (!broker) return
    setSavingProfile(true)
    setProfileMsg(null)
    const updates: Record<string, unknown> = { full_name: fullName.trim(), contact_number: contact.trim() }
    const reverifying = approved && nameChanged
    if (reverifying) {
      updates.status = 'pending'
      updates.decided_at = null
      updates.decision_reason = null
      // Clear the old ID so /verify-id shows the upload prompt again (it redirects away while
      // valid_id_path is set) — otherwise the admin would re-review the OLD ID against the NEW
      // name and the customer has no way to replace it. The stale file is purged by the cron. (T1-02)
      updates.valid_id_path = null
    }
    const { error } = await supabase.from('customers').update(updates).eq('id', broker.id)
    setSavingProfile(false)
    setShowReverify(false)
    if (error) {
      setProfileMsg({ tone: 'error', text: error.message })
      return
    }
    if (reverifying) {
      // Back to pending — reload so the portal shows the re-verification banner.
      window.location.reload()
      return
    }
    setBaseName(fullName.trim())
    setBaseContact(contact.trim())
    setProfileMsg({ tone: 'success', text: t('✓ Your details were saved.') })
  }

  async function onChangeSms(nextOptOut: boolean) {
    if (savingSms) return
    setSavingSms(true)
    setSmsMsg(null)
    const prev = smsOptOut
    setSmsOptOut(nextOptOut)
    const { error } = await supabase.rpc('set_sms_opt_out', { p_opt_out: nextOptOut })
    setSavingSms(false)
    if (error) {
      setSmsOptOut(prev)
      setSmsMsg({ tone: 'error', text: error.message })
      return
    }
    setSmsMsg({ tone: 'success', text: nextOptOut ? t('SMS updates are off.') : t('SMS updates are on.') })
  }

  function onSaveProfile(e: FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) { setProfileMsg({ tone: 'error', text: t('Full name can’t be empty.') }); return }
    if (!contact.trim()) { setProfileMsg({ tone: 'error', text: t('Contact number can’t be empty.') }); return }
    if (!nameChanged && !contactChanged) { setProfileMsg({ tone: 'info', text: t('Nothing to save — no changes.') }); return }
    // Approved customer changing their legal name → confirm re-verification first.
    if (approved && nameChanged) { setShowReverify(true); return }
    void doSaveProfile()
  }

  async function onChangeEmail(e: FormEvent) {
    e.preventDefault()
    const next = newEmail.trim()
    if (!next) { setEmailMsg({ tone: 'error', text: t('Enter the new email address.') }); return }
    if (next.toLowerCase() === email.toLowerCase()) { setEmailMsg({ tone: 'info', text: t('That’s already your email.') }); return }
    setSavingEmail(true)
    setEmailMsg(null)
    const { error } = await supabase.rpc('request_customer_email_change', {
      p_new_email: next,
      p_redirect_base: typeof window !== 'undefined' ? window.location.origin : undefined,
    })
    setSavingEmail(false)
    if (error) { setEmailMsg({ tone: 'error', text: error.message }); return }
    setNewEmail('')
    setEmailMsg({
      tone: 'success',
      text: t('✓ A confirmation link was sent to {next}. Click it to finish the change — your current email stays active until you confirm.', { next }),
    })
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault()
    const pwIssue = passwordIssue(newPw)
    if (pwIssue) { setPwMsg({ tone: 'error', text: pwIssue }); return }
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
    return <Shell><span className="ktc-label">{t('Loading…')}</span></Shell>
  }

  const sp = STATUS_STYLE[broker?.status ?? 'pending'] ?? STATUS_STYLE.pending

  return (
    <Shell>
      <div style={{ display: 'grid', gap: 16 }}>
        {/* Profile summary */}
        <div className="ktc-glass" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h1 className="ktc-title">{t('My Account')}</h1>
              <p className="ktc-label" style={{ marginTop: 6, marginBottom: 0 }}>
                {email}
                {broker?.customer_code && (
                  <>{' · '}<span className="ktc-mono" style={{ fontWeight: 600 }}>{broker.customer_code}</span></>
                )}
              </p>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 999, background: sp.bg, color: sp.ink, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
              {t(STATUS_LABEL[broker?.status ?? 'pending'] ?? broker?.status ?? '')}
            </span>
          </div>
        </div>

        {/* Personal details */}
        <form onSubmit={onSaveProfile} className="ktc-glass" style={{ padding: 18, display: 'grid', gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{t('Personal details')}</h2>
          {profileMsg && <Notice tone={profileMsg.tone}>{profileMsg.text}</Notice>}
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="acFullName">{t('Full name')}</label>
            <input id="acFullName" className="ktc-input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
            {approved && (
              <span className="ktc-label" style={{ fontSize: 11.5, opacity: 0.75, lineHeight: 1.45 }}>
                {t('This is the legal name verified against your ID. Changing it requires re-verification (you’ll re-upload an ID for an admin to review).')}
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="acContact">{t('Contact number')}</label>
            <input id="acContact" className="ktc-input" type="tel" value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="tel" />
          </div>
          <button className="ktc-btn" type="submit" disabled={savingProfile || (!nameChanged && !contactChanged)} style={{ width: 'auto', justifySelf: 'start', padding: '10px 20px' }}>
            {savingProfile ? t('Saving…') : t('Save changes')}
          </button>
        </form>

        {/* Notification preferences */}
        <div className="ktc-glass" style={{ padding: 18, display: 'grid', gap: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{t('Notification preferences')}</h2>
            <p className="ktc-label" style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5 }}>
              {t('Choose how this device and phone number receive KTC updates. The notification bell only shows your notification list.')}
            </p>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <PushToggle variant="menu" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t('SMS updates')}</h3>
            <p className="ktc-label" style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5 }}>
              {t('Receive text messages for urgent order, payment, and release updates. In-app notifications still work either way.')}
            </p>
          </div>
          {smsMsg && <Notice tone={smsMsg.tone}>{smsMsg.text}</Notice>}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, color: 'hsl(var(--ink))' }}>
            <input
              type="checkbox"
              checked={!smsOptOut}
              disabled={savingSms}
              onChange={(e) => void onChangeSms(!e.target.checked)}
            />
            {savingSms ? t('Saving SMS preference…') : t('Receive SMS updates')}
          </label>
        </div>

        {/* Email */}
        <form onSubmit={onChangeEmail} className="ktc-glass" style={{ padding: 18, display: 'grid', gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{t('Email address')}</h2>
          <p className="ktc-label" style={{ margin: 0, fontSize: 13 }}>
            {t('Current:')} <b style={{ color: 'hsl(var(--ink))' }}>{email}</b>
          </p>
          {emailMsg && <Notice tone={emailMsg.tone}>{emailMsg.text}</Notice>}
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="acEmail">{t('New email address')}</label>
            <input id="acEmail" className="ktc-input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={t('you@example.com')} />
            <span className="ktc-label" style={{ fontSize: 11.5, opacity: 0.75, lineHeight: 1.45 }}>
              {t('We’ll email a confirmation link to the new address. The change only takes effect once you click it.')}
            </span>
          </div>
          <button className="ktc-btn" type="submit" disabled={savingEmail} style={{ width: 'auto', justifySelf: 'start', padding: '10px 20px' }}>
            {savingEmail ? t('Sending…') : t('Send confirmation link')}
          </button>
        </form>

        {/* Password */}
        <form onSubmit={onChangePassword} className="ktc-glass" style={{ padding: 18, display: 'grid', gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{t('Password')}</h2>
          {pwMsg && <Notice tone={pwMsg.tone}>{pwMsg.text}</Notice>}
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="acPw">{t('New password')}</label>
            <PasswordInput id="acPw" minLength={8} value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
            <PasswordStrength value={newPw} />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="acPw2">{t('Confirm new password')}</label>
            <PasswordInput id="acPw2" minLength={8} value={newPw2} onChange={(e) => setNewPw2(e.target.value)} autoComplete="new-password" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <button className="ktc-btn" type="submit" disabled={savingPw} style={{ width: 'auto', padding: '10px 20px' }}>
              {savingPw ? t('Updating…') : t('Update password')}
            </button>
            <Link to="/forgot-password" className="ktc-link" style={{ fontSize: 13 }}>
              {t('Forgot your password? Reset it by email →')}
            </Link>
          </div>
        </form>
      </div>

      {/* Re-verification confirm */}
      {showReverify && (
        <div className="ktc-modal-backdrop" onClick={() => setShowReverify(false)}>
          <div onClick={(e) => e.stopPropagation()} className="ktc-glass ktc-modal-panel" style={{ maxWidth: 460, width: '100%', padding: 18, maxHeight: '88vh', overflowY: 'auto' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>{t('Changing your name needs re-verification')}</h2>
            <p className="ktc-label" style={{ marginTop: 10, lineHeight: 1.6, fontSize: 13.5 }}>
              {t('Your legal name was verified against your ID. To change it to')} <b style={{ color: 'hsl(var(--ink))' }}>{fullName.trim()}</b>,{' '}
              {t('your account goes back to')} <b>{t('pending')}</b> {t('and you’ll re-upload a valid ID for a KTC admin to re-verify. While it’s pending re-approval, filing Job Orders is locked until KTC approves you again.')}
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
              <button className="ktc-btn" type="button" disabled={savingProfile} onClick={() => void doSaveProfile()} style={{ width: 'auto', padding: '10px 20px' }}>
                {savingProfile ? t('Saving…') : t('Change name & re-verify')}
              </button>
              <button type="button" className="ktc-link" onClick={() => setShowReverify(false)}>{t('Cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}
