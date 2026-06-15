import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'

// Mobile navigation drawer: a hamburger button that opens a slide-in panel
// from the right with full-width, big-tap-target links. Used by both shells on
// phones (the desktop top bar is unchanged). Closes on navigation and on
// backdrop tap. `children` is a render prop receiving a `close` fn so links can
// dismiss the drawer after navigating.
export default function NavDrawer({ children }: { children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => { setOpen(false) }, [loc.pathname]) // close after navigating
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        className="ktc-nav-link ktc-burger"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        style={{ flex: '0 0 auto' }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
        <span className="ktc-burger-label">Menu</span>
      </button>
      {open && createPortal(
        // Portal to <body> so the overlay's position:fixed is relative to the
        // viewport — the nav bar's backdrop-filter would otherwise make it the
        // containing block and collapse the panel.
        <div className="ktc-drawer-backdrop" onClick={() => setOpen(false)}>
          <div className="ktc-drawer" role="menu" aria-label="Navigation" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <button type="button" className="ktc-nav-link" aria-label="Close menu" onClick={() => setOpen(false)} style={{ fontSize: 20, lineHeight: 1 }}>✕</button>
            </div>
            {children(() => setOpen(false))}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
