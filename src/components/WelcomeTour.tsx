import Tour, { type TourStep } from './Tour'

// First-login walkthrough for new customers (also re-openable from Home).
// Six short cards explaining the filing → serving number → payment →
// release flow. Dismissal is remembered per browser. The card UI itself
// lives in Tour.tsx, shared with the per-role staff tours.

const TOUR_KEY = 'ktc_tour_done'

export function tourSeen(): boolean {
  try { return localStorage.getItem(TOUR_KEY) === '1' } catch { return true }
}
export function markTourSeen() {
  try { localStorage.setItem(TOUR_KEY, '1') } catch { /* ignore */ }
}

const STEPS: TourStep[] = [
  {
    icon: '👋',
    title: 'Welcome to the KTC Online Portal',
    body: 'File Job Orders for X-ray, DEA exam, and OOG stripping from anywhere — no more queueing at the office to file paperwork. This quick tour shows how it works (about 30 seconds).',
  },
  {
    icon: '🪪',
    title: '1 · Get verified once',
    body: 'Upload a valid government ID (banner on your home page) and a KTC admin verifies your account. You can already file job orders while you wait — they\'re kept on hold and sent to KTC automatically the moment you\'re approved.',
  },
  {
    icon: '📝',
    title: '2 · File a Job Order',
    body: 'Pick the consignee (type to search the master list), enter your entry number, and add containers — paste a whole list at once with Bulk paste. Each container gets the service it needs.',
  },
  {
    icon: '🎫',
    title: '3 · Your number in line',
    body: 'Each service (X-ray, DEA, OOG) runs a weekly queue. Your order gets a serving number per line — watch the "Now serving" board on My Job Orders to time your trip to the terminal. The number resets every Monday.',
  },
  {
    icon: '💳',
    title: '4 · Charges & payment',
    body: 'Estimate fees anytime with the Rate Calculator. After filing, open "View charges & pay" to see the exact computation, KTC\'s bank/GCash details and QR — pay online and upload your deposit slip, or pay at the KTC cashier as usual.',
  },
  {
    icon: '🖨️',
    title: '5 · Print the slip & release',
    body: 'Once processing starts, print the A6 job-order slip (JO number + line number) and bring it to the terminal. The container is released once the Service Invoice is issued — track every status live on My Job Orders.',
  },
]

export default function WelcomeTour({ onClose }: { onClose: () => void }) {
  function close() {
    markTourSeen()
    onClose()
  }
  return <Tour steps={STEPS} onClose={close} />
}
