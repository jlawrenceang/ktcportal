import type { Broker } from '../lib/types'

// Locked screen for brokers who can't use the portal: rejected or suspended.
// (Pending brokers now get the full portal + BrokerStatusBanner instead.)
export default function PendingPanel({ broker }: { broker: Broker }) {
  const rejected = broker.status === 'rejected'
  return (
    <div className="ktc-glass" style={{ padding: 28 }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>
        {rejected ? 'Account not approved' : 'Account suspended'}
      </h1>
      <p className="ktc-label" style={{ marginTop: 10, lineHeight: 1.6 }}>
        {rejected
          ? 'Your account application was not approved.'
          : 'Your account has been suspended. Please contact KTC for assistance.'}
      </p>

      {broker.decision_reason && (
        <p className="ktc-label" style={{ marginTop: 10, lineHeight: 1.6, padding: '10px 12px', borderRadius: 10, background: 'hsl(0 70% 97%)', border: '1px solid hsl(0 60% 90%)' }}>
          <b>Reason:</b> {broker.decision_reason}
        </p>
      )}
    </div>
  )
}
