import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../components/Shell'
import Notice from '../components/Notice'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { prepareUpload } from '../lib/validation'
import { useFileViewer } from '../components/FileViewerModal'
import { useT } from '../lib/i18n'

// In-portal Customer Information Sheet (the company profile). Account-holders
// fill/update it here; it is REQUIRED before filing orders (server-enforced in
// 0133). Walk-ins without an account use the Google Form/QR instead.
type Contact = { name: string; position: string; contact_number: string; email: string }
const emptyContact = (): Contact => ({ name: '', position: '', contact_number: '', email: '' })

export default function CompanyInfo() {
  const { t } = useT()
  const { session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const { openFromStorage, viewerModal } = useFileViewer(setErr)

  const [tradeName, setTradeName] = useState('')
  const [legalName, setLegalName] = useState('')
  const [addr1, setAddr1] = useState('')
  const [addr2, setAddr2] = useState('')
  const [tin, setTin] = useState('')
  const [tel, setTel] = useState('')
  const [mobile, setMobile] = useState('')
  const [email, setEmail] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([emptyContact()])
  const [certified, setCertified] = useState(false)

  // existing doc paths + newly picked files
  const [doc2303Path, setDoc2303Path] = useState<string | null>(null)
  const [doc2307Path, setDoc2307Path] = useState<string | null>(null)
  const [docZeroPath, setDocZeroPath] = useState<string | null>(null)
  const [file2303, setFile2303] = useState<File | null>(null)
  const [file2307, setFile2307] = useState<File | null>(null)
  const [fileZero, setFileZero] = useState<File | null>(null)

  useEffect(() => {
    void (async () => {
      const [{ data: info }, { data: cts }] = await Promise.all([
        supabase.from('customer_info').select('*').maybeSingle(),
        supabase.from('customer_contacts').select('name, position, contact_number, email').order('created_at'),
      ])
      if (info) {
        setTradeName(info.trade_name ?? '')
        setLegalName(info.legal_name ?? '')
        setAddr1(info.business_address1 ?? '')
        setAddr2(info.business_address2 ?? '')
        setTin(info.tin ?? '')
        setTel(info.tel_no ?? '')
        setMobile(info.mobile_no ?? '')
        setEmail(info.email ?? '')
        setDoc2303Path(info.doc_2303_path ?? null)
        setDoc2307Path(info.doc_2307_path ?? null)
        setDocZeroPath(info.doc_zero_rating_path ?? null)
        setCertified(!!info.certified_at)
      }
      const list = (cts ?? []) as Contact[]
      setContacts(list.length ? list.map((c) => ({ ...emptyContact(), ...c })) : [emptyContact()])
      setLoading(false)
    })()
  }, [])

  async function uploadDoc(file: File, tag: string): Promise<string> {
    const prepared = await prepareUpload(file)
    if ('error' in prepared) throw new Error(prepared.error)
    const ext = prepared.file.name.split('.').pop()?.toLowerCase() || 'pdf'
    const path = `${session?.user.id}/cis-${tag}.${ext}`
    const { error } = await supabase.storage.from('customer-docs').upload(path, prepared.file, { upsert: true })
    if (error) throw new Error(error.message)
    return path
  }

  function setContact(i: number, patch: Partial<Contact>) {
    setContacts((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }

  async function save() {
    setErr(null); setMsg(null)
    if (certified && tradeName.trim().length < 2) { setErr(t('Enter your trade name.')); return }
    setBusy(true)
    try {
      const p2303 = file2303 ? await uploadDoc(file2303, '2303') : doc2303Path
      const p2307 = file2307 ? await uploadDoc(file2307, '2307') : doc2307Path
      const pZero = fileZero ? await uploadDoc(fileZero, 'zero-rating') : docZeroPath
      const { error } = await supabase.rpc('save_customer_info', {
        p_info: {
          trade_name: tradeName, legal_name: legalName, business_address1: addr1, business_address2: addr2,
          tin, tel_no: tel, mobile_no: mobile, email,
          doc_2303_path: p2303, doc_2307_path: p2307, doc_zero_rating_path: pZero,
        },
        p_contacts: contacts.filter((c) => c.name.trim()),
        p_certified: certified,
      })
      if (error) throw error
      setDoc2303Path(p2303 ?? null); setDoc2307Path(p2307 ?? null); setDocZeroPath(pZero ?? null)
      setFile2303(null); setFile2307(null); setFileZero(null)
      setMsg(t('Company information saved.'))
    } catch (e) {
      setErr((e as { message?: string }).message ?? t('Could not save.'))
    } finally { setBusy(false) }
  }

  const complete = !!(tradeName.trim() && addr1.trim() && tin.trim() && mobile.trim() && email.trim() && (file2303 || doc2303Path) && certified)

  if (loading) return <Shell><div className="ktc-label">{t('Loading…')}</div></Shell>

  return (
    <Shell>
      <div className="ktc-glass" style={{ padding: 22, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 className="ktc-title" style={{ fontSize: 18, margin: 0 }}>{t('Company Information')}</h1>
          <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
            background: complete ? 'var(--c-h150-50-93)' : 'var(--c-h40-90-94)',
            color: complete ? 'var(--c-h150-60-30)' : 'var(--c-h35-80-38)' }}>
            {complete ? t('Complete') : t('Incomplete')}
          </span>
        </div>
        <p className="ktc-sub" style={{ fontSize: 12.5, marginTop: 6, marginBottom: 0 }}>
          {t('Your company profile (KTC Customer Information Sheet). This must be completed before you can file orders.')}
        </p>
      </div>

      {err && <Notice tone="error" style={{ marginBottom: 14 }}>{err}</Notice>}
      {msg && <Notice tone="success" style={{ marginBottom: 14 }}>{msg}</Notice>}

      <div className="ktc-glass" style={{ padding: 22, marginBottom: 16, display: 'grid', gap: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 650, margin: 0 }}>{t('Customer Information')}</h2>
        <L label={t('Trade Name (as appears in invoice) *')}><input className="ktc-input" value={tradeName} onChange={(e) => setTradeName(e.target.value)} /></L>
        <L label={t('Customer Name (leave blank if same as trade name)')}><input className="ktc-input" value={legalName} onChange={(e) => setLegalName(e.target.value)} /></L>
        <L label={t('Business Address Line 1 *')}><input className="ktc-input" value={addr1} onChange={(e) => setAddr1(e.target.value)} /></L>
        <L label={t('Business Address Line 2')}><input className="ktc-input" value={addr2} onChange={(e) => setAddr2(e.target.value)} /></L>
        <L label={t('TIN / VAT Reg # *')}><input className="ktc-input" value={tin} onChange={(e) => setTin(e.target.value)} /></L>
      </div>

      <div className="ktc-glass" style={{ padding: 22, marginBottom: 16, display: 'grid', gap: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 650, margin: 0 }}>{t('Company Details')}</h2>
        <L label={t('Tel No.')}><input className="ktc-input" value={tel} onChange={(e) => setTel(e.target.value)} /></L>
        <L label={t('Mobile No. *')}><input className="ktc-input" value={mobile} onChange={(e) => setMobile(e.target.value)} /></L>
        <L label={t('Email Address *')}><input className="ktc-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></L>
      </div>

      <div className="ktc-glass" style={{ padding: 22, marginBottom: 16, display: 'grid', gap: 10 }}>
        <h2 style={{ fontSize: 14, fontWeight: 650, margin: 0 }}>{t('Authorized Representatives')}</h2>
        <p className="ktc-label" style={{ fontSize: 11.5, margin: 0 }}>{t('If an authorized representative, indicate the role in Position.')}</p>
        {contacts.map((c, i) => (
          <div key={i} style={{ display: 'grid', gap: 6, padding: 10, borderRadius: 10, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input className="ktc-input ktc-input--compact" style={{ flex: '1 1 160px' }} placeholder={t('Name')} value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} />
              <input className="ktc-input ktc-input--compact" style={{ flex: '1 1 140px' }} placeholder={t('Position')} value={c.position} onChange={(e) => setContact(i, { position: e.target.value })} />
              <input className="ktc-input ktc-input--compact" style={{ flex: '1 1 140px' }} placeholder={t('Contact Number')} value={c.contact_number} onChange={(e) => setContact(i, { contact_number: e.target.value })} />
              <input className="ktc-input ktc-input--compact" style={{ flex: '1 1 160px' }} placeholder={t('Email Address')} value={c.email} onChange={(e) => setContact(i, { email: e.target.value })} />
            </div>
            {contacts.length > 1 && (
              <button type="button" className="ktc-link" onClick={() => setContacts((cs) => cs.filter((_, idx) => idx !== i))} style={{ fontSize: 12, justifySelf: 'start' }}>{t('Remove')}</button>
            )}
          </div>
        ))}
        <button type="button" className="ktc-link" onClick={() => setContacts((cs) => [...cs, emptyContact()])} style={{ fontSize: 12.5, justifySelf: 'start' }}>{t('+ Add representative')}</button>
      </div>

      <div className="ktc-glass" style={{ padding: 22, marginBottom: 16, display: 'grid', gap: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 650, margin: 0 }}>{t('Required Documents')}</h2>
        <DocRow label={t('BIR Certificate of Registration (2303) *')} path={doc2303Path} picked={file2303}
          onPick={setFile2303} onView={() => void openFromStorage('customer-docs', doc2303Path, t('BIR 2303'))} t={t} />
        <DocRow label={t('BIR Form 2307 (if withholding agent)')} path={doc2307Path} picked={file2307}
          onPick={setFile2307} onView={() => void openFromStorage('customer-docs', doc2307Path, t('BIR 2307'))} t={t} />
        <DocRow label={t('Zero-Rating Certificate (if zero-rated)')} path={docZeroPath} picked={fileZero}
          onPick={setFileZero} onView={() => void openFromStorage('customer-docs', docZeroPath, t('Zero-Rating Certificate'))} t={t} />
      </div>

      <div className="ktc-glass" style={{ padding: 22, marginBottom: 16, display: 'grid', gap: 12 }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12.5, lineHeight: 1.5 }}>
          <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} style={{ marginTop: 3 }} />
          <span>{t('I certify that all the information provided is true, correct, and complete to the best of my knowledge, and I will notify KTC of any changes.')}</span>
        </label>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="ktc-btn" disabled={busy} onClick={() => void save()} style={{ width: 'auto', padding: '10px 22px' }}>
            {busy ? t('Saving…') : t('Save')}
          </button>
          <Link to="/account" className="ktc-link" style={{ fontSize: 13 }}>{t('Back to My Account')}</Link>
        </div>
      </div>
      {viewerModal}
    </Shell>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'grid', gap: 6 }}><label className="ktc-label">{label}</label>{children}</div>
}

function DocRow({ label, path, picked, onPick, onView, t }: {
  label: string; path: string | null; picked: File | null
  onPick: (f: File | null) => void; onView: () => void
  t: (k: string) => string
}) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label className="ktc-label" style={{ fontSize: 11.5 }}>{label}</label>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="ktc-input ktc-input--compact" type="file" accept="image/*,application/pdf"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)} style={{ padding: '6px 10px', flex: '1 1 220px' }} />
        {path && !picked && <button type="button" className="ktc-link" onClick={onView} style={{ fontSize: 12 }}>{t('View current')}</button>}
        {path && !picked && <span className="ktc-label" style={{ fontSize: 11 }}>{t('on file')}</span>}
      </div>
    </div>
  )
}
