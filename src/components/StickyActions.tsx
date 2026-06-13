import type { ReactNode } from 'react'

// A frosted action bar that sticks to the bottom of the viewport so a form's
// primary button is always reachable without scrolling to the end. On a short
// form it simply sits at the bottom of the content.
export default function StickyActions({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="ktc-actionbar" style={style}>
      {children}
    </div>
  )
}
