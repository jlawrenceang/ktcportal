import type { ReactNode } from 'react'
import AdminShell from '../admin/AdminShell'
import AppLayout from './AppLayout'

// Lets a role page render in either the full admin portal chrome (AdminShell)
// or the focused single-purpose app chrome (AppLayout) from one `app` flag —
// so cashier / CS / operations get a focused screen on BOTH web and the
// installed app without duplicating the page.
//
// DELIBERATE SHORTCUT: cashier / CSR / operations "app" screens reuse the dense
// desktop page inside the slim app chrome rather than a purpose-built layout —
// only the checker scan screen is hand-built for the gate. This trades a tighter
// touch UX for zero page duplication and was an intentional scope decision.
// Purpose-built focused variants per role remain a future option if the reused
// desktop density proves too heavy on a tablet.
export default function RoleShell({ app, title, children }: { app?: boolean; title?: string; children: ReactNode }) {
  return app ? <AppLayout title={title}>{children}</AppLayout> : <AdminShell>{children}</AdminShell>
}
