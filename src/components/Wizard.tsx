import { useState, type ReactNode } from 'react'
import { useIsMobile } from '../lib/useIsMobile'
import { useT } from '../lib/i18n'
import StickyActions from './StickyActions'

export interface WizardStep {
  title: string
  content: ReactNode
  // Return an error string to block advancing past this step (mobile only);
  // null/undefined means the step is valid.
  validate?: () => string | null | undefined
}

// Responsive multi-step form. On desktop it renders every step stacked (one
// scrollable form, single submit) so the roomy layout is unchanged. On phones
// it paginates — one step per screen, Back/Next with progress dots and a
// sticky action bar — so each screen fits without scrolling and the primary
// button is always reachable. Same children either way.
export default function Wizard({
  steps, onSubmit, submitLabel, busy = false, error, footer,
}: {
  steps: WizardStep[]
  onSubmit: () => void
  submitLabel: string
  busy?: boolean
  error?: string | null
  footer?: ReactNode // extra content above the action bar (e.g. notices, switch-mode link)
}) {
  const isMobile = useIsMobile()
  const { t } = useT()
  const [i, setI] = useState(0)
  const [stepErr, setStepErr] = useState<string | null>(null)
  const last = i === steps.length - 1

  // ---- Desktop: the full form, stacked — visually the same single-page form
  // (no step chrome), just one scroll and one submit. ----
  if (!isMobile) {
    return (
      <div>
        <div style={{ display: 'grid', gap: 16 }}>
          {steps.map((s, n) => <div key={n}>{s.content}</div>)}
        </div>
        {error && <div style={{ color: 'var(--acc-2)', fontSize: 13, marginTop: 14 }}>{error}</div>}
        {footer}
        <StickyActions>
          <button className="ktc-btn" type="button" onClick={onSubmit} disabled={busy}>{submitLabel}</button>
        </StickyActions>
      </div>
    )
  }

  // ---- Mobile: one step at a time ----
  const s = steps[i]
  function next() {
    const e = s.validate?.()
    if (e) { setStepErr(e); return }
    setStepErr(null)
    setI((v) => Math.min(v + 1, steps.length - 1))
  }
  function back() { setStepErr(null); setI((v) => Math.max(v - 1, 0)) }

  return (
    <div>
      <div className="ktc-step-head">
        <div className="ktc-dots" aria-hidden>
          {steps.map((_, n) => (
            <span key={n} className={`ktc-dot${n === i ? ' is-on' : n < i ? ' is-done' : ''}`} />
          ))}
        </div>
        <span className="ktc-label" style={{ fontSize: 12, marginLeft: 'auto' }}>{t('Step {n} of {total}', { n: i + 1, total: steps.length })}</span>
      </div>

      <h2 className="ktc-title" style={{ fontSize: 18, marginBottom: 14 }}>{t(s.title)}</h2>
      {s.content}

      {(stepErr || (last && error)) && (
        <div style={{ color: 'var(--acc-2)', fontSize: 13, marginTop: 12 }}>{stepErr || error}</div>
      )}
      {last && footer}

      <StickyActions>
        {i > 0 && (
          <button className="ktc-btn-secondary" type="button" onClick={back} style={{ flex: '0 0 auto' }}>{t('← Back')}</button>
        )}
        {last ? (
          <button className="ktc-btn" type="button" onClick={onSubmit} disabled={busy} style={{ flex: 1 }}>{submitLabel}</button>
        ) : (
          <button className="ktc-btn" type="button" onClick={next} style={{ flex: 1 }}>{t('Next →')}</button>
        )}
      </StickyActions>
    </div>
  )
}
