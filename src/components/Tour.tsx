import { useState } from 'react'

// Generic step-card walkthrough (extracted from the original customer
// WelcomeTour so every role can have one). Pure frontend; the caller owns
// open/close state and any "seen" persistence.

export interface TourStep {
  icon: string
  title: string
  body: string
}

export default function Tour({ steps, onClose, label = 'Quick tour' }: { steps: TourStep[]; onClose: () => void; label?: string }) {
  const [step, setStep] = useState(0)
  const s = steps[step]
  const last = step === steps.length - 1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
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
          {steps.map((_, i) => (
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
            onClick={() => (last ? onClose() : setStep(step + 1))}
          >
            {last ? "Let's go 🚀" : 'Next →'}
          </button>
        </div>
        {!last && (
          <button type="button" className="ktc-link" onClick={onClose} style={{ fontSize: 12.5, display: 'block', margin: '12px auto 0' }}>
            Skip the tour
          </button>
        )}
      </div>
    </div>
  )
}
