import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useT } from '../lib/i18n'
import LangToggle from './LangToggle'
import PublicBrand from './PublicBrand'
import { VERSION_LABEL, VERSION_FULL } from '../version'

// Shared public shell for the landing ("/"), sign-in ("/login"), and create-account
// ("/register") routes. The top letterhead, the left intro + services, and the footer
// are rendered ONCE here and persist across all three (never re-mounted); only the
// right column (.ktc-landing__access) swaps via the routed <Outlet/> — the landing's
// access buttons on "/", the full auth form on "/login" + "/register". Each navigation
// fades only that right column (keyed by pathname → .ktc-public-swap). The terminal-photo
// backdrop is rendered once at the app level (PublicBackdrop), so it persists too.

const SERVICES: { key: string; title: string; body: string }[] = [
  {
    key: 'jo',
    title: 'Job Orders',
    body: 'Request terminal services and track each order anytime.',
  },
  {
    key: 'release',
    title: 'Container Release & Pull-out',
    body: 'File your delivery documents and request for pull-out in advance.',
  },
  {
    key: 'pay',
    title: 'Online Payments',
    body: 'Assess your charges and process your payments online.',
  },
  {
    key: 'vessel',
    title: 'Vessel Schedule & Rates',
    body: 'Be updated with our vessel schedules and estimate charges with our rate calculator.',
  },
]

export default function PublicShell() {
  const { t } = useT()
  const { session } = useAuth()
  const { pathname } = useLocation()
  // Phone: service descriptions collapse to keep the landing to one screen (tap a
  // title to reveal). Desktop shows them all (CSS forces them open — it has room).
  const [openSvc, setOpenSvc] = useState<string | null>(null)
  // On phone the auth pages are form-focused — the intro + services (which the visitor
  // just saw on the landing) hide so the form sits at the top, not below a scroll. Desktop
  // keeps the intro as the left column.
  const isAuth = pathname === '/login' || pathname === '/register'
  // The public card chrome is for logged-out visitors. A signed-in session at "/"
  // renders its role landing (Home / admin redirect) full-page through a bare Outlet —
  // RootGate's logged-in branch, unchanged. (/login + /register redirect to "/" when a
  // session exists, so they never reach the shell authenticated.)
  if (session) return <Outlet />
  return (
    <div className="ktc-landing">
      {/* The terminal-photo backdrop is rendered once at the app level (PublicBackdrop)
          so it persists across landing <-> sign-in; this is just the glass card. */}
      <main className="ktc-glass ktc-rise ktc-landing__card">
        {/* Header — logo + language (full width above the split) */}
        <div className="ktc-landing__top">
          <PublicBrand />
          <LangToggle />
        </div>

        <div className="ktc-landing__grid">
          {/* Intro — what it is, who it's for, and the services (the hero content) */}
          <section className={isAuth ? 'ktc-landing__intro ktc-landing__intro--auth' : 'ktc-landing__intro'}>
            <h1 className="ktc-landing__title">{t('KTC Online Portal')}</h1>
            <p className="ktc-landing__lede">
              {t('The online service desk of KTC Container Terminal Corp. — file and track your terminal and port-services work.')}
            </p>

            <ul className="ktc-landing__services">
              {SERVICES.map((s) => (
                <li key={s.key} className="ktc-landing__service">
                  <span aria-hidden className="ktc-landing__service-bar" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <button
                      type="button"
                      className="ktc-landing__service-head"
                      aria-expanded={openSvc === s.key}
                      onClick={() => setOpenSvc((cur) => (cur === s.key ? null : s.key))}
                    >
                      <span className="ktc-landing__service-title">{t(s.title)}</span>
                      <svg className="ktc-landing__service-chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    <div className={`ktc-landing__service-body${openSvc === s.key ? ' is-open' : ''}`}>{t(s.body)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Access — the ONLY part that changes between landing / sign-in / create-account.
              Keyed by pathname so only this right column fades on navigation. */}
          <section className="ktc-landing__access">
            <div key={pathname} className="ktc-public-swap">
              <Outlet />
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="ktc-landing__foot">
          <span className="ktc-label" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              {t('Secure')}
            </span>
            <span>· {t('SSL-encrypted')} ·</span>
            <Link to="/agreement" className="ktc-link" style={{ textDecoration: 'none' }}>{t('Privacy & Terms')}</Link>
          </span>
          <span className="ktc-label" style={{ fontSize: 11.5, opacity: 0.7 }}>
            <span title={VERSION_FULL}>{VERSION_LABEL}</span> · © {new Date().getFullYear()} KTC Container Terminal Corp.
          </span>
        </div>
      </main>
    </div>
  )
}
