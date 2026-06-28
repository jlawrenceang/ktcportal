import type { ReactNode } from 'react'

// Shared notification line — icon + title + relative time + unread dot. The one
// place this row markup lives, reused by both bells (customer + staff) and their
// "View all" history pages so they can never drift apart.
export default function NotificationRow({
  icon, title, when, isRead, onClick,
}: {
  icon: ReactNode
  title: string
  when: string
  isRead: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left',
        padding: '9px 10px', borderRadius: 9, cursor: 'pointer', marginBottom: 2,
        background: isRead ? 'transparent' : 'var(--c-w55)',
        border: '1px solid ' + (isRead ? 'transparent' : 'var(--glass-brd)'),
        font: 'inherit', color: 'hsl(var(--ink))',
      }}
    >
      <span aria-hidden style={{ flex: '0 0 auto', display: 'inline-flex', marginTop: 1, color: 'hsl(var(--ink-2))' }}>
        {icon}
      </span>
      <span style={{ minWidth: 0, flex: '1 1 auto' }}>
        <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.4, fontWeight: isRead ? 400 : 600 }}>{title}</span>
        <span className="ktc-label" style={{ fontSize: 11, opacity: 0.7 }}>{when}</span>
      </span>
      {!isRead && <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--acc)', flex: '0 0 auto', marginTop: 5 }} />}
    </button>
  )
}
