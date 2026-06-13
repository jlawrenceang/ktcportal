import { type TourStep } from '../components/Tour'
import type { Broker } from '../lib/types'

// Per-role staff walkthrough steps (launched via useTour().startTour from
// AdminShell). Each step navigates to its page and spotlights the nav link;
// returns to the role's home. Dismissal is remembered per browser, per role.

export type StaffTourRole = 'admin' | 'operations' | 'cashier' | 'checker'

export function staffTourRole(b: Pick<Broker, 'staff_role' | 'is_admin' | 'is_owner'> | null | undefined): StaffTourRole | null {
  if (!b) return null
  if (b.staff_role === 'operations') return 'operations'
  if (b.staff_role === 'cashier') return 'cashier'
  if (b.staff_role === 'checker') return 'checker'
  if (b.is_admin || b.is_owner) return 'admin'
  return null
}

export function staffTourHome(role: StaffTourRole): string {
  if (role === 'cashier') return '/admin/job-orders'
  if (role === 'operations' || role === 'checker') return '/admin/checker'
  return '/admin'
}

const keyFor = (role: StaffTourRole) => `ktc_tour_done_${role}`
export function staffTourSeen(role: StaffTourRole): boolean {
  try { return localStorage.getItem(keyFor(role)) === '1' } catch { return true }
}
export function markStaffTourSeen(role: StaffTourRole) {
  try { localStorage.setItem(keyFor(role), '1') } catch { /* ignore */ }
}

const ADMIN_STEPS: TourStep[] = [
  {
    icon: '🧭', title: 'Welcome to the KTC admin portal',
    body: 'The Dashboard shows the live picture: pending approvals, the open job-order queue, and customer counts. Every tile links to where the work happens. This tour walks the main jobs — the full details live in the Manual tab.',
  },
  {
    icon: '✅', title: '1 · Verify new customers', to: '/admin/approvals', target: 'a[href="/admin/approvals"]',
    body: 'Approvals lists accounts awaiting verification with consent badges. View the uploaded valid ID, then Approve (releases their held orders + emails them) or Reject — recoverable or Suspend. IDs auto-delete 3 days after upload.',
  },
  {
    icon: '⚙️', title: '2 · Process job orders', to: '/admin/job-orders', target: 'a[href="/admin/job-orders"]',
    body: 'Job Orders is the working queue. Tick each service line ✓ as it\'s done — the order completes when all lines are done. Hold with a note, or Reject. 🕘 shows the full history.',
  },
  {
    icon: '💳', title: '3 · Payments & invoices', to: '/admin/job-orders', target: 'a[href="/admin/job-orders"]',
    body: 'Review deposit slips from the queue (X-ray and RPS payments are confirmed separately). When the ERP issues the Service Invoice, record both numbers: OR = PAID, BI = BILLED.',
  },
  {
    icon: '📝', title: '4 · File on behalf', to: '/admin/new-job-order', target: 'a[href="/admin/new-job-order"]',
    body: 'New JO files a job order for a walk-in customer — it goes straight to submitted with a serving number, and History records you as the filer.',
  },
  {
    icon: '🛡️', title: '5 · Settings, logs & security', to: '/admin/settings', target: 'a[href="/admin/settings"]',
    body: 'Settings holds rates & fees, free-days, RPS move rates, payment details, staff accounts and role gates. Logs shows every event. Enroll 2FA, and remember sessions time out after 60 idle minutes.',
  },
]

const OPERATIONS_STEPS: TourStep[] = [
  {
    icon: '👋', title: 'Welcome — operations',
    body: 'You land on the X-ray Checker queue. Your three jobs: assess each order for X-ray / port-services, confirm the X-ray is done, and keep the vessel schedule current. This tour walks each one.',
  },
  {
    icon: '🧪', title: '1 · Assess each order (RPS)', to: '/admin/checker', target: 'a[href="/admin/checker"]',
    body: 'On an order card, tap Assess RPS: choose "No RPS needed" for a plain X-ray, or — if it needs port-services moves (lift on, trucking, shifting, stripping, stuffing) — enter the move counts from the RPS and Save. Those bill per move. Most orders need none.',
  },
  {
    icon: '✅', title: '2 · Confirm X-ray done', to: '/admin/checker', target: 'a[href="/admin/checker"]',
    body: 'When a container passes the X-ray, hit Confirm — it stamps the date/time and the order leaves your queue. Look up any container or JO number to answer "is this box cleared?"',
  },
  {
    icon: '🚢', title: '3 · Keep vessels current', to: '/admin/vessel-schedule', target: 'a[href="/admin/vessel-schedule"]',
    body: 'The Vessels tab is yours: add or CSV-import calls (Last Free Day computes itself, past calls drop off). Customers can only file against current vessels. 📸 Snapshot shares the active list to your Viber group.',
  },
]

const CASHIER_STEPS: TourStep[] = [
  {
    icon: '👋', title: 'Welcome — cashier station',
    body: 'You land on the Job Orders queue — your whole workspace. This tour shows the two jobs you\'ll do all day (about 30 seconds).',
  },
  {
    icon: '🧾', title: '1 · Review payment proofs', to: '/admin/job-orders', target: 'a[href="/admin/job-orders"]',
    body: 'Orders with "X-ray payment to review" / "RPS payment to review" carry an uploaded slip. Open it, check the amount, then Confirm — or Reject with a short note; the customer is emailed and can re-upload.',
  },
  {
    icon: '🔢', title: '2 · Record the Service Invoice', to: '/admin/job-orders', target: 'a[href="/admin/job-orders"]',
    body: 'When the ERP issues the invoice, record both numbers on the completed order: the control no. (OR-INV / BI-INV) and the printed pad serial. OR = PAID, BI = BILLED.',
  },
  {
    icon: '🔐', title: 'Your session',
    body: 'The station signs out after 60 idle minutes — a "still there?" prompt appears a minute early. Each account has one active session. The Manual tab has the full cashier guide.',
  },
]

const CHECKER_STEPS: TourStep[] = [
  {
    icon: '👋', title: 'Welcome — X-ray checker station',
    body: 'You land on the X-ray Checker queue: orders waiting for X-ray, sorted by line number, with the "Now serving" strip on top.',
  },
  {
    icon: '🔎', title: '1 · Look up a container', to: '/admin/checker', target: 'a[href="/admin/checker"]',
    body: 'Type a container number to see its card: NOT CLEARED · X-ray pending means it\'s waiting; CLEARED shows the date and time it passed. Use this when a trucker asks about a box.',
  },
  {
    icon: '✅', title: '2 · Confirm X-ray done', to: '/admin/checker', target: 'a[href="/admin/checker"]',
    body: 'When a container passes the X-ray, hit Confirm — it stamps the date/time, the order leaves your queue, and completes once its other services (if any) are done too.',
  },
  {
    icon: '🔐', title: 'Your session',
    body: 'The tablet signs out after 60 idle minutes — a "still there?" prompt shows up a minute early. Each account has one active session. The Manual tab has the full guide.',
  },
]

export const staffSteps: Record<StaffTourRole, TourStep[]> = {
  admin: ADMIN_STEPS,
  operations: OPERATIONS_STEPS,
  cashier: CASHIER_STEPS,
  checker: CHECKER_STEPS,
}
