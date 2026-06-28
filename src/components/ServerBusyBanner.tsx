import { useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n'
import { AlertTriangleIcon } from './icons'

// Global connection banner. Two distinct states, offline taking precedence:
//  · OFFLINE — navigator.onLine is false / the browser fired an 'offline' event:
//    it's the USER's connection, so we say so (not "our servers are busy").
//    Auto-clears on the 'online' event.
//  · BUSY — the wrapped fetch in lib/supabase.ts emitted ktc:server-busy
//    (502/503/504/429 or a network failure while seemingly online). Debounced
//    ~700ms so a one-off blip won't flash; the next healthy response hides it.
// The button reloads.
export default function ServerBusyBanner() {
  const { t } = useT()
  const [show, setShow] = useState(false)
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false)
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

  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  // Offline wins — don't blame KTC's servers for the user's dropped connection.
  if (offline) {
    return (
      <div role="alert" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: '#334155', color: '#fff', padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
        boxShadow: '0 2px 10px rgba(0,0,0,.18)', fontSize: 14, lineHeight: 1.4,
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><AlertTriangleIcon size={17} /> {t("You appear to be offline — check your internet connection. We'll reconnect automatically.")}</span>
        <button type="button" onClick={() => window.location.reload()} style={{
          background: '#fff', color: '#1e293b', border: 'none', borderRadius: 8,
          padding: '6px 16px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
        }}>{t('Refresh')}</button>
      </div>
    )
  }

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
