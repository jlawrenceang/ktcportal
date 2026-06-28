import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// Small reusable modal built on the existing visionOS glass modal classes
// (ktc-modal-backdrop / ktc-modal-panel in index.css). Click-outside or Esc closes.
// Rendered through a PORTAL to <body> so it always escapes ancestor stacking
// contexts — a parent `.ktc-glass` (backdrop-filter) would otherwise trap the
// fixed backdrop and let the bottom tabbar / footer overlap it.
//
// a11y: the panel is a labelled role=dialog/aria-modal; opening focuses the
// panel, Tab is trapped inside it, and focus is restored to the trigger on close.
export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 460,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: number
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Focus-on-open + restore-on-close, keyed ONLY on `open`. Critical: keeping
  // onClose out of the deps means an unstable onClose (e.g. a caller's declared
  // fn that changes identity every render) can't re-run this and yank focus off
  // an input the user is mid-typing in (e.g. the consignee-request form).
  useEffect(() => {
    if (!open) return
    const prevFocus = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => { prevFocus?.focus?.() }
  }, [open])

  // Escape + Tab focus-trap. Re-binds when onClose changes — no focus side effects.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const f = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!f || f.length === 0) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div className="ktc-modal-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="ktc-glass ktc-modal-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth, padding: 0, display: 'flex', flexDirection: 'column', maxHeight: '88vh' }}
      >
        {title && (
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--glass-brd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700 }}>{title}</div>
            <button type="button" onClick={onClose} aria-label="Close" className="ktc-link" style={{ fontSize: 22, lineHeight: 1, padding: '0 4px' }}>×</button>
          </div>
        )}
        <div style={{ overflowY: 'auto', padding: '16px 18px' }}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
