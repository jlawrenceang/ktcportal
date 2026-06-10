import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useBroker } from '../lib/useBroker'
import { hasAdminAccess } from '../lib/types'
import { AGREEMENT_VERSION } from '../content/legal'

// Focused landing page for a confirmed broker who hasn't uploaded a valid ID yet.
// After upload they're sent to the portal (where they can file held orders while a
// KTC admin reviews them). Approved / already-has-ID brokers are redirected away.
export default function VerifyId() {
  const { broker, loading } = useBroker()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false) // DPA consent at the point of ID submission

  async function uploadId(file: File) {
    if (!broker) return
    if (!agreed) { setError('Please tick the consent box before uploading your ID.'); return }
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
    return <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}><span className="ktc-label">Loading…</span></div>
  }
  if (!broker) return <Navigate to="/login" replace />
  if (hasAdminAccess(broker)) return <Navigate to="/admin" replace />
  // Only pending brokers without an ID belong here; everyone else goes to the portal.
  if (broker.status !== 'pending' || broker.valid_id_path) return <Navigate to="/" replace />

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: '40px 24px 60px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <img src="/ktc-logo.png" alt="KTC Container Terminal Corp" style={{ height: 48 }} />
        <button className="ktc-link" onClick={handleSignOut}>Sign out</button>
      </header>

      <div className="ktc-glass" style={{ padding: 28 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'hsl(35 90% 90%)', color: 'hsl(30 80% 35%)', letterSpacing: '0.02em' }}>
          PENDING FINAL VERIFICATION
        </span>
        <h1 style={{ margin: '12px 0 0', fontSize: 23, fontWeight: 600, letterSpacing: '-0.02em' }}>Upload your valid ID</h1>
        <p className="ktc-label" style={{ marginTop: 10, lineHeight: 1.6 }}>
          Thanks for confirming your email. To get your account verified, upload a clear photo or PDF of a
          valid government-issued ID — a KTC admin will review it. You don’t have to do it now: you can head
          straight to the portal and prepare job orders, but they’ll be <b>held and can’t be processed until
          your account is verified</b>.
        </p>

        <label style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13, lineHeight: 1.55 }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 3 }} />
          <span className="ktc-label" style={{ fontSize: 13 }}>
            I have read and agree to the{' '}
            <a href="/agreement" target="_blank" rel="noopener noreferrer" className="ktc-link">KTC Customer Agreement (Terms &amp; Conditions)</a>
            {' '}and consent to KTC collecting and processing my valid ID for verification under the Data Privacy Act (R.A. 10173).
          </span>
        </label>

        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          <label className="ktc-label" htmlFor="verifyId" style={{ fontSize: 12, fontWeight: 600 }}>Valid ID (image or PDF)</label>
          <input id="verifyId" className="ktc-input" type="file" accept="image/*,application/pdf" disabled={busy || !agreed}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadId(f) }} style={{ padding: '9px 13px', opacity: agreed ? 1 : 0.6 }} />
          <span className="ktc-label" style={{ fontSize: 12, opacity: 0.8 }}>
            {busy ? 'Uploading…' : agreed ? 'Uploaded securely; only KTC admins can view it.' : 'Tick the consent box above to enable upload.'}
          </span>
        </div>

        {error && <div style={{ color: 'var(--acc-2)', fontSize: 13, marginTop: 12 }}>{error}</div>}

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid hsl(var(--line))', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="ktc-link" onClick={() => navigate('/', { replace: true })}>
            Skip for now — continue to the portal →
          </button>
          <span className="ktc-label" style={{ fontSize: 12, opacity: 0.8 }}>You can upload your ID later from the banner.</span>
        </div>
      </div>
    </div>
  )
}
