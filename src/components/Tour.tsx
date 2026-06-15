import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../lib/i18n'

// Guided walkthrough: each step can navigate to a page (`to`) and spotlight an
// element (`target`, a CSS selector — usually a nav link). It returns to `home`
// when finished/skipped. Rendered by TourProvider ABOVE the routes so it stays
// mounted while it navigates between pages.

export interface TourStep {
  icon: string
  title: string
  body: string
  to?: string      // navigate here for this step
  target?: string  // CSS selector to spotlight (e.g. `a[href="/admin/approvals"]`)
  // Side-effect to run when this step becomes active — e.g. advance a multi-step
  // form so the element this step spotlights is actually mounted (the New Job
  // Order wizard paginates on mobile, so the tour drives it step by step).
  onEnter?: () => void
}

export default function Tour({ steps, onClose, label = 'Quick tour', home }: {
  steps: TourStep[]; onClose: () => void; label?: string; home?: string
}) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const navigate = useNavigate()
  const { t } = useT()
  const s = steps[step]
  const last = step === steps.length - 1

  // Navigate to this step's page.
  useEffect(() => {
    if (s.to) navigate(s.to)
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // Spotlight this step's target: bring the featured element up near the top of
  // the screen (so it's the hero), then keep the spotlight ring in sync. The
  // helper card sits at the bottom (see cardPos). The scroll happens ONCE per
  // step; the listeners only re-measure the ring (no re-scroll loop).
  useEffect(() => {
    setRect(null)
    // Let this step drive any external UI first (e.g. advance the wizard so the
    // spotlighted field is mounted), THEN find + spotlight the target.
    s.onEnter?.()
    if (!s.target) return
    const sel = s.target
    let cancelled = false
    let scrolled = false
    const measure = () => {
      if (cancelled) return
      const el = document.querySelector(sel) as HTMLElement | null
      if (!el) return
      if (!scrolled) {
        scrolled = true
        const y = window.scrollY + el.getBoundingClientRect().top - 96 // clear the sticky nav
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' })
      }
      setRect(el.getBoundingClientRect())
    }
    // Retry a few times: a target revealed by onEnter (wizard step change) mounts
    // a frame or two later, so a single measure could miss it.
    const timers = [80, 240, 420, 700].map((d) => setTimeout(measure, d))
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  function finish() {
    if (home) navigate(home)
    onClose()
  }

  const pad = 6
  // Featured element rides at the top; the helper card sits at the bottom of the
  // screen. With no target (welcome step) the card is centered.
  const cardPos: Record<string, number | string> = rect
    ? { bottom: 24 }
    : { top: '50%', marginTop: -150 }

  return (
    <>
      {/* Click-away to skip. When spotlighting, the spotlight ring dims the page itself. */}
      <div onClick={finish} aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 59,
        background: rect ? 'transparent' : 'rgba(20, 24, 32, 0.45)',
        backdropFilter: rect ? undefined : 'blur(6px)',
      }} />
      {rect && (
        <div aria-hidden style={{
          position: 'fixed', top: rect.top - pad, left: rect.left - pad,
          width: rect.width + pad * 2, height: rect.height + pad * 2, borderRadius: 12,
          boxShadow: '0 0 0 3px var(--acc), 0 0 0 9999px rgba(20, 24, 32, 0.55)',
          pointerEvents: 'none', zIndex: 60, transition: 'all 0.25s ease',
        }} />
      )}
      <div
        role="dialog" aria-modal="true" aria-label={label}
        className="ktc-glass ktc-rise"
        style={{
          position: 'fixed', zIndex: 61, left: '50%', transform: 'translateX(-50%)',
          maxWidth: 420, width: 'calc(100% - 40px)', padding: '24px 26px 20px',
          background: 'rgba(255,255,255,0.96)',
          ...cardPos,
        }}
      >
        <div aria-hidden style={{ fontSize: 34, lineHeight: 1 }}>{s.icon}</div>
        <h2 style={{ margin: '12px 0 0', fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>{t(s.title)}</h2>
        <p className="ktc-label" style={{ marginTop: 9, fontSize: 13.5, lineHeight: 1.6 }}>{t(s.body)}</p>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', margin: '16px 0' }} aria-hidden>
          {steps.map((_, i) => (
            <span key={i} style={{
              width: i === step ? 22 : 7, height: 7, borderRadius: 999, transition: 'all 0.25s ease',
              background: i === step ? 'var(--acc)' : 'rgba(0,0,0,0.15)',
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {step > 0 && (
            <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => setStep(step - 1)}>{t('← Back')}</button>
          )}
          <button type="button" className="ktc-btn" style={{ flex: 1 }} onClick={() => (last ? finish() : setStep(step + 1))}>
            {last ? t('Done 🚀') : t('Next →')}
          </button>
        </div>
        {!last && (
          <button type="button" className="ktc-link" onClick={finish} style={{ fontSize: 12.5, display: 'block', margin: '10px auto 0' }}>
            {t('Skip the tour')}
          </button>
        )}
      </div>
    </>
  )
}
