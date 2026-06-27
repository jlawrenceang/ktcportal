import { useT } from '../lib/i18n'

// Branded route loader — the Suspense fallback for lazy routes and the
// auth/role resolve state. The KTC mark above a thin indeterminate progress
// bar, centered in the viewport. CSS-only (see .ktc-loader* in index.css);
// honors prefers-reduced-motion.
export default function RouteLoader() {
  const { t } = useT()
  return (
    <div className="ktc-loader" role="status" aria-live="polite">
      <div className="ktc-loader-logo" aria-hidden="true"><span className="ktc-loader-logo-fill" /></div>
      <span className="ktc-loader-text ktc-label">{t('Loading…')}</span>
    </div>
  )
}
