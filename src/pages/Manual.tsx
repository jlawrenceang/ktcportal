import Shell from '../components/Shell'
import { MarkdownBody } from '../components/MarkdownDoc'
import { useT } from '../lib/i18n'
import manualBody from '../content/manual-customer.md?raw'
import manualBodyTl from '../content/manual-customer.tl.md?raw'

// Customer user manual (linked from the Shell footer; the staff manuals
// live at /admin/manual). Printable via the browser's print dialog.
// Shown in the active language (English / Filipino).
export default function Manual() {
  const { t, lang } = useT()
  return (
    <Shell>
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '14px 4px 10px' }}>
        <button className="ktc-btn-secondary ktc-btn--sm" onClick={() => window.print()}>🖨️ {t('Print this guide')}</button>
      </div>
      <div className="ktc-glass" style={{ padding: '30px 32px' }}>
        <MarkdownBody body={lang === 'tl' ? manualBodyTl : manualBody} />
      </div>
    </Shell>
  )
}
