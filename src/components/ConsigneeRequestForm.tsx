import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { prepareUpload } from '../lib/validation'
import { useT } from '../lib/i18n'
import { cisPrintUrl } from '../lib/cis'
import Modal from './Modal'

// Customer "request a new consignee" — a MODAL that captures the full Customer
// Information Sheet (trade + registered name, address ×2, TIN, tel/mobile/email)
// plus the BIR 2303 (required) / 2307 (optional). On submit it calls
// request_consignee (0166), which creates the consignee as PENDING. It is NOT
// auto-selected: a pending consignee can't be used to file until KTC approves it
// (the picker is approved-only). The success view offers "Print CIS" (the filled
// sheet) + a blank sheet to fill by hand — so customers can do it online or on paper.
type Created = {
  code: string; name: string
  customer_name: string; address1: string; address2: string
  tin: string; tel: string; mobile: string; email: string
}

// One labelled text field — a plain inline renderer (not a component) so input
// focus survives the parent's re-render on each keystroke.
function field(label: string, value: string, onChange: (v: string) => void) {
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      <label className="ktc-label" style={{ fontSize: 11.5 }}>{label}</label>
      <input className="ktc-input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export default function ConsigneeRequestForm() {
  const { t } = useT()
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [address, setAddress] = useState('')
  const [address2, setAddress2] = useState('')
  const [tin, setTin] = useState('')
  const [tel, setTel] = useState('')
  const [mobile, setMobile] = useState('')
  const [email, setEmail] = useState('')
  const [doc2303, setDoc2303] = useState<File | null>(null)
  const [doc2307, setDoc2307] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [created, setCreated] = useState<Created | null>(null)

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
    setName(''); setCustomerName(''); setAddress(''); setAddress2(''); setTin('')
    setTel(''); setMobile(''); setEmail(''); setDoc2303(null); setDoc2307(null)
  }

  async function submit() {
    setErr(null)
    if (name.trim().length < 2) { setErr(t('Enter the consignee name.')); return }
    if (!address.trim()) { setErr(t('Enter the business address.')); return }
    if (!tin.trim()) { setErr(t('Enter the TIN / VAT Reg #.')); return }
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
        p_customer_name: customerName.trim() || null,
        p_address2: address2.trim() || null,
        p_tel: tel.trim() || null,
        p_mobile: mobile.trim() || null,
        p_email: email.trim() || null,
      })
      if (error) throw error
      const c = data as { id: string; code: string; name: string }
      setCreated({
        code: c.code, name: c.name,
        customer_name: customerName.trim(), address1: address.trim(), address2: address2.trim(),
        tin: tin.trim(), tel: tel.trim(), mobile: mobile.trim(), email: email.trim(),
      })
    } catch (e) {
      setErr((e as { message?: string }).message ?? t('Could not submit the request.'))
    } finally {
      setBusy(false)
    }
  }

  const filledCisUrl = created
    ? cisPrintUrl({
        mode: 'new', trade_name: created.name, customer_name: created.customer_name,
        address1: created.address1, address2: created.address2, tin: created.tin,
        tel: created.tel, mobile: created.mobile, email: created.email,
      })
    : '#'

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
              {t('Submitted: {code} – {name}. It’s now pending KTC approval — you can file with it once it’s approved.', { code: created.code, name: created.name })}
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link className="ktc-btn" to="/requests" onClick={() => setOpen(false)} style={{ width: 'auto', padding: '9px 16px', textDecoration: 'none' }}>{t('Track in My Requests')}</Link>
              <a className="ktc-btn-secondary" href={filledCisUrl} target="_blank" rel="noopener" style={{ width: 'auto', padding: '9px 16px', textDecoration: 'none' }}>{t('Print filled CIS')}</a>
              <a className="ktc-link" href={cisPrintUrl({ mode: 'new' })} target="_blank" rel="noopener" style={{ fontSize: 13 }}>{t('Print blank CIS')}</a>
            </div>
            <button type="button" className="ktc-btn" onClick={reset} style={{ width: 'auto', padding: '9px 18px', justifySelf: 'start' }}>{t('Done')}</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="ktc-label" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              {t('Fill in the consignee’s Customer Information Sheet and attach their BIR documents. It’s submitted as pending — KTC verifies and approves it before you can file with it.')}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <a className="ktc-link" href={cisPrintUrl({ mode: 'new' })} target="_blank" rel="noopener" style={{ fontSize: 12 }}>{t('Print blank CIS')}</a>
            </div>
            {field(t('Trade name (as in invoice) *'), name, setName)}
            {field(t('Customer name (leave blank if same as trade name)'), customerName, setCustomerName)}
            {field(t('Business address line 1 *'), address, setAddress)}
            {field(t('Business address line 2'), address2, setAddress2)}
            {field(t('TIN / VAT Reg # *'), tin, setTin)}
            {field(t('Tel No.'), tel, setTel)}
            {field(t('Mobile No.'), mobile, setMobile)}
            {field(t('Email address'), email, setEmail)}
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
