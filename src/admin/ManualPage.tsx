import { useState } from 'react'
import AdminShell from './AdminShell'
import { MarkdownBody } from '../components/MarkdownDoc'
import { usePermissions } from '../lib/usePermissions'
import adminBody from '../content/manual-admin.md?raw'
import cashierBody from '../content/manual-cashier.md?raw'
import checkerBody from '../content/manual-checker.md?raw'
import customerBody from '../content/manual-customer.md?raw'

// Staff user manual, role-aware: cashier and checker see their own guide;
// admin/owner default to the admin guide with tabs for every other role
// (handy when walking a customer or floor staff through something).
const GUIDES = [
  { key: 'admin', label: 'Admin', body: adminBody },
  { key: 'cashier', label: 'Cashier', body: cashierBody },
  { key: 'checker', label: 'Checker', body: checkerBody },
  { key: 'customer', label: 'Customer', body: customerBody },
] as const

export default function ManualPage() {
  const { broker } = usePermissions()
  const floorGuide = broker?.staff_role === 'cashier' ? 'cashier'
    : broker?.staff_role === 'checker' ? 'checker' : null
  const [tab, setTab] = useState<(typeof GUIDES)[number]['key']>(floorGuide ?? 'admin')
  const active = floorGuide ?? tab
  const guide = GUIDES.find((g) => g.key === active) ?? GUIDES[0]

  return (
    <AdminShell>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '14px 4px 10px' }}>
        {!floorGuide && GUIDES.map((g) => (
          <button
            key={g.key}
            className={`ktc-nav-link${active === g.key ? ' is-active' : ''}`}
            onClick={() => setTab(g.key)}
          >
            {g.label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="ktc-btn-secondary ktc-btn--sm" onClick={() => window.print()}>🖨️ Print this guide</button>
      </div>
      <div className="ktc-glass" style={{ padding: '30px 32px' }}>
        <MarkdownBody body={guide.body} />
      </div>
    </AdminShell>
  )
}
