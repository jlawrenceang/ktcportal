import { Navigate } from 'react-router-dom'
import { useBroker } from '../lib/useBroker'
import { hasAdminAccess } from '../lib/types'

// App launch router: send each role to its focused screen. Checker gets the
// custom scan app (/app/checker); other staff land on their existing portal
// pages (already tablet-friendly); admin/owner get the full portal; a customer
// goes to their home.
export default function AppHome() {
  const { broker, loading } = useBroker()
  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <span className="ktc-label">Loading…</span>
      </div>
    )
  }
  if (broker?.staff_role === 'checker') return <Navigate to="/app/checker" replace />
  if (broker?.staff_role === 'cashier') return <Navigate to="/admin/cashier" replace />
  if (broker?.staff_role === 'operations') return <Navigate to="/admin/job-orders" replace />
  if (broker?.staff_role === 'csr') return <Navigate to="/admin/support" replace />
  if (hasAdminAccess(broker)) return <Navigate to="/admin" replace />
  return <Navigate to="/" replace />
}
