import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'

export default function EmailChangeConfirm() {
  const { t } = useT()
  const [params] = useSearchParams()
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function run() {
      const token = params.get('token') ?? ''
      if (!token) {
        setStatus('error')
        setMessage(t('This email-change link is missing its token.'))
        return
      }
      const { error } = await supabase.rpc('confirm_customer_email_change', { p_token: token })
      if (!active) return
      if (error) {
        setStatus('error')
        setMessage(error.message)
        return
      }
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
      if (!active) return
      setStatus('ok')
      setMessage(t('Your email address was changed. Please sign in with your new email.'))
    }
    void run()
    return () => { active = false }
  }, [params, t])

  return (
    <div className="ktc-page" style={{ display: 'grid', placeItems: 'center', minHeight: '100%', padding: 20 }}>
      <div className="ktc-glass" style={{ width: '100%', maxWidth: 460, padding: 22, display: 'grid', gap: 14, textAlign: 'center' }}>
        <img src="/ktc-logo.png" alt="KTC" style={{ height: 42, justifySelf: 'center' }} />
        <h1 className="ktc-title" style={{ fontSize: 23 }}>
          {status === 'checking' ? t('Confirming email change') : status === 'ok' ? t('Email changed') : t('Email change failed')}
        </h1>
        <p className="ktc-label" style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
          {status === 'checking' ? t('Please wait while we verify your new email address.') : message}
        </p>
        <Link to="/login" className="ktc-btn" style={{ width: 'auto', justifySelf: 'center', padding: '10px 18px', textDecoration: 'none' }}>
          {status === 'ok' ? t('Sign in') : t('Go to sign in')}
        </Link>
      </div>
    </div>
  )
}
