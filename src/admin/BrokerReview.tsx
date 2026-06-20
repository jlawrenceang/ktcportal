import type { CSSProperties } from 'react'
import { useT } from '../lib/i18n'
import { CheckCircleIcon, AlertTriangleIcon } from '../components/icons'

// The fields BrokerReview needs — satisfied by both the Approvals query row and
// the full Broker type.
export interface ReviewBroker {
  status?: string
  valid_id_path: string | null
  email_confirmed_at: string | null
  terms_version: string | null
  terms_accepted_at: string | null
  privacy_consent_version: string | null
  privacy_consented_at: string | null
}

function fmtDate(s: string | null): string | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toLocaleDateString()
}

const pill = (bg: string, fg: string): CSSProperties => ({
  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: bg, color: fg,
  display: 'inline-flex', alignItems: 'center', gap: 4,
})

// Email-confirmed + valid-ID + Terms / Data-Privacy consent badges. Green check
// when present, amber warning when missing. An approved customer's ID is deleted
// after review (DPA), so we show "ID verified" rather than a "no ID" warning.
export function BrokerReview({ b }: { b: ReviewBroker }) {
  const { t } = useT()
  const ok = pill('var(--c-h150-50-93)', 'var(--c-h150-60-30)')
  const warn = pill('var(--c-h0-70-95)', 'var(--c-h0-65-45)')
  const terms = fmtDate(b.terms_accepted_at)
  const dpa = fmtDate(b.privacy_consented_at)
  const confirmed = fmtDate(b.email_confirmed_at)
  const idVerified = !b.valid_id_path && b.status === 'approved'
  const idOk = !!b.valid_id_path || idVerified
  const termsOk = !!(terms || dpa)
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      <span style={confirmed ? ok : warn}>
        {confirmed ? <CheckCircleIcon size={12} /> : <AlertTriangleIcon size={12} />}
        {confirmed ? t('Email confirmed {date}', { date: confirmed }) : t('Email not confirmed')}
      </span>
      <span style={idOk ? ok : warn}>
        {idOk ? <CheckCircleIcon size={12} /> : <AlertTriangleIcon size={12} />}
        {b.valid_id_path ? t('Valid ID on file') : idVerified ? t('ID verified') : t('No valid ID')}
      </span>
      <span style={termsOk ? ok : warn}>
        {termsOk ? <CheckCircleIcon size={12} /> : <AlertTriangleIcon size={12} />}
        {termsOk ? t('Terms & DPA {date}', { date: terms || dpa || '' }) : t('Agreement not accepted')}
      </span>
    </div>
  )
}
