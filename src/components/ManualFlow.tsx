import { Fragment } from 'react'
import { useT } from '../lib/i18n'
import { MapIcon } from './icons'

// The "process at a glance" flow window used by the manuals — a highlighted box
// with one or more left-to-right phases of numbered steps joined by arrows, and
// a ↓ connector between phases. Extracted from the customer guide so the staff
// guides can render the same chart from their own step/phase data.
export type FlowStep = { title: string }
export type FlowPhase = { label: string; from: number; to: number }

export default function ManualFlow({
  steps,
  phases,
  label = 'The process at a glance',
}: {
  steps: FlowStep[]
  phases: FlowPhase[]
  label?: string
}) {
  const { t } = useT()
  return (
    <div className="ktc-flow-window">
      <span className="ktc-flow-window-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><MapIcon size={15} /> {t(label)}</span>
      <div className="ktc-phases" aria-hidden>
        {phases.map((ph, pi) => (
          <Fragment key={pi}>
            <div className="ktc-phase">
              <span className="ktc-phase-label">{t(ph.label)}</span>
              <div className="ktc-phase-row">
                {steps.slice(ph.from, ph.to).map((s, j, arr) => {
                  const n = ph.from + j + 1
                  return (
                    <Fragment key={n}>
                      <div className="ktc-phase-box">
                        <span className="ktc-chart-num">{n}</span>
                        <span className="ktc-snake-label">{t(s.title)}</span>
                      </div>
                      {j < arr.length - 1 && <span className="ktc-phase-arrow">→</span>}
                    </Fragment>
                  )
                })}
              </div>
            </div>
            {pi < phases.length - 1 && (
              <div className="ktc-phase-link"><span className="ktc-phase-down">↓</span></div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
