import { Link } from 'react-router-dom'
import { useT } from '../lib/i18n'

// The landing's right column ("/"): two clear paths in — Sign in / Create an account —
// plus the accreditation line. Rendered into PublicShell's <Outlet/> (which provides the
// wrapping .ktc-landing__access <section>), so this is just the contents.
export default function AuthRail() {
  const { t } = useT()
  return (
    <>
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
    </>
  )
}
