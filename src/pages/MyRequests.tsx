import { useEffect, useState } from 'react'
import Shell from '../components/Shell'
import Notice from '../components/Notice'
import Modal from '../components/Modal'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useBroker } from '../lib/useBroker'
import { prepareUpload } from '../lib/validation'
import { useT } from '../lib/i18n'
import { usePageTour } from '../components/TourProvider'
import { requestsSteps } from '../components/WelcomeTour'

// Customer "My Requests" — their new-consignee submissions and where they stand.
// A request KTC tagged "needs info" can be edited & resubmitted here (back to
// pending). Backed by RLS (own consignees) + the resubmit_consignee RPC (0138).
// NOTE: vessel requests are NOT a customer path — the vessel schedule is ops-only.
// If a vessel isn't listed, the customer calls KTC customer service to have ops
// add it (see the JO filing help line).
type CReq = { id: string; code: string; name: string; status: string; address: string | null; tin: string | null; note: string | null; customer_name: string | null; address2: string | null; tel: string | null; mobile: string | null; email: string | null }

const STYLE: Record<string, { bg: string; fg: string }> = {
  pending: { bg: 'var(--c-h40-90-94)', fg: 'var(--c-h35-80-38)' },
  needs_info: { bg: 'var(--c-h40-95-92)', fg: 'var(--c-h30-70-38)' },
  approved: { bg: 'var(--c-h150-50-93)', fg: 'var(--c-h150-60-30)' },
  rejected: { bg: 'var(--c-h0-70-95)', fg: 'var(--c-h0-65-45)' },
}

export default function MyRequests() {
  const { t } = useT()
  usePageTour('requests', requestsSteps)
  const { session } = useAuth()
  const { broker } = useBroker()
  const [cons, setCons] = useState<CReq[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [editC, setEditC] = useState<CReq | null>(null)

  async function load() {
    if (!broker?.id) return
    const { data: c } = await supabase
      .from('consignees')
      .select('id, code, name, status, address, tin, note, customer_name, address2, tel, mobile, email')
      .eq('requested_by', broker.id)
      .order('requested_at', { ascending: false })
    setCons((c ?? []) as CReq[])
    setLoading(false)
  }
  useEffect(() => { void load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [broker?.id])

  const label = (s: string) => ({ pending: t('Pending approval'), needs_info: t('Needs info'), approved: t('Approved'), rejected: t('Not approved') }[s] ?? s)
  const badge = (s: string) => {
    const st = STYLE[s] ?? STYLE.pending
    return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: st.bg, color: st.fg, whiteSpace: 'nowrap' }}>{label(s)}</span>
  }

  if (loading) return <Shell><div className="ktc-label">{t('Loading…')}</div></Shell>

  return (
    <Shell>
      <div className="ktc-glass" style={{ padding: 20, marginBottom: 16 }}>
        <h1 className="ktc-title" style={{ fontSize: 18, margin: 0 }}>{t('My Requests')}</h1>
        <p className="ktc-sub" style={{ fontSize: 12.5, marginTop: 6, marginBottom: 0 }}>
          {t('Your new-consignee requests. If KTC needs more info, edit and resubmit here.')}
        </p>
      </div>
      {err && <Notice tone="error" style={{ marginBottom: 14 }}>{err}</Notice>}
      {msg && <Notice tone="success" style={{ marginBottom: 14 }}>{msg}</Notice>}

      <div className="ktc-glass" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 650, margin: '0 0 12px' }}>{t('Consignee requests')}</h2>
        {cons.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 13 }}>{t('None yet.')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {cons.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderBottom: '1px solid hsl(var(--line-soft))' }}>
                <span style={{ flex: 1, minWidth: 160, fontSize: 14 }}>
                  <b>{c.code}</b> – {c.name}
                  {(c.status === 'needs_info' || c.status === 'rejected') && c.note && <div className="ktc-label" style={{ fontSize: 11.5, marginTop: 2, fontStyle: 'italic' }}>“{c.note}”</div>}
                </span>
                {badge(c.status)}
                {(c.status === 'needs_info' || c.status === 'rejected') && <button type="button" className="ktc-btn ktc-btn--sm" onClick={() => setEditC(c)} style={{ width: 'auto', padding: '6px 12px', fontSize: 12.5 }}>{t('Edit & resubmit')}</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {editC && <ConsigneeResubmit req={editC} uid={session?.user.id} onClose={() => setEditC(null)} onDone={() => { setEditC(null); setMsg(t('Resubmitted — pending KTC approval.')); void load() }} onError={setErr} />}
    </Shell>
  )
}

function ConsigneeResubmit({ req, uid, onClose, onDone, onError }: {
  req: CReq; uid?: string; onClose: () => void; onDone: () => void; onError: (m: string) => void
}) {
  const { t } = useT()
  const [name, setName] = useState(req.name)
  const [customerName, setCustomerName] = useState(req.customer_name ?? '')
  const [address, setAddress] = useState(req.address ?? '')
  const [address2, setAddress2] = useState(req.address2 ?? '')
  const [tin, setTin] = useState(req.tin ?? '')
  const [tel, setTel] = useState(req.tel ?? '')
  const [mobile, setMobile] = useState(req.mobile ?? '')
  const [email, setEmail] = useState(req.email ?? '')
  const [doc2303, setDoc2303] = useState<File | null>(null)
  const [doc2307, setDoc2307] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  async function uploadDoc(file: File, tag: string): Promise<string> {
    const prepared = await prepareUpload(file)
    if ('error' in prepared) throw new Error(prepared.error)
    const ext = prepared.file.name.split('.').pop()?.toLowerCase() || 'pdf'
    const path = `${uid}/req-${crypto.randomUUID()}-${tag}.${ext}`
    const { error } = await supabase.storage.from('consignee-docs').upload(path, prepared.file, { upsert: true })
    if (error) throw new Error(error.message)
    return path
  }

  async function submit() {
    if (name.trim().length < 2) { onError(t('Enter the consignee name.')); return }
    setBusy(true)
    try {
      const p2303 = doc2303 ? await uploadDoc(doc2303, '2303') : null
      const p2307 = doc2307 ? await uploadDoc(doc2307, '2307') : null
      const { error } = await supabase.rpc('resubmit_consignee', {
        p_id: req.id, p_name: name.trim(), p_address: address.trim() || null, p_tin: tin.trim() || null,
        p_doc_2303: p2303, p_doc_2307: p2307,
        p_customer_name: customerName.trim() || null, p_address2: address2.trim() || null,
        p_tel: tel.trim() || null, p_mobile: mobile.trim() || null, p_email: email.trim() || null,
      })
      if (error) throw error
      onDone()
    } catch (e) { onError((e as { message?: string }).message ?? t('Could not resubmit.')) } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} title={t('Edit & resubmit consignee')}>
      <div style={{ display: 'grid', gap: 10 }}>
        {req.note && <div className="ktc-label" style={{ fontSize: 12.5, fontStyle: 'italic' }}>{t('KTC asked:')} “{req.note}”</div>}
        <div style={{ display: 'grid', gap: 5 }}><label className="ktc-label" style={{ fontSize: 11.5 }}>{t('Consignee name *')}</label><input className="ktc-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div style={{ display: 'grid', gap: 5 }}><label className="ktc-label" style={{ fontSize: 11.5 }}>{t('Customer name (leave blank if same as trade name)')}</label><input className="ktc-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></div>
        <div style={{ display: 'grid', gap: 5 }}><label className="ktc-label" style={{ fontSize: 11.5 }}>{t('Business address')}</label><input className="ktc-input" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div style={{ display: 'grid', gap: 5 }}><label className="ktc-label" style={{ fontSize: 11.5 }}>{t('Business address line 2')}</label><input className="ktc-input" value={address2} onChange={(e) => setAddress2(e.target.value)} /></div>
        <div style={{ display: 'grid', gap: 5 }}><label className="ktc-label" style={{ fontSize: 11.5 }}>{t('TIN / VAT Reg #')}</label><input className="ktc-input" value={tin} onChange={(e) => setTin(e.target.value)} /></div>
        <div style={{ display: 'grid', gap: 5 }}><label className="ktc-label" style={{ fontSize: 11.5 }}>{t('Tel No.')}</label><input className="ktc-input" value={tel} onChange={(e) => setTel(e.target.value)} /></div>
        <div style={{ display: 'grid', gap: 5 }}><label className="ktc-label" style={{ fontSize: 11.5 }}>{t('Mobile No.')}</label><input className="ktc-input" value={mobile} onChange={(e) => setMobile(e.target.value)} /></div>
        <div style={{ display: 'grid', gap: 5 }}><label className="ktc-label" style={{ fontSize: 11.5 }}>{t('Email address')}</label><input className="ktc-input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div style={{ display: 'grid', gap: 5 }}><label className="ktc-label" style={{ fontSize: 11.5 }}>{t('Replace BIR 2303 (optional)')}</label><input className="ktc-input" type="file" accept="image/*,application/pdf" onChange={(e) => setDoc2303(e.target.files?.[0] ?? null)} style={{ padding: '7px 10px' }} /></div>
        <div style={{ display: 'grid', gap: 5 }}><label className="ktc-label" style={{ fontSize: 11.5 }}>{t('Replace BIR 2307 (optional)')}</label><input className="ktc-input" type="file" accept="image/*,application/pdf" onChange={(e) => setDoc2307(e.target.files?.[0] ?? null)} style={{ padding: '7px 10px' }} /></div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
          <button type="button" className="ktc-btn" disabled={busy} onClick={() => void submit()} style={{ width: 'auto', padding: '9px 18px' }}>{busy ? t('Resubmitting…') : t('Resubmit')}</button>
          <button type="button" className="ktc-link" onClick={onClose} style={{ fontSize: 13 }}>{t('Cancel')}</button>
        </div>
      </div>
    </Modal>
  )
}
