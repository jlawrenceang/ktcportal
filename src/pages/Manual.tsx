import { Link, useNavigate } from 'react-router-dom'
import Shell from '../components/Shell'
import ProtectedDoc from '../components/ProtectedDoc'
import ManualFlow from '../components/ManualFlow'
import { WatchWalkthroughButton } from '../components/Walkthrough'
import { useT } from '../lib/i18n'

// Customer Guide — the customer's journey as a two-phase flow overview with a
// detailed description of each step underneath. View-only (ProtectedDoc). The
// staff/admin guide is separate (/admin/manual).
const STEPS: { title: string; body: string }[] = [
  { title: 'Create your account', body: 'Sign up with your full name, contact number, email, and a password. Read and accept the KTC Customer Agreement to continue.' },
  { title: 'Confirm your email', body: 'We email you a confirmation link — click it to activate your account. You can resend it from the sign-in page if it doesn’t arrive.' },
  { title: 'Get verified', body: 'Upload a valid government ID. A KTC admin reviews and approves your account. You can start filing while you wait, but your orders are held until you’re approved.' },
  { title: 'File a Job Order', body: 'Choose the consignee, enter the Entry Number (C-…), pick the vessel & voyage, then add your container numbers and the service each one needs.' },
  { title: 'Track your orders by batch', body: 'Once filed, your orders are grouped by the day you filed them (today’s batch, yesterday’s, and so on). Follow the live status of every order under the Orders tab — there’s no serving number to wait on.' },
  { title: 'View charges & pay', body: 'Open the order to see the fee breakdown, transfer using the official account details shown, and upload your payment slip. KTC admin reviews and confirms it.' },
  { title: 'KTC processes your order', body: 'KTC performs the service and moves the order from Processing to Completed. You’re notified of holds, rejections, or anything that needs your attention.' },
  { title: 'Print & claim', body: 'Once approved, print the Job Order slip and present it at the terminal to claim your Official Receipt and get document clearance.' },
]

// Two phases for the overview — each reads left-to-right (numbers stay in
// order); a prominent connector links them.
const PHASES = [
  { label: 'Set up & file', from: 0, to: 4 },
  { label: 'Track, pay & claim', from: 4, to: 8 },
]

export default function Manual() {
  const { t } = useT()
  const navigate = useNavigate()

  return (
    <Shell>
      <button className="ktc-link" onClick={() => navigate(-1)} style={{ margin: '14px 4px 6px', fontSize: 13, fontWeight: 600 }}>← {t('Back')}</button>
      <ProtectedDoc>
        <div className="ktc-glass" style={{ padding: '28px 30px' }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>{t('KTC Customer Guide')}</h1>
          <p className="ktc-sub" style={{ marginTop: 0 }}>
            {t('How the KTC Online Portal works — from sign-up to claiming your service, step by step.')}
          </p>

          <WatchWalkthroughButton className="ktc-btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 'auto', marginBottom: 6 }} />

          {/* Flow overview — highlighted window, two left-to-right phases */}
          <ManualFlow steps={STEPS} phases={PHASES} />

          {/* Detailed steps */}
          <div className="ktc-guide-steps">
            {STEPS.map((s, i) => (
              <div className="ktc-guide-step" key={i}>
                <span className="ktc-guide-step-num">{i + 1}</span>
                <div className="ktc-guide-step-body">
                  <h3>{t(s.title)}</h3>
                  <p>{t(s.body)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Legal — the agreement lives here (not in the page footer). */}
          <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--glass-brd)' }}>
            <p className="ktc-sub" style={{ margin: 0, fontSize: 13 }}>
              {t('Looking for the legal terms?')}{' '}
              <Link to="/agreement" className="ktc-link">{t('Read the KTC Customer Agreement')}</Link>.
            </p>
          </div>
        </div>
      </ProtectedDoc>
    </Shell>
  )
}
