import { type CSSProperties } from 'react'
import { ORG } from '../lib/org'

// Registered-business identity (TIN + registered address) — a small muted letterhead
// shown under the logo on the public pages (landing + sign-in). The company NAME comes
// from the logo, so this leads with TIN + address to avoid repeating it.
export default function OrgInfo({ style, className }: { style?: CSSProperties; className?: string }) {
  return (
    <div className={className ? `ktc-org ${className}` : 'ktc-org'} style={style}>
      {ORG.address}
    </div>
  )
}
