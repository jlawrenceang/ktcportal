import { useT, type Lang } from '../lib/i18n'

// Compact EN / FIL segmented switch for the nav bars. Touch- and mouse-friendly
// (real buttons), and works on the login page too (the provider wraps the whole
// app). Default is English; choice persists per browser.
export default function LangToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useT()
  const opts: { value: Lang; label: string }[] = [
    { value: 'en', label: 'EN' },
    { value: 'tl', label: 'FIL' },
  ]
  return (
    <div
      role="group"
      aria-label="Language"
      style={{
        display: 'inline-flex', flex: '0 0 auto', borderRadius: 999, padding: 2, gap: 2,
        border: '1px solid var(--glass-brd)', background: 'rgba(255,255,255,0.5)',
      }}
    >
      {opts.map((o) => {
        const active = lang === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setLang(o.value)}
            aria-pressed={active}
            title={o.value === 'en' ? 'English' : 'Filipino (Tagalog)'}
            style={{
              border: 'none', cursor: 'pointer', borderRadius: 999,
              padding: compact ? '3px 8px' : '4px 10px', fontSize: 11.5, fontWeight: 700,
              letterSpacing: '0.02em',
              color: active ? '#fff' : 'hsl(var(--ink-2))',
              background: active ? 'linear-gradient(135deg, var(--acc), var(--acc-2))' : 'transparent',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
