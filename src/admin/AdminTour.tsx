import Tour, { type TourStep } from '../components/Tour'
import type { Broker } from '../lib/types'

// Per-role staff walkthroughs (mirror of the customer WelcomeTour): admin/
// owner, cashier and checker each get their own steps, auto-opened on the
// first admin-portal visit and re-openable from the "✨ Tour" nav button.
// Dismissal is remembered per browser, per role — so a shared floor tablet
// that switches from checker to admin still shows the right tour once.

export type StaffTourRole = 'admin' | 'cashier' | 'checker'

export function staffTourRole(b: Pick<Broker, 'staff_role' | 'is_admin' | 'is_owner'> | null | undefined): StaffTourRole | null {
  if (!b) return null
  if (b.staff_role === 'cashier') return 'cashier'
  if (b.staff_role === 'checker') return 'checker'
  if (b.is_admin || b.is_owner) return 'admin'
  return null
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
    icon: '🧭',
    title: 'Welcome to the KTC admin portal',
    body: 'The Dashboard shows the live picture: pending approvals, the open job-order queue, and customer counts. Every tile links to the page where the work happens. This tour takes about a minute — the full details live in the Manual tab.',
  },
  {
    icon: '✅',
    title: '1 · Verify new customers',
    body: 'Approvals lists accounts waiting for verification with their consent badges. View or download the uploaded valid ID, then Approve (releases their held orders and emails them) or Reject — recoverable ("fix and resubmit") or Suspend (terminal). IDs auto-delete 3 days after upload.',
  },
  {
    icon: '⚙️',
    title: '2 · Process job orders',
    body: 'Job Orders is the working queue. Tick each service line ✓ as it\'s done — the order completes when all lines are done. Need info? Hold with a note (customer responds in-app and keeps their line number). Reject sends them to the back of the line on refile — ↩ Restore can give the old number back. 🕘 shows the full history.',
  },
  {
    icon: '💳',
    title: '3 · Payments & invoices',
    body: 'Customers upload deposit slips — review them from the queue (Confirm or Reject with a note; they\'re emailed either way). When the ERP issues the Service Invoice, record BOTH numbers (control no. + printed pad serial): OR = PAID, BI = BILLED. The "Unpaid · completed" view shows what\'s aging.',
  },
  {
    icon: '📝',
    title: '4 · File on behalf & manage data',
    body: 'New JO files a job order for a walk-in customer — it goes straight to submitted with a serving number, and History records you as the filer. Customers and Consignees manage the master records behind the forms.',
  },
  {
    icon: '🛡️',
    title: '5 · Settings, logs & security',
    body: 'Settings holds service rates (unlock to edit), the service catalogue, payment details, staff accounts and role gates. Logs shows every order event, security event, client error and email. Protect your account: enroll 2FA in the 2FA tab — sessions time out after 60 idle minutes and each account allows one active session.',
  },
]

const CASHIER_STEPS: TourStep[] = [
  {
    icon: '👋',
    title: 'Welcome — cashier station',
    body: 'You land on the Job Orders queue: that\'s your whole workspace. Your account sees exactly what the cashier role needs — this tour shows the two jobs you\'ll do all day (about 30 seconds).',
  },
  {
    icon: '🧾',
    title: '1 · Review payment proofs',
    body: 'Orders with "Payment proof to review" carry an uploaded deposit slip. Open it (the viewer can Print or Save), check the amount against the order\'s charges, then Confirm — or Reject with a short note saying what\'s wrong; the customer is emailed and can re-upload.',
  },
  {
    icon: '🔢',
    title: '2 · Record the Service Invoice',
    body: 'When the ERP issues the invoice, record BOTH numbers on the completed order: the control no. (OR-INV-… / BI-INV-…) and the printed pad serial (e.g. 001323). OR marks it PAID, BI marks it BILLED (credit). The "Unpaid · completed" view lists what still needs one, with aging chips.',
  },
  {
    icon: '🔐',
    title: 'Your session',
    body: 'The station signs out after 60 idle minutes — a "still there?" prompt appears a minute early; one tap keeps it alive. Each account has one active session: signing in elsewhere signs this station out. Questions? Open the Manual tab for the full cashier guide.',
  },
]

const CHECKER_STEPS: TourStep[] = [
  {
    icon: '👋',
    title: 'Welcome — X-ray checker station',
    body: 'You land on the X-ray Checker queue: orders waiting for X-ray, sorted by their line number, with the "Now serving" strip on top. This tour is 3 cards long.',
  },
  {
    icon: '🔎',
    title: '1 · Look up a container',
    body: 'Type a container number to see its card: NOT CLEARED · X-ray pending means it\'s waiting; CLEARED shows the exact date and time it passed. Use this when a trucker asks about a box.',
  },
  {
    icon: '✅',
    title: '2 · Confirm X-ray done',
    body: 'When a container passes the X-ray, hit Confirm — it stamps the date/time, the order leaves your queue, and it completes automatically once its other services (if any) are done too.',
  },
  {
    icon: '🔐',
    title: 'Your session',
    body: 'The tablet signs out after 60 idle minutes — a "still there?" prompt shows up a minute early; one tap keeps it alive. Each account has one active session: signing in elsewhere signs this tablet out. The Manual tab has the full guide.',
  },
]

const STEPS: Record<StaffTourRole, TourStep[]> = {
  admin: ADMIN_STEPS,
  cashier: CASHIER_STEPS,
  checker: CHECKER_STEPS,
}

export default function AdminTour({ role, onClose }: { role: StaffTourRole; onClose: () => void }) {
  function close() {
    markStaffTourSeen(role)
    onClose()
  }
  return <Tour steps={STEPS[role]} onClose={close} label={`${role} quick tour`} />
}
