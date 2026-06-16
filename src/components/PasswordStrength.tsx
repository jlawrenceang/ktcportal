import { passwordCriteria, passwordScore } from '../lib/validation'
import { useT } from '../lib/i18n'

// Live password strength feedback for the sign-up / new-password forms: a
// 4-segment bar + a word (Weak…Strong), and a checklist of the policy criteria
// that tick green as they're met. Purely visual — submission is still gated by
// passwordIssue() (server-enforced policy).

// Indexed by score 0..4. Score 0 (empty) shows an empty track + no word.
const COLORS = ['transparent', '#e5484d', '#f5a623', '#3b9eff', '#30a46c']
const OK = '#30a46c'

export default function PasswordStrength({ value }: { value: string }) {
  const { t } = useT()
  const score = passwordScore(value)
  const c = passwordCriteria(value)
  const words = ['', t('Weak'), t('Fair'), t('Good'), t('Strong')]

  const items = [
    { ok: c.length, text: t('At least 8 characters') },
    { ok: c.letter, text: t('A letter') },
    { ok: c.number, text: t('A number') },
  ]

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 2 }} aria-live="polite">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {[1, 2, 3, 4].map((seg) => (
            <div key={seg} style={{
              flex: 1, height: 5, borderRadius: 3,
              background: seg <= score ? COLORS[score] : 'rgba(128,128,128,0.22)',
              transition: 'background 150ms ease',
            }} />
          ))}
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, minWidth: 42, textAlign: 'right', color: score ? COLORS[score] : 'transparent' }}>
          {words[score]}
        </span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
        {items.map((it) => (
          <li key={it.text} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: it.ok ? OK : 'hsl(var(--ink-2))' }}>
            <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1, width: 12, display: 'inline-block', textAlign: 'center' }}>
              {it.ok ? '✓' : '○'}
            </span>
            {it.text}
          </li>
        ))}
      </ul>
    </div>
  )
}
