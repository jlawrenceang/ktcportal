import Shell from '../components/Shell'
import { MarkdownBody } from '../components/MarkdownDoc'
import manualBody from '../content/manual-customer.md?raw'

// Customer user manual (linked from the Shell footer; the staff manuals
// live at /admin/manual). Printable via the browser's print dialog.
export default function Manual() {
  return (
    <Shell>
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '14px 4px 10px' }}>
        <button className="ktc-btn-secondary ktc-btn--sm" onClick={() => window.print()}>🖨️ Print this guide</button>
      </div>
      <div className="ktc-glass" style={{ padding: '30px 32px' }}>
        <MarkdownBody body={manualBody} />
      </div>
    </Shell>
  )
}
