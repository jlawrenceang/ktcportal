import { useEffect, useState } from 'react'
import { useT } from '../lib/i18n'
import { DownloadIcon } from './icons'

// "Install app" row for the nav ⊞ Menu. Appears only when the browser offers
// installation (Android Chrome fires `beforeinstallprompt`) and hides once the
// app is installed / running standalone.
type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export default function InstallButton() {
  const { t } = useT()
  const [evt, setEvt] = useState<BIPEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent) }
    const onInstalled = () => { setInstalled(true); setEvt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    try { if (window.matchMedia('(display-mode: standalone)').matches) setInstalled(true) } catch { /* ignore */ }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed || !evt) return null

  async function install() {
    if (!evt) return
    await evt.prompt()
    await evt.userChoice
    setEvt(null)
  }

  return (
    <button type="button" className="ktc-menu-setting" onClick={() => void install()}>
      <span style={{ flex: 1, textAlign: 'left', display: 'inline-flex', alignItems: 'center', gap: 8 }}><DownloadIcon size={16} /> {t('Install app')}</span>
    </button>
  )
}
