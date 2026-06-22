import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import Modal from './Modal'

// Customer "add a new vessel" — opens a MODAL to enter vessel + voyage, then calls
// request_vessel (0137) which registers a PENDING vessel request for KTC operations
// to match to a scheduled call. The JO is still filed with the typed name/voyage
// (vessel_visit null); the request is what gets approved + linked.
export default function VesselRequestModal({
  onCreated,
}: {
  onCreated: (v: { vessel_name: string; voyage_number: string }) => void
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [voyage, setVoyage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function close() { setOpen(false); setErr(null) }

  async function submit() {
    setErr(null)
    if (name.trim().length < 1) { setErr(t('Enter the vessel name.')); return }
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('request_vessel', { p_name: name.trim(), p_voyage: voyage.trim() || null })
      if (error) throw error
      const v = data as { vessel_name: string; voyage_number: string }
      onCreated({ vessel_name: v.vessel_name, voyage_number: v.voyage_number })
      setOpen(false); setName(''); setVoyage('')
    } catch (e) {
      setErr((e as { message?: string }).message ?? t('Could not submit the request.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="ktc-link" onClick={() => setOpen(true)} style={{ fontSize: 12, textAlign: 'left', alignSelf: 'start' }}>
        {t('My vessel isn’t listed — add it')}
      </button>

      <Modal open={open} onClose={close} title={t('Add a new vessel')}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="ktc-label" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            {t('Enter the vessel and voyage. It’s submitted for KTC operations to match to a scheduled call (needs approval) — you can still file now.')}
          </div>
          <div style={{ display: 'grid', gap: 5 }}>
            <label className="ktc-label" style={{ fontSize: 11.5 }}>{t('Vessel name *')}</label>
            <input className="ktc-input" style={{ textTransform: 'uppercase' }} value={name} onChange={(e) => setName(e.target.value.toUpperCase())} />
          </div>
          <div style={{ display: 'grid', gap: 5 }}>
            <label className="ktc-label" style={{ fontSize: 11.5 }}>{t('Voyage number')}</label>
            <input className="ktc-input" style={{ textTransform: 'uppercase' }} value={voyage} onChange={(e) => setVoyage(e.target.value.toUpperCase())} />
          </div>
          {err && <div style={{ color: 'var(--acc-2)', fontSize: 12.5 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
            <button type="button" className="ktc-btn" disabled={busy} onClick={() => void submit()} style={{ width: 'auto', padding: '9px 18px' }}>
              {busy ? t('Submitting…') : t('Submit request')}
            </button>
            <button type="button" className="ktc-link" onClick={close} style={{ fontSize: 13 }}>{t('Cancel')}</button>
          </div>
        </div>
      </Modal>
    </>
  )
}
