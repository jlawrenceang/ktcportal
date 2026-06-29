import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import Notice from './Notice'

// Enrolment panel: mint a fresh set of one-time MFA recovery codes
// (generate_mfa_recovery_codes, 0207). The plaintext is returned ONCE — only
// hashes are stored — so the codes are shown here once, with copy/download and a
// strong save-them-now warning. Generating again replaces any unused codes.
export default function MfaRecoveryCodes() {
  const { t } = useT()
  const [codes, setCodes] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function generate() {
    setBusy(true); setError(null)
    const { data, error: rpcErr } = await supabase.rpc('generate_mfa_recovery_codes')
    setBusy(false)
    if (rpcErr) { setError(rpcErr.message); return }
    setCodes((data ?? []) as string[])
    setCopied(false)
  }

  async function copyAll() {
    if (!codes) return
    try { await navigator.clipboard.writeText(codes.join('\n')); setCopied(true) } catch { /* clipboard blocked */ }
  }

  function download() {
    if (!codes) return
    const blob = new Blob([codes.join('\n') + '\n'], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ktc-recovery-codes.txt'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="ktc-glass" style={{ padding: 18, marginBottom: 18 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{t('Recovery codes')}</h2>
      <p className="ktc-sub" style={{ margin: '2px 0 12px', fontSize: 12 }}>
        {t('One-time codes to sign in if you lose your authenticator device. Keep them somewhere safe.')}
      </p>

      {!codes ? (
        <>
          <button type="button" className="ktc-btn ktc-btn--sm" disabled={busy} onClick={() => void generate()}
            style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}>
            {busy ? t('Generating…') : t('Generate recovery codes')}
          </button>
          {error && <Notice tone="error" style={{ marginTop: 12 }}>{error}</Notice>}
        </>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <Notice tone="warning" title={t('Save these now — they won’t be shown again.')}>
            {t('Each code works once. Store them in a password manager or print them. Generating a new set replaces these.')}
          </Notice>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
            {codes.map((c, i) => (
              <div key={i} className="ktc-mono" style={{ padding: '8px 10px', borderRadius: 9, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)', fontSize: 14, letterSpacing: '0.06em', textAlign: 'center' }}>{c}</div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => void copyAll()} style={{ width: 'auto', padding: '7px 14px', fontSize: 13 }}>
              {copied ? t('✓ Copied') : t('Copy all')}
            </button>
            <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={download} style={{ width: 'auto', padding: '7px 14px', fontSize: 13 }}>
              {t('Download .txt')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
