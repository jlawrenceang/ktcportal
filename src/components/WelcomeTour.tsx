import { type TourStep } from './Tour'

// Customer walkthrough steps (launched via useTour().startTour from Home).
// Each step navigates to the page and spotlights its nav link; returns Home.

const TOUR_KEY = 'ktc_tour_done'

export function tourSeen(): boolean {
  try { return localStorage.getItem(TOUR_KEY) === '1' } catch { return true }
}
export function markTourSeen() {
  try { localStorage.setItem(TOUR_KEY, '1') } catch { /* ignore */ }
}

export const customerSteps: TourStep[] = [
  {
    icon: '👋',
    title: 'Welcome to the KTC Online Portal',
    body: 'File Job Orders for X-ray, DEA exam, and OOG stripping from anywhere — no more queueing at the office. This quick tour walks you through it (about 30 seconds).',
  },
  {
    icon: '🪪',
    title: '1 · Get verified once',
    body: 'Upload a valid government ID (banner on this home page) and a KTC admin verifies your account. You can already file job orders while you wait — they\'re held and sent to KTC automatically the moment you\'re approved.',
  },
  {
    icon: '📝',
    title: '2 · File a Job Order',
    body: 'Pick the consignee (type to search), choose the vessel & voyage, enter your entry number, and add containers — paste a whole list at once with Bulk paste.',
    to: '/job-order',
    target: 'a[href="/job-order"]',
  },
  {
    icon: '🎫',
    title: '3 · Your number in line',
    body: 'Each service runs a weekly queue; your order gets a serving number per line. Watch the "Now serving" board on My Job Orders to time your trip to the terminal.',
    to: '/job-orders',
    target: 'a[href="/job-orders"]',
  },
  {
    icon: '💳',
    title: '4 · Charges & payment',
    body: 'Estimate fees anytime with the Rate Calculator. After filing, "View charges & pay" shows the exact total, KTC\'s bank/GCash details and QR — pay online and upload your slip, or pay at the cashier.',
    to: '/calculator',
    target: 'a[href="/calculator"]',
  },
  {
    icon: '🖨️',
    title: '5 · Print the slip & release',
    body: 'Once processing starts, print the A6 job-order slip (JO number + line number) and bring it to the terminal. Track every status live on My Job Orders.',
    to: '/job-orders',
    target: 'a[href="/job-orders"]',
  },
]
