import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Broker } from '../lib/types'
import { useT } from '../lib/i18n'
import Notice from './Notice'

// Inline banner shown at the top of the portal to a confirmed-but-not-yet-approved
// customer. They get full access to browse and prepare job orders (submit is gated
// server-side). Here we (1) sync consent captured at sign-up, and (2) point them to
// the /verify-id page to upload the valid ID an admin needs before approving.
export default function BrokerStatusBanner({ broker, onRefresh, refreshCooling }: { broker: Broker; onRefresh?: () => void; refreshCooling?: boolean }) {
  const { t } = useT()
  const synced = useRef(false)

  // Sync consent (captured in auth metadata at sign-up) onto the customer row if it
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
      if (Object.keys(updates).length) await supabase.from('customers').update(updates).eq('user_id', broker.user_id)
    })()
  }, [broker.terms_version, broker.user_id])

  const needsId = !broker.valid_id_path

  const refreshBtn = onRefresh ? (
    <button
      type="button"
      className="ktc-link"
      onClick={onRefresh}
      disabled={refreshCooling}
      title={refreshCooling ? t('Just refreshed — try again in a few seconds') : t('Checks automatically every minute')}
      style={{ fontSize: 12.5, padding: 0, opacity: refreshCooling ? 0.5 : 1 }}
    >
      {t('↻ Refresh status')}
    </button>
  ) : null

  // Compact one-block banner: short line + inline action.
  return (
    <Notice tone={needsId ? 'warning' : 'info'} style={{ marginBottom: 12, padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 200, fontWeight: 500 }}>
          {needsId
            ? t('Upload a valid ID to get verified — you can file now, but orders are held until a KTC admin approves your account.')
            : t('A KTC admin is verifying your account. Orders stay held until you’re verified.')}
          {refreshBtn && <> {refreshBtn}</>}
        </span>
        {needsId && (
          <Link to="/verify-id" style={{
            flex: '0 0 auto', display: 'inline-block', padding: '8px 14px', borderRadius: 10,
            fontWeight: 600, fontSize: 13, textDecoration: 'none', color: '#fff',
            background: 'linear-gradient(135deg, var(--acc), var(--acc-2))',
          }}>
            {t('Upload valid ID →')}
          </Link>
        )}
      </div>
    </Notice>
  )
}
