import { type ReactNode, useEffect } from 'react'

// Small reusable modal built on the existing visionOS glass modal classes
// (ktc-modal-backdrop / ktc-modal-panel in index.css). Click-outside or Esc closes.
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
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="ktc-modal-backdrop" onClick={onClose}>
      <div
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
    </div>
  )
}
