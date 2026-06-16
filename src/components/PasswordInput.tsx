import { useState, type InputHTMLAttributes } from 'react'
import { useT } from '../lib/i18n'

// A password <input> with a show/hide eye toggle. Drop-in replacement for the
// plain inputs — forwards every standard input prop (id, value, onChange,
// required, minLength, autoComplete, placeholder, …); only `type` is managed
// here. The toggle is tabIndex={-1} so keyboard users tab straight to submit.
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

const Eye = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
  </svg>
)
const EyeOff = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.88 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
)

export default function PasswordInput({ className, style, ...rest }: Props) {
  const { t } = useT()
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'grid' }}>
      <input
        {...rest}
        type={show ? 'text' : 'password'}
        className={className ?? 'ktc-input'}
        style={{ ...style, paddingRight: 44 }}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? t('Hide password') : t('Show password')}
        aria-pressed={show}
        title={show ? t('Hide password') : t('Show password')}
        style={{
          position: 'absolute', top: 0, right: 0, height: '100%', width: 42,
          display: 'grid', placeItems: 'center', border: 0, background: 'none',
          cursor: 'pointer', color: 'hsl(var(--ink-2))', padding: 0,
        }}
      >
        {show ? EyeOff : Eye}
      </button>
    </div>
  )
}
