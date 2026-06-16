import { useState } from 'react'
import { useT } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import type { Broker } from '../lib/types'
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_TEL } from '../lib/contact'
import { prepareUpload } from '../lib/validation'

// Shown to customers gated out of the portal:
//  - rejected  → recoverable: fix details + re-upload ID → resubmit for review.
//  - suspended → terminal: contact customer service.
export default function PendingPanel({ broker }: { broker: Broker }) {
  const { t } = useT()
  const suspended = broker.status === 'suspended'
  const [fullName, setFullName] = useState(broker.full_name ?? '')
  const [contactNumber, setContactNumber] = useState(broker.contact_number ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function resubmit() {
    if (!fullName.trim()) return setError(t('Please enter your full name.'))
    if (!contactNumber.trim()) return setError(t('Please enter your contact number.'))
    if (!broker.valid_id_path && !file) return setError(t('Please attach your valid ID.'))
    setBusy(true); setError(null)
    let path = broker.valid_id_path
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'dat'
      path = `${broker.user_id}/valid-id.${ext}`
      const { error: upErr } = await supabase.storage.from('valid-ids').upload(path, file, { upsert: true })
      if (upErr) { setBusy(false); return setError(upErr.message) }
    }
    const { error: updErr } = await supabase.from('customers').update({
      status: 'pending',
      decision_reason: null,
      decided_at: null,
      full_name: fullName.trim(),
      contact_number: contactNumber.trim(),
      valid_id_path: path,
    }).eq('id', broker.id)
    setBusy(false)
    if (updErr) return setError(updErr.message)
    window.location.reload() // refetch as pending → portal
  }

  if (suspended) {
    return (
      <div className="ktc-glass" style={{ padding: 18 }}>
        <h1 className="ktc-title">{t('Account suspended')}</h1>
        <p className="ktc-label" style={{ marginTop: 10, lineHeight: 1.6 }}>
          {t('Your account has been suspended. Please contact KTC customer service for assistance.')}
        </p>
        {broker.decision_reason && (
          <p className="ktc-label" style={{ marginTop: 10, lineHeight: 1.6, padding: '10px 12px', borderRadius: 10, background: 'var(--c-h0-70-97)', border: '1px solid var(--c-h0-60-90)' }}>
            <b>{t('Reason:')}</b> {broker.decision_reason}
          </p>
        )}
        <p className="ktc-label" style={{ marginTop: 14, fontSize: 13 }}>
          {t('Customer service:')} <a href={`mailto:${SUPPORT_EMAIL}`} className="ktc-link">{SUPPORT_EMAIL}</a> ·{' '}
          <a href={`tel:${SUPPORT_PHONE_TEL}`} className="ktc-link">{SUPPORT_PHONE}</a>
        </p>
      </div>
    )
  }

  // rejected → resubmit
  return (
    <div className="ktc-glass" style={{ padding: 18 }}>
      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--c-h35-90-90)', color: 'var(--c-h30-80-35)', letterSpacing: '0.02em' }}>
        {t('ACTION NEEDED')}
      </span>
      <h1 style={{ margin: '12px 0 0', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>{t('Resubmit your details to continue')}</h1>
      <p className="ktc-label" style={{ marginTop: 10, lineHeight: 1.6 }}>
        {t('We just need a quick update to finish verifying your account. Please review the note below, update your details, and resubmit — a KTC admin will review it again.')}
      </p>
      {broker.decision_reason && (
        <p className="ktc-label" style={{ marginTop: 10, lineHeight: 1.6, padding: '10px 12px', borderRadius: 10, background: 'var(--c-h40-90-96)', border: '1px solid var(--c-h35-85-82)' }}>
          <b>{t('What to update:')}</b> {broker.decision_reason}
        </p>
      )}

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="ktc-label" htmlFor="rsName" style={{ fontSize: 12, fontWeight: 600 }}>{t('Full name')}</label>
          <input id="rsName" className="ktc-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="ktc-label" htmlFor="rsPhone" style={{ fontSize: 12, fontWeight: 600 }}>{t('Contact number')}</label>
          <input id="rsPhone" className="ktc-input" type="tel" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="ktc-label" htmlFor="rsId" style={{ fontSize: 12, fontWeight: 600 }}>
            {t('Valid ID (image or PDF)')}{broker.valid_id_path ? t(' — re-upload to replace') : ''}
          </label>
          {!file ? (
            <input id="rsId" className="ktc-input" type="file" accept="image/*,application/pdf" disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                void prepareUpload(f).then((prepared) => {
                  if ('error' in prepared) { setError(prepared.error); return }
                  setError(null); setFile(prepared.file)
                })
              }} style={{ padding: '9px 13px' }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
              <span style={{ fontSize: 13, fontWeight: 500, flex: '1 1 auto', wordBreak: 'break-all' }}>📎 {file.name}</span>
              <button type="button" className="ktc-link" onClick={() => setFile(null)} style={{ fontSize: 13, color: 'var(--acc-2)' }}>{t('Remove')}</button>
            </div>
          )}
        </div>
      </div>

      {error && <div style={{ color: 'var(--acc-2)', fontSize: 13, marginTop: 12 }}>{error}</div>}

      <button className="ktc-btn" type="button" disabled={busy} onClick={() => void resubmit()} style={{ marginTop: 16, width: '100%' }}>
        {busy ? t('Resubmitting…') : t('Resubmit for review')}
      </button>
    </div>
  )
}
