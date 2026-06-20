import { useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n'
import { AlertTriangleIcon } from './icons'

// Global "servers are busy" notice. Listens for the ktc:server-busy /
// ktc:server-ok events emitted by the wrapped fetch in lib/supabase.ts.
// Debounces: a one-off 503 blip won't flash — the busy state has to persist
// ~700ms before the banner shows; the next healthy response hides it. Persistent
// overload (no healthy responses) keeps it up. The Refresh button reloads.
export default function ServerBusyBanner() {
  const { t } = useT()
  const [show, setShow] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const onBusy = () => {
      if (timer.current == null) timer.current = window.setTimeout(() => { setShow(true); timer.current = null }, 700)
    }
    const onOk = () => {
      if (timer.current != null) { clearTimeout(timer.current); timer.current = null }
      setShow(false)
    }
    window.addEventListener('ktc:server-busy', onBusy)
    window.addEventListener('ktc:server-ok', onOk)
    return () => {
      window.removeEventListener('ktc:server-busy', onBusy)
      window.removeEventListener('ktc:server-ok', onOk)
      if (timer.current != null) clearTimeout(timer.current)
    }
  }, [])

  if (!show) return null
  return (
    <div role="alert" style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#F26A21', color: '#fff', padding: '10px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
      boxShadow: '0 2px 10px rgba(0,0,0,.18)', fontSize: 14, lineHeight: 1.4,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><AlertTriangleIcon size={17} /> {t("KTC's servers are busy right now — please try again in a moment.")}</span>
      <button type="button" onClick={() => window.location.reload()} style={{
        background: '#fff', color: '#D6321E', border: 'none', borderRadius: 8,
        padding: '6px 16px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
      }}>{t('Refresh')}</button>
    </div>
  )
}
