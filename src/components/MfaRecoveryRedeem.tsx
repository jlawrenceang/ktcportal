import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import Notice from './Notice'

// Slots onto the MFA challenge screen as a lost-device break-glass. Redeeming a
// valid recovery code drops the account's TOTP factor server-side
// (redeem_mfa_recovery_code, 0207), so reloading lands them signed in with no
// MFA, ready to re-enrol. An invalid code returns false (no error thrown).
export default function MfaRecoveryRedeem() {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy || !code.trim()) return
    setBusy(true); setError(null)
    const { data, error: rpcErr } = await supabase.rpc('redeem_mfa_recovery_code', { p_code: code.trim() })
    if (rpcErr) { setBusy(false); setError(rpcErr.message); return }
    if (data === true) { window.location.reload(); return }
    setBusy(false)
    setError(t('That recovery code wasn’t recognized — check it and try again.'))
  }

  if (!open) {
    return (
      <button type="button" className="ktc-link" style={{ fontSize: 13, justifySelf: 'center' }} onClick={() => setOpen(true)}>
        {t('Lost your device? Use a recovery code')}
      </button>
    )
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 10, marginTop: 4, paddingTop: 14, borderTop: '1px solid var(--glass-brd)' }}>
      <label className="ktc-label" htmlFor="mfa-recovery" style={{ fontSize: 13 }}>{t('Enter one of your recovery codes')}</label>
      <input
        id="mfa-recovery"
        className="ktc-input ktc-mono"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder={t('Recovery code')}
        autoComplete="off"
        autoFocus
        style={{ letterSpacing: '0.08em', textAlign: 'center' }}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <button className="ktc-btn" type="submit" disabled={busy || !code.trim()}>
        {busy ? t('Checking…') : t('Use recovery code')}
      </button>
      <button type="button" className="ktc-link" style={{ fontSize: 13, justifySelf: 'center' }}
        onClick={() => { setOpen(false); setError(null); setCode('') }}>
        {t('Cancel')}
      </button>
    </form>
  )
}
