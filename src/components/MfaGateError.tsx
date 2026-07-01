import { useAuth } from '../lib/AuthContext'
import { useT } from '../lib/i18n'

export default function MfaGateError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { signOut } = useAuth()
  const { t } = useT()

  return (
    <div className="ktc-page" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
      <div className="ktc-glass" style={{ padding: 28, maxWidth: 430, width: '100%', display: 'grid', gap: 12 }}>
        <img src="/ktc-logo.png" alt="KTC" style={{ height: 38, justifySelf: 'center' }} />
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 650 }}>{t('Could not verify your sign-in')}</h1>
        <p className="ktc-label" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
          {message || t('The security check did not finish. Please retry, or sign out and sign in again.')}
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
          <button type="button" className="ktc-btn" style={{ width: 'auto', padding: '10px 18px' }} onClick={onRetry}>
            {t('Retry')}
          </button>
          <button type="button" className="ktc-link" onClick={() => void signOut()}>
            {t('Sign out')}
          </button>
        </div>
      </div>
    </div>
  )
}
