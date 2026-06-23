import { useT } from '../lib/i18n'
import type { Origin } from '../lib/shippingLines'

// Prominent, color-coded pill distinguishing FOREIGN vs DOMESTIC cargo — a solid
// colour + white text so it reads clearly in both light and dark themes.
export default function OriginPill({ origin, size = 'md' }: { origin: Origin; size?: 'sm' | 'md' }) {
  const { t } = useT()
  const domestic = origin === 'domestic'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: size === 'sm' ? 10.5 : 12, fontWeight: 750, letterSpacing: '0.04em',
      padding: size === 'sm' ? '2px 9px' : '4px 12px', borderRadius: 999, textTransform: 'uppercase',
      color: '#fff', whiteSpace: 'nowrap',
      background: domestic ? 'hsl(160 60% 36%)' : 'hsl(215 76% 48%)',
      boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
    }}>
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: '#fff', opacity: 0.9 }} />
      {domestic ? t('Domestic') : t('Foreign')}
    </span>
  )
}
