import { useState } from 'react'

// First-login walkthrough for new customers (also re-openable from Home).
// Pure frontend — six short cards explaining the filing → serving number →
// payment → release flow. Dismissal is remembered per browser.

const TOUR_KEY = 'ktc_tour_done'

export function tourSeen(): boolean {
  try { return localStorage.getItem(TOUR_KEY) === '1' } catch { return true }
}
export function markTourSeen() {
  try { localStorage.setItem(TOUR_KEY, '1') } catch { /* ignore */ }
}

const STEPS: { icon: string; title: string; body: string }[] = [
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
  const [step, setStep] = useState(0)
  const s = STEPS[step]
  const last = step === STEPS.length - 1

  function close() {
    markTourSeen()
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick tour"
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, display: 'grid', placeItems: 'center',
        background: 'rgba(20, 24, 32, 0.45)', backdropFilter: 'blur(6px)', padding: 20,
      }}
    >
      <div
        className="ktc-glass ktc-rise"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 430, width: '100%', padding: '30px 30px 24px', background: 'rgba(255,255,255,0.94)' }}
      >
        <div aria-hidden style={{ fontSize: 40, lineHeight: 1 }}>{s.icon}</div>
        <h2 style={{ margin: '14px 0 0', fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>{s.title}</h2>
        <p className="ktc-label" style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.65, minHeight: 88 }}>{s.body}</p>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', margin: '18px 0' }} aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} style={{
              width: i === step ? 22 : 7, height: 7, borderRadius: 999, transition: 'all 0.25s ease',
              background: i === step ? 'var(--acc)' : 'rgba(0,0,0,0.15)',
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {step > 0 && (
            <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => setStep(step - 1)}>← Back</button>
          )}
          <button
            type="button"
            className="ktc-btn"
            style={{ flex: 1 }}
            onClick={() => (last ? close() : setStep(step + 1))}
          >
            {last ? "Let's go 🚀" : 'Next →'}
          </button>
        </div>
        {!last && (
          <button type="button" className="ktc-link" onClick={close} style={{ fontSize: 12.5, display: 'block', margin: '12px auto 0' }}>
            Skip the tour
          </button>
        )}
      </div>
    </div>
  )
}
