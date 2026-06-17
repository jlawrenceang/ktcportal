import type { ReactNode } from 'react'
import AdminShell from '../admin/AdminShell'
import AppLayout from './AppLayout'

// Lets a role page render in either the full admin portal chrome (AdminShell)
// or the focused single-purpose app chrome (AppLayout) from one `app` flag —
// so cashier / CS / operations get a focused screen on BOTH web and the
// installed app without duplicating the page.
export default function RoleShell({ app, title, children }: { app?: boolean; title?: string; children: ReactNode }) {
  return app ? <AppLayout title={title}>{children}</AppLayout> : <AdminShell>{children}</AdminShell>
}
