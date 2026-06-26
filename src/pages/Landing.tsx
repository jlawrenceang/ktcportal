import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../lib/i18n'
import LangToggle from '../components/LangToggle'
import NeedHelp from '../components/NeedHelp'
import HeroSlideshow from '../components/HeroSlideshow'
import { VERSION_LABEL, VERSION_FULL } from '../version'

// Public landing — what an unauthenticated visitor sees at "/" (App routes a
// signed-in session straight to the role landing instead). Orientation +
// services + two clear paths in (Sign in / Create account). No forced "accept"
// gate: legal consent lives at sign-up (the Customer Agreement scroll-consent),
// not here. The owner's real KTC terminal aerials run as an auto-advancing
// crossfade slideshow behind a dark scrim; the glass card carries all the copy.
// One card on phone (the loved tile); a wider two-column split on desktop.

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

export default function Landing() {
  const { t } = useT()
  // Phone: service descriptions collapse to keep the landing to one screen (tap a
  // title to reveal). Desktop shows them all (CSS forces them open — it has room).
  const [openSvc, setOpenSvc] = useState<string | null>(null)
  return (
    <div className="ktc-landing">
      {/* Backdrop — the owner's KTC terminal aerials, crossfading ~5s/slide,
          under a dark gradient scrim so the glass card + its CTAs stay AA. */}
      <HeroSlideshow />
      <div className="ktc-landing__scrim" aria-hidden="true" />

      <main className="ktc-glass ktc-rise ktc-landing__card">
        {/* Header — logo + language (full width above the split) */}
        <div className="ktc-landing__top">
          <img src="/ktc-logo.png" alt="KTC Container Terminal Corp" style={{ height: 52 }} />
          <LangToggle />
        </div>

        <div className="ktc-landing__grid">
          {/* Intro — what it is, who it's for, and the services (the hero content) */}
          <section className="ktc-landing__intro">
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

          {/* Access — two clear paths in */}
          <section className="ktc-landing__access">
            <div className="ktc-landing__cta">
              <Link to="/login" className="ktc-btn" style={{ textDecoration: 'none' }}>
                {t('Sign in')}
              </Link>
              <Link to="/register" className="ktc-btn-secondary" style={{ textDecoration: 'none' }}>
                {t('Create an account')}
              </Link>
            </div>
            <p className="ktc-label" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
              {t('Create an account to begin accreditation.')}
            </p>
            <div className="ktc-landing__secure">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: '0 0 auto' }}>
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>{t('Secure access · official KTC Container Terminal Corp. portal')}</span>
            </div>
            <NeedHelp />
          </section>
        </div>

        {/* Footer */}
        <div className="ktc-landing__foot">
          <span className="ktc-label" style={{ fontSize: 12 }}>
            <span title={VERSION_FULL}>{VERSION_LABEL}</span> · © {new Date().getFullYear()} KTC Container Terminal Corp.
          </span>
        </div>
      </main>
    </div>
  )
}
