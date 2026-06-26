import { Link } from 'react-router-dom'
import { useT } from '../lib/i18n'
import LangToggle from '../components/LangToggle'
import NeedHelp from '../components/NeedHelp'
import { VERSION_LABEL, VERSION_FULL } from '../version'

// Public landing — what an unauthenticated visitor sees at "/" (App routes a
// signed-in session straight to the role landing instead). Orientation +
// services + two clear paths in (Sign in / Create account). No forced "accept"
// gate: legal consent lives at sign-up (the Customer Agreement scroll-consent),
// not here. Matches the app's glass identity; the SERVICES are the hero.

const SERVICES: { key: string; title: string; body: string }[] = [
  {
    key: 'jo',
    title: 'Job Orders',
    body: 'Request special services — X-Ray, DEA exam, OOG stripping — and track each order through to completion.',
  },
  {
    key: 'release',
    title: 'Container Release & Pull-out',
    body: 'File your delivery documents, settle the assessed charges online, then claim your Official Receipt at the KTC office.',
  },
  {
    key: 'pay',
    title: 'Online Payments',
    body: "See the computed charges plus KTC's bank and QRPH details, then upload your proof for the cashier to confirm.",
  },
  {
    key: 'vessel',
    title: 'Vessel Schedule & Rates',
    body: 'Check vessel calls and last free days, and estimate charges with the rate calculator.',
  },
]

export default function Landing() {
  const { t } = useT()
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100%', padding: 24 }}>
      <main className="ktc-glass ktc-rise" style={{ width: '100%', maxWidth: 620, padding: '32px 34px 28px' }}>
        {/* Header — logo + language */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 22 }}>
          <img src="/ktc-logo.png" alt="KTC Container Terminal Corp" style={{ height: 52 }} />
          <LangToggle />
        </div>

        {/* Hero — what it is, who it's for */}
        <h1 className="ktc-title" style={{ fontSize: 27, letterSpacing: '-0.02em', margin: 0 }}>
          {t('KTC Online Portal')}
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 15, lineHeight: 1.55, color: 'hsl(var(--ink-2))' }}>
          {t('The online service desk of KTC Container Terminal Corp. — where accredited customers, consignees, and KTC staff file and track terminal and port-services work.')}
        </p>

        {/* Services — the hero content, hairline-separated */}
        <ul style={{ listStyle: 'none', margin: '24px 0 4px', padding: 0, borderTop: '1px solid var(--glass-brd)' }}>
          {SERVICES.map((s) => (
            <li key={s.key} style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--glass-brd)' }}>
              <span aria-hidden style={{ flex: '0 0 auto', width: 3, borderRadius: 2, background: 'linear-gradient(180deg, var(--acc), var(--acc-2))' }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 650, letterSpacing: '-0.01em' }}>{t(s.title)}</div>
                <div style={{ marginTop: 3, fontSize: 13, lineHeight: 1.5, color: 'hsl(var(--ink-2))' }}>{t(s.body)}</div>
              </div>
            </li>
          ))}
        </ul>

        {/* Access — two clear paths in */}
        <div style={{ marginTop: 22, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link to="/login" className="ktc-btn" style={{ flex: '1 1 180px', textAlign: 'center', textDecoration: 'none' }}>
              {t('Sign in')}
            </Link>
            <Link to="/register" className="ktc-btn-secondary" style={{ flex: '1 1 180px', textAlign: 'center', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {t('Create an account')}
            </Link>
          </div>
          <p className="ktc-label" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
            {t('Customers and consignees: create an account to begin accreditation. KTC staff accounts are invite-only. For assistance with access, please contact KTC customer service or visit the KTC office.')}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'hsl(var(--ink-2))' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: '0 0 auto' }}>
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>{t('Secure access · official KTC Container Terminal Corp. portal')}</span>
          </div>
          <NeedHelp />
        </div>

        {/* Footer */}
        <div style={{ marginTop: 22, paddingTop: 14, borderTop: '1px solid var(--glass-brd)', display: 'flex', flexWrap: 'wrap', gap: '4px 16px', alignItems: 'center', justifyContent: 'flex-end' }}>
          <span className="ktc-label" style={{ fontSize: 12 }}>
            <span title={VERSION_FULL}>{VERSION_LABEL}</span> · © {new Date().getFullYear()} KTC Container Terminal Corp.
          </span>
        </div>
      </main>
    </div>
  )
}
