import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useBroker } from '../lib/useBroker'
import { hasAdminAccess } from '../lib/types'
import { AGREEMENT_VERSION, AGREEMENT_VERSION_LABEL, AGREEMENT_BODY } from '../content/legal'
import { MarkdownBody } from '../components/MarkdownDoc'
import { prepareUpload } from '../lib/validation'
import { useT } from '../lib/i18n'
import { PaperclipIcon } from '../components/icons'

// Focused landing page for a confirmed customer who hasn't uploaded a valid ID yet.
// They attach a file, can view/remove it, then deliberately submit. After submit
// they're sent to the portal. Approved / already-has-ID customers are redirected away.
export default function VerifyId() {
  const { t } = useT()
  const { broker, loading } = useBroker()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false) // DPA consent at the point of ID submission
  const [showAgreement, setShowAgreement] = useState(false) // full-agreement modal
  const [file, setFile] = useState<File | null>(null) // staged, not yet uploaded
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  // Clean up the object URL when it changes or the page unmounts.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  async function pickFile(f: File) {
    const prepared = await prepareUpload(f) // oversized images auto-compress
    if ('error' in prepared) { setError(prepared.error); return }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(prepared.file)
    setPreviewUrl(URL.createObjectURL(prepared.file))
    setError(null)
  }
  function removeFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    setShowPreview(false)
  }

  async function submitId() {
    if (!broker || !file) return
    if (!agreed) { setError(t('Please tick the consent box before submitting your ID.')); return }
    setBusy(true); setError(null)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'dat'
    const path = `${broker.user_id}/valid-id.${ext}`
    const { error: upErr } = await supabase.storage.from('valid-ids').upload(path, file, { upsert: true })
    if (upErr) { setBusy(false); return setError(upErr.message) }
    // Record the valid ID + capture the DPA / Terms consent at the moment of submission.
    const now = new Date().toISOString()
    const { error: updErr } = await supabase.from('customers').update({
      valid_id_path: path,
      terms_version: AGREEMENT_VERSION,
      terms_accepted_at: now,
      privacy_consent_version: AGREEMENT_VERSION,
      privacy_consented_at: now,
    }).eq('id', broker.id)
    if (updErr) { setBusy(false); return setError(updErr.message) }
    navigate('/', { replace: true })
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  if (loading) {
    return <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}><span className="ktc-label">{t('Loading…')}</span></div>
  }
  if (!broker) return <Navigate to="/login" replace />
  if (hasAdminAccess(broker)) return <Navigate to="/admin" replace />
  // Only pending customers without an ID belong here; everyone else goes to the portal.
  if (broker.status !== 'pending' || broker.valid_id_path) return <Navigate to="/" replace />

  const isPdf = file?.type === 'application/pdf'

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: '40px 24px 60px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <img src="/ktc-logo.png" alt={t('KTC Container Terminal Corp')} style={{ height: 48 }} />
        <button className="ktc-link" onClick={handleSignOut}>{t('Sign out')}</button>
      </header>

      <div className="ktc-glass" style={{ padding: 18 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--c-h35-90-90)', color: 'var(--c-h30-80-35)', letterSpacing: '0.02em' }}>
          {t('PENDING FINAL VERIFICATION')}
        </span>
        <h1 style={{ margin: '12px 0 0', fontSize: 23, fontWeight: 600, letterSpacing: '-0.02em' }}>{t('Upload your valid ID')}</h1>
        <p className="ktc-label" style={{ marginTop: 10, lineHeight: 1.6, textAlign: 'left' }}>
          {t('To activate your account and pass final verification, attach a clear photo or PDF of a valid government-issued ID and submit it for KTC admin approval.')}
        </p>
        <p className="ktc-label" style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.55, opacity: 0.85, textAlign: 'left' }}>
          {t('You can continue to the portal first and prepare job orders — they’ll be held until your account is verified.')}
        </p>

        <label style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', textAlign: 'left' }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3, flex: '0 0 auto' }} />
          <span className="ktc-label" style={{ fontSize: 13, lineHeight: 1.55, textAlign: 'left' }}>
            {t('I have read and agree to the')}{' '}
            <button type="button" className="ktc-link" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowAgreement(true) }}
              style={{ display: 'inline', border: 0, background: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>{t('KTC Customer Agreement (Terms & Conditions)')}</button>
            {' '}{t('and consent to KTC collecting and processing my valid ID for verification under the Data Privacy Act (R.A. 10173).')}
          </span>
        </label>

        <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
          <span className="ktc-label" style={{ fontSize: 12, fontWeight: 600 }}>{t('Valid ID (image or PDF)')}</span>
          {!file ? (
            <>
              <input id="verifyId" className="ktc-input" type="file" accept="image/*,application/pdf" disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickFile(f) }} style={{ padding: '9px 13px' }} />
              <span className="ktc-label" style={{ fontSize: 12, opacity: 0.8 }}>{t('Choose a clear photo or PDF — you can review it before submitting.')}</span>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
              <span style={{ fontSize: 13, fontWeight: 500, flex: '1 1 auto', wordBreak: 'break-all', display: 'inline-flex', alignItems: 'center', gap: 7 }}><PaperclipIcon size={15} /> {file.name}</span>
              <button type="button" className="ktc-link" onClick={() => setShowPreview(true)} style={{ fontSize: 13 }}>{t('View')}</button>
              <button type="button" className="ktc-link" onClick={removeFile} style={{ fontSize: 13, color: 'var(--acc-2)' }}>{t('Remove')}</button>
            </div>
          )}
        </div>

        {error && <div style={{ color: 'var(--acc-2)', fontSize: 13, marginTop: 12 }}>{error}</div>}

        <button className="ktc-btn" type="button" disabled={!file || !agreed || busy}
          onClick={() => void submitId()} style={{ marginTop: 16, width: '100%', opacity: !file || !agreed ? 0.6 : 1 }}>
          {busy ? t('Submitting…') : t('Submit valid ID for verification')}
        </button>
        {!agreed && file && (
          <span className="ktc-label" style={{ display: 'block', marginTop: 8, fontSize: 12, opacity: 0.8 }}>{t('Tick the consent box above to submit.')}</span>
        )}

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid hsl(var(--line))', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="ktc-link" onClick={() => navigate('/', { replace: true })}>
            {t('Skip for now — continue to the portal →')}
          </button>
          <span className="ktc-label" style={{ fontSize: 12, opacity: 0.8 }}>{t('You can upload your ID later from the banner.')}</span>
        </div>
      </div>

      {showPreview && previewUrl && (
        <div onClick={() => setShowPreview(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} className="ktc-glass"
            style={{ maxWidth: 720, width: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--glass-brd)' }}>
              <span style={{ fontWeight: 600, fontSize: 14, wordBreak: 'break-all' }}>{file?.name}</span>
              <button type="button" aria-label={t('Close')} onClick={() => setShowPreview(false)}
                style={{ fontSize: 20, lineHeight: 1, border: 0, background: 'none', cursor: 'pointer', color: 'hsl(var(--ink-2))' }}>✕</button>
            </div>
            <div style={{ overflow: 'auto', padding: 16, display: 'grid', placeItems: 'center' }}>
              {isPdf
                ? <iframe title={t('Valid ID preview')} src={previewUrl} style={{ width: '100%', height: '70vh', border: 0, borderRadius: 8 }} />
                : <img src={previewUrl} alt={t('Valid ID preview')} style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8 }} />}
            </div>
          </div>
        </div>
      )}

      {showAgreement && (
        <div onClick={() => setShowAgreement(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} className="ktc-glass"
            style={{ maxWidth: 640, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--glass-brd)' }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{t('KTC Customer Agreement ({version})', { version: AGREEMENT_VERSION_LABEL })}</span>
              <button type="button" aria-label={t('Close')} onClick={() => setShowAgreement(false)}
                style={{ fontSize: 20, lineHeight: 1, border: 0, background: 'none', cursor: 'pointer', color: 'hsl(var(--ink-2))' }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '16px 20px', fontSize: 13 }}>
              <MarkdownBody body={AGREEMENT_BODY} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
