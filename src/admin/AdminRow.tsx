import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle: string
  extra?: ReactNode
  onViewId?: () => void
  onDownloadId?: () => void
  busy: boolean
  onApprove: () => void
  onReject: () => void
  approveLabel?: string
  rejectLabel?: string
}

export function AdminRow(props: Props) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '12px 14px', borderRadius: 12,
        background: 'rgba(255,255,255,0.55)', border: '1px solid var(--glass-brd)',
      }}
    >
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <div><b>{props.title}</b></div>
        <div className="ktc-label" style={{ fontSize: 13 }}>{props.subtitle}</div>
        {props.extra}
        {props.onViewId && (
          <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
            <button className="ktc-link" style={{ fontSize: 12 }} onClick={props.onViewId}>View valid ID</button>
            {props.onDownloadId && (
              <button className="ktc-link" style={{ fontSize: 12 }} onClick={props.onDownloadId}>Download</button>
            )}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={props.onApprove} disabled={props.busy}
          style={{
            border: 0, borderRadius: 10, padding: '8px 14px', fontWeight: 600, fontSize: 13,
            cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg, hsl(150 55% 42%), hsl(150 60% 34%))',
          }}>
          {props.approveLabel ?? 'Approve'}
        </button>
        <button type="button" onClick={props.onReject} disabled={props.busy}
          style={{
            border: '1px solid hsl(var(--line))', borderRadius: 10, padding: '8px 14px',
            fontWeight: 600, fontSize: 13, cursor: 'pointer', background: 'rgba(255,255,255,0.7)', color: 'hsl(var(--ink-2))',
          }}>
          {props.rejectLabel ?? 'Reject'}
        </button>
      </div>
    </div>
  )
}
