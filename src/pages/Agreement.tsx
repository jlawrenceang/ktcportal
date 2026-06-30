import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Shell from '../components/Shell'
import MarkdownDoc, { MarkdownBody } from '../components/MarkdownDoc'
import ProtectedDoc from '../components/ProtectedDoc'
import { AGREEMENT_BODY } from '../content/legal'
import { useAuth } from '../lib/AuthContext'
import { useT } from '../lib/i18n'

export default function Agreement() {
  const { session } = useAuth()
  const { t } = useT()
  const navigate = useNavigate()
  const [showTop, setShowTop] = useState(false)

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 420)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const backToTop = showTop ? (
    <button
      type="button"
      className="ktc-btn-secondary ktc-btn--sm"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      style={{
        position: 'fixed',
        right: 16,
        bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
        zIndex: 70,
        boxShadow: 'var(--shadow-md)',
      }}
    >
      {t('Back to Top')}
    </button>
  ) : null

  // Public (pre-login) viewers get the standalone document (its own header +
  // back). Signed-in customers see it inside the Shell so the bottom bar stays.
  if (!session) return <><MarkdownDoc body={AGREEMENT_BODY} />{backToTop}</>

  return (
    <Shell>
      <button className="ktc-link" onClick={() => navigate(-1)} style={{ margin: '14px 4px 6px', fontSize: 13, fontWeight: 600 }}>← {t('Back')}</button>
      <ProtectedDoc>
        <div className="ktc-glass" style={{ padding: '30px 32px' }}>
          <MarkdownBody body={AGREEMENT_BODY} />
        </div>
      </ProtectedDoc>
      {backToTop}
    </Shell>
  )
}
