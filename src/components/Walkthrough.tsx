import { createContext, useCallback, useContext, useState, type CSSProperties, type ReactNode } from 'react'
import { useT } from '../lib/i18n'

// A short, captioned video walkthrough of the customer portal — the passive
// companion to the interactive Quick tour. The provider renders the player
// modal once (above the routes); any screen opens it via useWalkthrough(), and
// WatchWalkthroughButton is the shared trigger (Menu, Manual, Home).
//
// The video is a silent screen recording (captions narrate it), so the player
// autoplays muted. First frame is the title card, so no separate poster needed.

interface WalkthroughCtx { open: () => void }
const Ctx = createContext<WalkthroughCtx>({ open: () => {} })
export function useWalkthrough() { return useContext(Ctx) }

export function PlayIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

export function WalkthroughProvider({ children }: { children: ReactNode }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const doOpen = useCallback(() => setOpen(true), [])
  return (
    <Ctx.Provider value={{ open: doOpen }}>
      {children}
      {open && (
        <div className="ktc-walkthrough-backdrop" role="dialog" aria-modal="true" aria-label={t('Portal walkthrough')} onClick={() => setOpen(false)}>
          <div className="ktc-walkthrough-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ktc-walkthrough-head">
              <span style={{ fontWeight: 700, fontSize: 15 }}>{t('Portal walkthrough')}</span>
              <button type="button" aria-label={t('Close')} className="ktc-walkthrough-close" onClick={() => setOpen(false)}>✕</button>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- captions are burned into the silent video */}
            <video className="ktc-walkthrough-video" controls autoPlay muted playsInline preload="metadata">
              <source src="/customer-walkthrough.mp4" type="video/mp4" />
            </video>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}

// Shared trigger. Pass className/style to fit each placement; children override the
// label; onClick runs before opening (e.g. to close the Menu sheet it lives in).
export function WatchWalkthroughButton({ className, style, children, onClick }: { className?: string; style?: CSSProperties; children?: ReactNode; onClick?: () => void }) {
  const { open } = useWalkthrough()
  const { t } = useT()
  return (
    <button type="button" className={className} style={style} onClick={() => { onClick?.(); open() }}>
      {children ?? (<><PlayIcon /> {t('Watch walkthrough')}</>)}
    </button>
  )
}
