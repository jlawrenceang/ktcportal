import { useNavigate } from 'react-router-dom'
import Shell from '../components/Shell'
import ProtectedDoc from '../components/ProtectedDoc'
import { useT } from '../lib/i18n'

// Customer Guide — the customer's journey as a numbered flow (overview) with a
// detailed description of each step underneath. View-only (ProtectedDoc). The
// staff/admin guide is separate (/admin/manual).
const STEPS: { title: string; body: string }[] = [
  { title: 'Create your account', body: 'Sign up with your full name, contact number, email, and a password. Read and accept the KTC Customer Agreement to continue.' },
  { title: 'Confirm your email', body: 'We email you a confirmation link — click it to activate your account. You can resend it from the sign-in page if it doesn’t arrive.' },
  { title: 'Get verified', body: 'Upload a valid government ID. A KTC admin reviews and approves your account. You can start filing while you wait, but your orders are held until you’re approved.' },
  { title: 'File a Job Order', body: 'Choose the consignee, enter the Entry Number (C-…), pick the vessel & voyage, then add your container numbers and the service each one needs (X-ray, DEA, or OOG stripping).' },
  { title: 'Get your serving number', body: 'Once filed, each service line is given a “now serving” queue number. Follow the live status of every order under the Orders tab.' },
  { title: 'View charges & pay', body: 'Open the order to see the fee breakdown, transfer using the bank / GCash details shown, and upload your payment slip. KTC reviews and confirms it.' },
  { title: 'KTC processes your order', body: 'KTC performs the service and moves the order from Processing to Completed. You’re notified of holds, rejections, or anything that needs your attention.' },
  { title: 'Print & claim', body: 'Once approved, print the Job Order slip and present it at the terminal to claim your Official Receipt and proceed with the service.' },
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

          {/* Flow overview — top-down box diagram */}
          <div className="ktc-chart" aria-hidden>
            {STEPS.map((s, i) => (
              <div className="ktc-chart-step" key={i}>
                <div className="ktc-chart-box">
                  <span className="ktc-chart-num">{i + 1}</span>
                  <span className="ktc-chart-text">{t(s.title)}</span>
                </div>
                {i < STEPS.length - 1 && <span className="ktc-chart-arrow">↓</span>}
              </div>
            ))}
          </div>

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
        </div>
      </ProtectedDoc>
    </Shell>
  )
}
