import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { prepareUpload } from '../lib/validation'
import { useT } from '../lib/i18n'
import type { PickerItem } from './SearchPicker'

// Customer "request a new consignee" — mirrors the vessel "not listed" flow.
// Collects name + address + TIN + BIR 2303 (required) + 2307 (optional), uploads
// the docs to the customer's own folder, then calls request_consignee (0132).
// On success the new PENDING consignee is handed back via onCreated so the picker
// selects it and the customer can keep filing while KTC verifies the documents.
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

  async function uploadDoc(file: File, tag: string): Promise<string> {
    const prepared = await prepareUpload(file) // oversized images auto-compress
    if ('error' in prepared) throw new Error(prepared.error)
    const ext = prepared.file.name.split('.').pop()?.toLowerCase() || 'pdf'
    const path = `${session?.user.id}/req-${crypto.randomUUID()}-${tag}.${ext}`
    const { error } = await supabase.storage.from('consignee-docs').upload(path, prepared.file, { upsert: true })
    if (error) throw new Error(error.message)
    return path
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
      setOpen(false)
      setName(''); setAddress(''); setTin(''); setDoc2303(null); setDoc2307(null)
    } catch (e) {
      setErr((e as { message?: string }).message ?? t('Could not submit the request.'))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="ktc-link"
        onClick={() => setOpen(true)}
        style={{ fontSize: 12, marginTop: 2, textAlign: 'left', alignSelf: 'start' }}
      >
        {t('Can’t find your consignee? Request a new one')}
      </button>
    )
  }

  return (
    <div style={{ marginTop: 8, padding: 12, borderRadius: 12, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)', display: 'grid', gap: 8 }}>
      <div className="ktc-label" style={{ fontSize: 12 }}>
        {t('New consignee — KTC will verify your BIR documents. You can keep filing in the meantime.')}
      </div>
      <input className="ktc-input ktc-input--compact" placeholder={t('Consignee name *')} value={name} onChange={(e) => setName(e.target.value)} />
      <input className="ktc-input ktc-input--compact" placeholder={t('Business address')} value={address} onChange={(e) => setAddress(e.target.value)} />
      <input className="ktc-input ktc-input--compact" placeholder={t('TIN / VAT Reg #')} value={tin} onChange={(e) => setTin(e.target.value)} />
      <label className="ktc-label" style={{ fontSize: 11.5 }}>{t('BIR 2303 (Certificate of Registration) *')}</label>
      <input className="ktc-input ktc-input--compact" type="file" accept="image/*,application/pdf" onChange={(e) => setDoc2303(e.target.files?.[0] ?? null)} style={{ padding: '6px 10px' }} />
      <label className="ktc-label" style={{ fontSize: 11.5 }}>{t('BIR 2307 (if withholding agent) — optional')}</label>
      <input className="ktc-input ktc-input--compact" type="file" accept="image/*,application/pdf" onChange={(e) => setDoc2307(e.target.files?.[0] ?? null)} style={{ padding: '6px 10px' }} />
      {err && <div style={{ color: 'var(--acc-2)', fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button type="button" className="ktc-btn ktc-btn--sm" disabled={busy} onClick={() => void submit()} style={{ width: 'auto', padding: '7px 14px', fontSize: 12.5 }}>
          {busy ? t('Submitting…') : t('Submit request')}
        </button>
        <button type="button" className="ktc-link" onClick={() => { setOpen(false); setErr(null) }} style={{ fontSize: 12.5 }}>{t('Cancel')}</button>
      </div>
    </div>
  )
}
