import { Link } from 'react-router-dom'
import Shell from '../components/Shell'
import { useAuth } from '../lib/AuthContext'
import { useBroker } from '../lib/useBroker'

const cards = [
  { to: '/job-order', title: 'New Job Order', desc: 'Submit X-ray / DEA / OOG stripping requests.' },
  { to: '/accreditation', title: 'My Accreditations', desc: 'Request and track consignee accreditations.' },
  { to: '/job-orders', title: 'My Job Orders', desc: 'View previously submitted job orders.' },
]

export default function Home() {
  const { session } = useAuth()
  const { broker } = useBroker()

  return (
    <Shell>
      <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>
          Welcome{session?.user.email ? `, ${session.user.email}` : ''}
        </h1>
        {broker?.customer_code && (
          <p className="ktc-label" style={{ marginTop: 6 }}>
            Your Customer ID: <b style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{broker.customer_code}</b>
          </p>
        )}
        <p className="ktc-label" style={{ marginTop: 8 }}>
          This is the KTC Online Portal. File job orders for terminal services and track their status.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {cards.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="ktc-glass"
            style={{ padding: 22, borderRadius: 'var(--radius-lg)', textDecoration: 'none', color: 'inherit' }}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{c.title}</h2>
            <p className="ktc-label" style={{ marginTop: 6, fontSize: 13 }}>{c.desc}</p>
          </Link>
        ))}
      </div>
    </Shell>
  )
}
