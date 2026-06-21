import type { ReactNode } from 'react'
import { useT } from '../lib/i18n'
import { releaseState, type PaymentState } from '../lib/release'
import { type JobOrder } from '../lib/types'
import { CreditCardIcon, ScanIcon, CheckCircleIcon, ClockIcon } from './icons'

// Two parallel gate tracks — Payment and X-ray — converging into a single
// "Cleared for release" badge. Mirrors the release-gate model in lib/release.ts.
const PAY_LABEL: Record<PaymentState, string> = {
  unpaid: 'Unpaid',
  submitted: 'Proof in review',
  rejected: 'Proof rejected',
  confirmed: 'Confirmed',
  rps_due: 'RPS payment due',
  supplement_due: 'Additional charge due',
}

function Track({ icon, name, state, tone }: { icon: ReactNode; name: string; state: string; tone: 'ok' | 'warn' | 'muted' }) {
  const chip = tone === 'ok' ? 'ktc-chip ktc-chip--success' : tone === 'warn' ? 'ktc-chip ktc-chip--warning' : 'ktc-chip'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span aria-hidden style={{ flex: '0 0 auto', color: tone === 'ok' ? 'var(--ok, #1c9e6b)' : 'hsl(var(--ink-2))', display: 'inline-flex' }}>{icon}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, flex: '1 1 auto' }}>{name}</span>
      <span className={chip} style={{ fontSize: 11 }}>{state}</span>
    </div>
  )
}

export default function ReleaseTracks({ o }: { o: JobOrder }) {
  const { t } = useT()
  const r = releaseState(o)
  if (!r.applicable) return null

  const xrayState = r.serviceComplete
    ? t('Done')
    : r.serviceTotal > 1
      ? t('{done}/{total} services done', { done: r.serviceDone, total: r.serviceTotal })
      : t('Pending')
  const payWarn = r.paymentState === 'rejected' || r.paymentState === 'rps_due' || r.paymentState === 'supplement_due'

  return (
    <div style={{ display: 'grid', gap: 9, padding: '11px 13px', borderRadius: 12, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
      <Track icon={<CreditCardIcon size={15} />} name={t('Payment')} state={t(PAY_LABEL[r.paymentState])}
        tone={r.paymentDone ? 'ok' : payWarn ? 'warn' : 'muted'} />
      <Track icon={<ScanIcon size={15} />} name={t('X-ray')} state={xrayState}
        tone={r.serviceComplete ? 'ok' : 'muted'} />
      <div style={{ height: 1, background: 'var(--glass-brd)', margin: '1px 0' }} />
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700,
        color: r.cleared ? 'var(--ok, #1c9e6b)' : 'hsl(var(--ink-2))',
      }}>
        {r.cleared ? <CheckCircleIcon size={16} /> : <ClockIcon size={16} />}
        {r.cleared ? t('Cleared for release') : t('Awaiting release')}
      </div>
    </div>
  )
}
