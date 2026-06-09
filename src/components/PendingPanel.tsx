import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Broker } from '../lib/types'

// Shown to un-approved brokers. With email-confirmation ON there's no session at
// sign-up, so the valid ID and the consent columns are completed here on first
// login (storage + RLS need a session).
export default function PendingPanel({ broker }: { broker: Broker }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState(false)
  const synced = useRef(false)

  // Sync consent (captured in auth metadata at sign-up) onto the broker row if it
  // wasn't written then (the email-confirmation-on path).
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

  const rejected = broker.status === 'rejected'
  const suspended = broker.status === 'suspended'
  const needsId = broker.status === 'pending' && !broker.valid_id_path && !uploaded

  return (
    <div className="ktc-glass" style={{ padding: 28 }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>
        {rejected ? 'Account not approved' : suspended ? 'Account suspended' : 'Account pending approval'}
      </h1>
      <p className="ktc-label" style={{ marginTop: 10, lineHeight: 1.6 }}>
        {rejected
          ? 'Your account application was not approved.'
          : suspended
          ? 'Your account has been suspended. Please contact KTC for assistance.'
          : needsId
          ? 'Almost done — upload your valid ID below to complete your application. A KTC admin will then review your account.'
          : 'Thanks — your application is complete. A KTC admin is reviewing your account and valid ID. ' +
            "You'll be able to submit job orders once approved."}
      </p>

      {(rejected || suspended) && broker.decision_reason && (
        <p className="ktc-label" style={{ marginTop: 10, lineHeight: 1.6, padding: '10px 12px', borderRadius: 10, background: 'hsl(0 70% 97%)', border: '1px solid hsl(0 60% 90%)' }}>
          <b>Reason:</b> {broker.decision_reason}
        </p>
      )}

      {needsId && (
        <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
          <label className="ktc-label" htmlFor="pendingId">Valid ID (image or PDF)</label>
          <input id="pendingId" className="ktc-input" type="file" accept="image/*,application/pdf" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadId(f) }} style={{ padding: '9px 13px' }} />
          <span className="ktc-label" style={{ fontSize: 12, opacity: 0.8 }}>Uploaded securely; only KTC admins can view it.</span>
        </div>
      )}

      {uploaded && (
        <p className="ktc-label" style={{ marginTop: 12, fontSize: 13 }}>
          ✅ Valid ID uploaded. Your application is complete and pending review.
        </p>
      )}
      {error && <div style={{ color: 'var(--acc-2)', fontSize: 13, marginTop: 10 }}>{error}</div>}
    </div>
  )
}
