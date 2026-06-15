import { useEffect, type ReactNode } from 'react'
import { useT } from '../lib/i18n'
import { useBroker } from '../lib/useBroker'
import { useAuth } from '../lib/AuthContext'

// Wraps a confidential, view-only document (Customer Guide, Customer Agreement,
// staff manuals). Behaviour:
//   * OWNER → rendered plainly and PRINTABLE (the owner may print any doc).
//   * everyone else → view-only: select/copy/right-click disabled, Ctrl/Cmd+P
//     and +S blocked, print stylesheet blanks the content (shows a notice), and
//     a faint TILED WATERMARK of the viewer's email is laid over the page.
//
// Screenshots cannot be blocked on the web (no browser API exists). The
// watermark makes any screenshot/photo traceable to the account that took it —
// that is the practical confidentiality control, not prevention.
export default function ProtectedDoc({ children }: { children: ReactNode }) {
  const { t } = useT()
  const { broker } = useBroker()
  const { session } = useAuth()
  const isOwner = !!broker?.is_owner

  useEffect(() => {
    if (isOwner) return
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && (k === 'p' || k === 's')) { e.preventDefault(); e.stopPropagation() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [isOwner])

  // Owner: plain + printable.
  if (isOwner) return <>{children}</>

  const mark = (broker?.email || session?.user?.email || 'KTC • CONFIDENTIAL').replace(/[<>&]/g, '')
  const wmSvg = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='180'>` +
    `<text x='8' y='92' transform='rotate(-22 150 90)' fill='rgba(120,120,120,0.11)' font-size='13' font-family='sans-serif'>${mark}</text></svg>`,
  )

  return (
    <>
      <div className="ktc-protected-doc" onContextMenu={(e) => e.preventDefault()} onCopy={(e) => e.preventDefault()}>
        <div className="ktc-confidential-badge">
          🔒 {t('Confidential — for viewing only. Printing, saving and copying are disabled.')}
        </div>
        {children}
        <div className="ktc-doc-watermark" aria-hidden style={{ backgroundImage: `url("${wmSvg}")` }} />
      </div>
      {/* Shown only by the print stylesheet, in place of the blanked content. */}
      <div className="ktc-print-only ktc-confidential-print">
        {t('This document is confidential and may not be printed, saved, or reproduced.')}
      </div>
    </>
  )
}
