import { useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useT } from '../lib/i18n'
import { GlobeIcon } from './icons'

// Public / auth-flow routes where the chooser must NOT appear — most importantly
// /confirmed, where the email-confirmation link establishes a transient session
// before the user actually signs in. The chooser belongs on the portal, after
// a real login.
const PRE_AUTH_PATHS = new Set([
  '/login', '/confirmed', '/forgot-password', '/reset-password',
  '/agreement', '/irr', '/terms', '/privacy',
])

// One-time, first-run language chooser. Shows after sign-in (only when no
// language has been explicitly picked yet) and BEFORE the demo tour — the tour
// is gated on langChosen, so the walkthrough then runs in the chosen language.
// Picking via the nav EN/FIL toggle also satisfies this, so returning users and
// anyone who chose on the login screen never see it.
export default function LanguageGate() {
  const { session } = useAuth()
  const { langChosen, setLang } = useT()
  const { pathname } = useLocation()

  if (!session || langChosen || PRE_AUTH_PATHS.has(pathname)) return null

  return (
    <div className="ktc-modal-backdrop" style={{ zIndex: 80 }}>
      <div className="ktc-glass ktc-modal-panel" style={{ maxWidth: 380, width: '100%', padding: '30px 26px', textAlign: 'center' }}>
        <img src="/ktc-logo.png" alt="KTC Container Terminal Corp" style={{ height: 50, marginBottom: 16 }} />
        {/* Bilingual prompt so it reads regardless of the eventual choice. */}
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>Choose your language</h2>
        <p className="ktc-label" style={{ margin: '6px 0 0', fontSize: 14 }}>Pumili ng wika</p>

        <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
          <button className="ktc-btn" type="button" onClick={() => setLang('en')}>English</button>
          <button className="ktc-btn-secondary" type="button" onClick={() => setLang('tl')}>Filipino (Tagalog)</button>
        </div>
        <p className="ktc-label" style={{ margin: '16px 0 0', fontSize: 12, opacity: 0.75 }}>
          You can change this later — <span style={{ display: 'inline-flex', verticalAlign: '-2px' }}><GlobeIcon size={13} /></span> EN / FIL in the side menu (or Settings).<br />
          Pwede mong palitan kahit kailan sa menu o Settings.
        </p>
      </div>
    </div>
  )
}
