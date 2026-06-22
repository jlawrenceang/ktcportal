import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { prepareUpload } from '../lib/validation'
import { useT } from '../lib/i18n'
import Modal from './Modal'
import { cisPrintUrl } from '../lib/cis'
import type { PickerItem } from './SearchPicker'

// Customer "request a new consignee" — a MODAL to fill the consignee's Customer
// Information Sheet details + BIR 2303 (required) / 2307 (optional), upload the
// docs, then call request_consignee (0132). On success the new PENDING consignee
// is handed back via onCreated (picker selects it), and a success view offers
// "Print CIS" (the filled sheet) before closing. File-now; KTC verifies later.
export default function ConsigneeRequestForm({ onCreated }: { onCreated: (item: PickerItem) => void }) {
  const { t } = useT()
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [tin, setTin] = useState('')
  const [doc2303, setDoc2303] = useState<File | null>(null)
  const [doc2307, setDoc2307] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [created, setCreated] = useState<{ code: string; name: string } | null>(null)

  async function uploadDoc(file: File, tag: string): Promise<string> {
    const prepared = await prepareUpload(file) // oversized images auto-compress
    if ('error' in prepared) throw new Error(prepared.error)
    const ext = prepared.file.name.split('.').pop()?.toLowerCase() || 'pdf'
    const path = `${session?.user.id}/req-${crypto.randomUUID()}-${tag}.${ext}`
    const { error } = await supabase.storage.from('consignee-docs').upload(path, prepared.file, { upsert: true })
    if (error) throw new Error(error.message)
    return path
  }

  function reset() {
    setOpen(false); setErr(null); setCreated(null)
    setName(''); setAddress(''); setTin(''); setDoc2303(null); setDoc2307(null)
  }

  async function submit() {
    setErr(null)
    if (name.trim().length < 2) { setErr(t('Enter the consignee name.')); return }
    if (!doc2303) { setErr(t('Attach the BIR 2303 (Certificate of Registration).')); return }
    setBusy(true)
    try {
      const p2303 = await uploadDoc(doc2303, '2303')
      const p2307 = doc2307 ? await uploadDoc(doc2307, '2307') : null
      const { data, error } = await supabase.rpc('request_consignee', {
        p_name: name.trim(),
        p_address: address.trim() || null,
        p_tin: tin.trim() || null,
        p_doc_2303: p2303,
        p_doc_2307: p2307,
      })
      if (error) throw error
      const c = data as { id: string; code: string; name: string }
      onCreated({ id: c.id, title: c.code, sub: c.name })
      setCreated({ code: c.code, name: c.name }) // keep field values for Print CIS
    } catch (e) {
      setErr((e as { message?: string }).message ?? t('Could not submit the request.'))
    } finally {
      setBusy(false)
    }
  }

  function printCis() {
    window.open(cisPrintUrl({ mode: 'new', trade_name: name.trim(), address1: address.trim(), tin: tin.trim() }), '_blank', 'noopener')
  }

  return (
    <>
      <button
        type="button"
        className="ktc-link"
        onClick={() => setOpen(true)}
        style={{ fontSize: 12, marginTop: 2, textAlign: 'left', alignSelf: 'start' }}
      >
        {t('Can’t find your consignee? Request a new one')}
      </button>

      <Modal open={open} onClose={reset} title={created ? t('Consignee requested') : t('Request a new consignee')}>
        {created ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              {t('Submitted: {code} – {name}. It is pending KTC approval — you can keep filing in the meantime.', { code: created.code, name: created.name })}
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button type="button" className="ktc-btn" onClick={printCis} style={{ width: 'auto', padding: '9px 18px' }}>{t('Print CIS')}</button>
              <button type="button" className="ktc-link" onClick={reset} style={{ fontSize: 13 }}>{t('Done')}</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="ktc-label" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              {t('Fill in the consignee’s details and attach their BIR documents. It’s created right away so you can keep filing — KTC verifies it (needs approval).')}
            </div>
            <div style={{ display: 'grid', gap: 5 }}>
              <label className="ktc-label" style={{ fontSize: 11.5 }}>{t('Consignee name *')}</label>
              <input className="ktc-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gap: 5 }}>
              <label className="ktc-label" style={{ fontSize: 11.5 }}>{t('Business address')}</label>
              <input className="ktc-input" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gap: 5 }}>
              <label className="ktc-label" style={{ fontSize: 11.5 }}>{t('TIN / VAT Reg #')}</label>
              <input className="ktc-input" value={tin} onChange={(e) => setTin(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gap: 5 }}>
              <label className="ktc-label" style={{ fontSize: 11.5 }}>{t('BIR 2303 (Certificate of Registration) *')}</label>
              <input className="ktc-input" type="file" accept="image/*,application/pdf" onChange={(e) => setDoc2303(e.target.files?.[0] ?? null)} style={{ padding: '7px 10px' }} />
            </div>
            <div style={{ display: 'grid', gap: 5 }}>
              <label className="ktc-label" style={{ fontSize: 11.5 }}>{t('BIR 2307 (if withholding agent) — optional')}</label>
              <input className="ktc-input" type="file" accept="image/*,application/pdf" onChange={(e) => setDoc2307(e.target.files?.[0] ?? null)} style={{ padding: '7px 10px' }} />
            </div>
            {err && <div style={{ color: 'var(--acc-2)', fontSize: 12.5 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
              <button type="button" className="ktc-btn" disabled={busy} onClick={() => void submit()} style={{ width: 'auto', padding: '9px 18px' }}>
                {busy ? t('Submitting…') : t('Submit request')}
              </button>
              <button type="button" className="ktc-link" onClick={reset} style={{ fontSize: 13 }}>{t('Cancel')}</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
