import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Broker } from '../lib/types'

// Inline banner shown at the top of the portal to a confirmed-but-not-yet-approved
// broker. They get full access to browse and prepare job orders; the actual submit
// is gated server-side (job_orders insert requires broker_is_approved()). Here we
// (1) sync consent captured at sign-up, and (2) let them upload the valid ID an
// admin needs to review before approving.
export default function BrokerStatusBanner({ broker }: { broker: Broker }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState(false)
  const synced = useRef(false)

  // Sync consent (captured in auth metadata at sign-up) onto the broker row if it
  // wasn't written then (the email-confirmation-on path has no session at sign-up).
  useEffect(() => {
    if (synced.current || broker.terms_version) return
    synced.current = true
    void (async () => {
      const { data } = await supabase.auth.getUser()
      const m = (data.user?.user_metadata ?? {}) as Record<string, unknown>
      const keys = ['irr_version', 'irr_accepted_at', 'terms_version', 'terms_accepted_at', 'privacy_consent_version', 'privacy_consented_at']
      const updates: Record<string, unknown> = {}
      for (const k of keys) if (m[k]) updates[k] = m[k]
      if (Object.keys(updates).length) await supabase.from('brokers').update(updates).eq('user_id', broker.user_id)
    })()
  }, [broker.terms_version, broker.user_id])

  async function uploadId(file: File) {
    setBusy(true); setError(null)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'dat'
    const path = `${broker.user_id}/valid-id.${ext}`
    const { error: upErr } = await supabase.storage.from('valid-ids').upload(path, file, { upsert: true })
    if (upErr) { setBusy(false); return setError(upErr.message) }
    const { error: updErr } = await supabase.from('brokers').update({ valid_id_path: path }).eq('id', broker.id)
    setBusy(false)
    if (updErr) return setError(updErr.message)
    setUploaded(true)
  }

  const hasId = !!broker.valid_id_path || uploaded
  const needsId = !hasId

  return (
    <div
      className="ktc-glass"
      style={{
        padding: '18px 20px',
        marginBottom: 18,
        borderRadius: 14,
        border: `1px solid ${needsId ? 'hsl(35 85% 80%)' : 'var(--glass-brd)'}`,
        background: needsId ? 'hsl(40 90% 97%)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'hsl(35 90% 90%)', color: 'hsl(30 80% 35%)', letterSpacing: '0.02em' }}>
          PENDING APPROVAL
        </span>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
          {needsId ? 'Upload your valid ID to finish your application' : 'Your account is awaiting admin review'}
        </h2>
      </div>
      <p className="ktc-label" style={{ marginTop: 8, marginBottom: 0, lineHeight: 1.6, fontSize: 13 }}>
        {needsId
          ? 'You can browse consignees and prepare a job order now — but you can only submit it once a KTC admin reviews your valid ID and approves your account. Upload it below to get reviewed.'
          : 'Thanks — your valid ID is on file. A KTC admin is reviewing your account. You can prepare job orders now; the Submit button unlocks once you’re approved, and we’ll email you.'}
      </p>

      {needsId && (
        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          <label className="ktc-label" htmlFor="bannerId" style={{ fontSize: 12, fontWeight: 600 }}>Valid ID (image or PDF)</label>
          <input id="bannerId" className="ktc-input" type="file" accept="image/*,application/pdf" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadId(f) }} style={{ padding: '9px 13px', maxWidth: 360 }} />
          <span className="ktc-label" style={{ fontSize: 12, opacity: 0.8 }}>Uploaded securely; only KTC admins can view it.</span>
        </div>
      )}

      {uploaded && (
        <p className="ktc-label" style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
          ✅ Valid ID uploaded — your application is complete and pending review.
        </p>
      )}
      {error && <div style={{ color: 'var(--acc-2)', fontSize: 13, marginTop: 10 }}>{error}</div>}
    </div>
  )
}
