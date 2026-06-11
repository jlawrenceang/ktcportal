import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useBroker } from '../lib/useBroker'
import { isStaff } from '../lib/types'

// Gate for the back office: owner, admin, and restricted staff roles
// (cashier/checker) all enter — what they can see/do inside is decided by
// the permission gates (usePermissions UI-side, has_permission() backend-side).
export default function AdminRoute({ children }: { children: ReactNode }) {
  const { broker, loading } = useBroker()
  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <span className="ktc-label">Loading…</span>
      </div>
    )
  }
  if (!isStaff(broker)) return <Navigate to="/" replace />
  return <>{children}</>
}
