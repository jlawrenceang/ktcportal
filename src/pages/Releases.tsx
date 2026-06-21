import { useEffect, useState } from 'react'
import Shell from '../components/Shell'
import Notice from '../components/Notice'
import SearchPicker, { type PickerItem } from '../components/SearchPicker'
import FileViewerModal from '../components/FileViewerModal'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { searchConsignees } from '../lib/pickerSearches'
import { prepareUpload } from '../lib/validation'
import { peso } from '../lib/pricing'
import { useT } from '../lib/i18n'
import { PaperclipIcon } from '../components/icons'
import { RELEASE_STATUS_LABEL, type ReleaseOrder, type ReleaseStatus, type ReleaseSupplement } from '../lib/types'

// Customer-facing Release / Pull-out page (ADR-0024, migration 0124).
// File an online release, upload the DO/BL for KTC's document check, pay the
// charges KTC assesses, then claim the Official Receipt at the office to pull
// out. Customers have no UPDATE policy — every change goes through a SECURITY
// DEFINER RPC (file_release_order / resubmit_release_doc / submit_release_payment).

const SELECT_COLS =
  'id, release_number, bl_number, status, amount, charges_note, payment_status, payment_proof_path, payment_note, or_number, staff_note, created_at, consignee:consignees(code, name), supplements:release_supplements(id, label, amount, payment_status, payment_proof_path, payment_note, created_at)'

// Per-status semantic tone for the .ktc-chip status pill (mirrors MyJobOrders).
const STATUS_TONE: Record<ReleaseStatus, string> = {
  submitted: 'info',
  docs_verified: 'progress',
  payable: 'warning',
  paid: 'success',
  released: 'success',
  on_hold: 'warning',
  cancelled: '',
}

// Tone + label for an additional-charge line's own payment status chip.
const SUPP_TONE: Record<ReleaseSupplement['payment_status'], string> = {
  unpaid: 'warning',
  submitted: 'info',
  confirmed: 'success',
  rejected: '',
}
const SUPP_LABEL: Record<ReleaseSupplement['payment_status'], string> = {
  unpaid: 'Unpaid',
  submitted: 'Under review',
  confirmed: 'Paid',
  rejected: 'Rejected',
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}

function StatusBadge({ status }: { status: ReleaseStatus }) {
  const { t } = useT()
  const tone = STATUS_TONE[status]
  return (
    <span className={tone ? `ktc-chip ktc-chip--${tone}` : 'ktc-chip'}>
      {t(RELEASE_STATUS_LABEL[status])}
    </span>
  )
}

// A single picked-file chip with a remove control (matches VerifyId / Payment).
function FileChip({ file, onRemove, disabled }: { file: File; onRemove: () => void; disabled?: boolean }) {
  const { t } = useT()
  return (
    <span style={{ fontSize: 13, fontWeight: 500, padding: '9px 13px', borderRadius: 10, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <PaperclipIcon size={14} /> {file.name}
      <button type="button" className="ktc-link" disabled={disabled} onClick={onRemove} style={{ marginLeft: 4, fontSize: 12, color: 'var(--acc-2)' }}>{t('Remove')}</button>
    </span>
  )
}

export default function Releases() {
  const { t } = useT()
  const { session } = useAuth()
  const uid = session?.user.id

  // List of the customer's own release orders (read directly via RLS).
  const [rows, setRows] = useState<ReleaseOrder[]>([])
  const [loading, setLoading] = useState(true)

  // "File a release" form.
  const [consignee, setConsignee] = useState<PickerItem | null>(null)
  const [bl, setBl] = useState('')
  const [docFile, setDocFile] = useState<File | null>(null)
  const [filing, setFiling] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  // KTC bank / GCash details + QRPH code for the "How to pay" block.
  const [info, setInfo] = useState<Map<string, string>>(new Map())
  const [qrOpen, setQrOpen] = useState(false)

  // Detail modal.
  const [selected, setSelected] = useState<ReleaseOrder | null>(null)

  async function loadList() {
    const { data } = await supabase
      .from('release_orders')
      .select(SELECT_COLS)
      .order('created_at', { ascending: false })
    const list = (data ?? []) as unknown as ReleaseOrder[]
    setRows(list)
    setLoading(false)
    // Keep an open detail modal in sync after a refresh.
    setSelected((prev) => (prev ? list.find((r) => r.id === prev.id) ?? null : null))
  }

  useEffect(() => {
    void loadList()
    void supabase
      .from('payment_info')
      .select('key, value')
      .then(({ data }) => setInfo(new Map(((data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]))))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Upload a DO/BL document to release-docs and return its storage path.
  async function uploadDoc(file: File): Promise<{ path: string } | { error: string }> {
    if (!uid) return { error: t('Please sign in again.') }
    const prepared = await prepareUpload(file)
    if ('error' in prepared) return { error: t(prepared.error) }
    const safeName = prepared.file.name.replace(/[^A-Za-z0-9._-]/g, '_')
    const path = `${uid}/${Date.now()}-${safeName}`
    const { error: upErr } = await supabase.storage
      .from('release-docs')
      .upload(path, prepared.file, { upsert: true, contentType: prepared.file.type })
    if (upErr) return { error: upErr.message }
    return { path }
  }

  async function fileRelease() {
    setFileError(null)
    if (!bl.trim()) { setFileError(t('Enter the Bill of Lading (BL) number.')); return }
    setFiling(true)
    let docPath: string | null = null
    if (docFile) {
      const up = await uploadDoc(docFile)
      if ('error' in up) { setFiling(false); setFileError(up.error); return }
      docPath = up.path
    }
    const { error } = await supabase.rpc('file_release_order', {
      p_consignee: consignee?.id ?? null,
      p_bl: bl.trim().toUpperCase(),
      p_doc_path: docPath,
    })
    setFiling(false)
    if (error) { setFileError(error.message); return }
    setConsignee(null)
    setBl('')
    setDocFile(null)
    await loadList()
  }

  const qrPath = info.get('qr_path')
  const qrUrl = qrPath ? supabase.storage.from('payment-qr').getPublicUrl(qrPath).data.publicUrl : null
  const qrFileName = (qrPath?.split('/').pop()) || 'ktc-payment-qr.png'

  return (
    <Shell>
      {/* Header + intro */}
      <div style={{ margin: '14px 4px 20px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.025em' }}>{t('Release / Pull-out')}</h1>
        <p className="ktc-sub">
          {t('File an online release, upload your Delivery Order (DO) or Bill of Lading (BL) for verification, pay the charges, then claim your Official Receipt (OR) at the KTC office for pull-out.')}
        </p>
      </div>

      {/* File a release */}
      <div className="ktc-glass" style={{ padding: 26, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 650 }}>{t('File a release')}</h2>
        {fileError && <Notice tone="error" style={{ marginTop: 14 }}>{fileError}</Notice>}
        <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="rel-consignee">{t('Consignee')}</label>
            <SearchPicker
              inputId="rel-consignee"
              placeholder={t('Search consignee by code or name…')}
              selected={consignee}
              onSelect={setConsignee}
              search={searchConsignees}
            />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="rel-bl">{t('BL Number')} *</label>
            <input
              id="rel-bl"
              className="ktc-input"
              required
              placeholder={t('e.g. MAEU123456789')}
              value={bl}
              onChange={(e) => setBl(e.target.value.toUpperCase())}
              style={{ textTransform: 'uppercase' }}
            />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label">{t('Delivery Order (DO) or Bill of Lading (BL)')}</label>
            {!docFile ? (
              <>
                <input
                  className="ktc-input"
                  type="file"
                  accept="image/*,application/pdf"
                  disabled={filing}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { setDocFile(f); setFileError(null) } }}
                  style={{ maxWidth: 360, padding: '10px 13px' }}
                />
                <span className="ktc-label" style={{ fontSize: 12, opacity: 0.8 }}>{t('Optional now — KTC verifies the document before assessing the charges.')}</span>
              </>
            ) : (
              <div><FileChip file={docFile} onRemove={() => setDocFile(null)} disabled={filing} /></div>
            )}
          </div>
          <button
            type="button"
            className="ktc-btn"
            disabled={filing}
            onClick={() => void fileRelease()}
            style={{ width: 'auto', padding: '11px 22px', justifySelf: 'start' }}
          >
            {filing ? t('Filing…') : t('File release')}
          </button>
        </div>
      </div>

      {/* My releases */}
      <div className="ktc-glass" style={{ padding: 18 }}>
        <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 650 }}>{t('My releases')}</h2>
        <p className="ktc-sub" style={{ marginBottom: 14 }}>{t('Tap a row to open its full details.')}</p>

        {loading ? (
          <div style={{ display: 'grid', gap: 10 }} aria-label={t('Loading releases')}>
            {[52, 52, 52].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 12 }} />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>
            {t('No releases yet. File one above to get started.')}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                className="ktc-jo-row"
                onClick={() => setSelected(r)}
              >
                <span className="ktc-jo-id" style={{ minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <b className="ktc-mono" style={{ fontSize: 13.5 }}>{r.release_number ?? t('Draft')}</b>
                    <StatusBadge status={r.status} />
                  </span>
                  <span className="ktc-label" style={{ display: 'block', fontSize: 12, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t('BL')} {r.bl_number}{r.consignee ? ` · ${r.consignee.code} – ${r.consignee.name}` : ''}
                  </span>
                </span>
                <span className="ktc-jo-date ktc-label">{fmtDate(r.created_at)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <ReleaseDetail
          release={selected}
          uid={uid}
          info={info}
          qrUrl={qrUrl}
          onQrOpen={() => setQrOpen(true)}
          uploadDoc={uploadDoc}
          onClose={() => setSelected(null)}
          onChanged={loadList}
        />
      )}

      {qrOpen && qrUrl && (
        <FileViewerModal title={t('KTC Payment QR (QRPH)')} fileName={qrFileName} url={qrUrl} onClose={() => setQrOpen(false)} />
      )}
    </Shell>
  )
}

// ── Detail modal ──────────────────────────────────────────────────────────
function ReleaseDetail({ release, uid, info, qrUrl, onQrOpen, uploadDoc, onClose, onChanged }: {
  release: ReleaseOrder
  uid: string | undefined
  info: Map<string, string>
  qrUrl: string | null
  onQrOpen: () => void
  uploadDoc: (file: File) => Promise<{ path: string } | { error: string }>
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const { t } = useT()
  const r = release
  const [redoc, setRedoc] = useState<File | null>(null) // corrected document (on_hold)
  const [proof, setProof] = useState<File | null>(null) // payment proof
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-upload a corrected DO/BL for an on-hold release.
  async function resubmitDoc() {
    if (!redoc) { setError(t('Choose the corrected document first.')); return }
    setBusy(true); setError(null)
    const up = await uploadDoc(redoc)
    if ('error' in up) { setBusy(false); setError(up.error); return }
    const { error: rpcErr } = await supabase.rpc('resubmit_release_doc', { p_id: r.id, p_doc_path: up.path })
    setBusy(false)
    if (rpcErr) { setError(rpcErr.message); return }
    setRedoc(null)
    await onChanged()
    onClose()
  }

  // Upload a payment proof (deposit / transfer slip) to payment-slips.
  async function submitPayment() {
    if (!proof || !uid) { setError(t('Choose your payment slip first.')); return }
    setBusy(true); setError(null)
    const prepared = await prepareUpload(proof)
    if ('error' in prepared) { setBusy(false); setError(t(prepared.error)); return }
    const ext = prepared.file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${uid}/release-${r.id}.${ext}`
    const { error: upErr } = await supabase.storage.from('payment-slips').upload(path, prepared.file, { upsert: true })
    if (upErr) { setBusy(false); setError(upErr.message); return }
    const { error: rpcErr } = await supabase.rpc('submit_release_payment', { p_id: r.id, p_proof_path: path })
    setBusy(false)
    if (rpcErr) { setError(rpcErr.message); return }
    setProof(null)
    await onChanged()
  }

  const showPay = r.status === 'payable'
  const proofSubmitted = r.payment_status === 'submitted'
  const proofRejected = r.payment_status === 'rejected'

  return (
    <div className="ktc-modal-backdrop" onClick={onClose}>
      <div className="ktc-glass ktc-modal-panel" onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '15px 20px', borderBottom: '1px solid var(--glass-brd)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
            <b className="ktc-mono" style={{ fontSize: 15 }}>{r.release_number ?? t('Draft (no number yet)')}</b>
            <StatusBadge status={r.status} />
          </div>
          <button type="button" aria-label={t('Close')} onClick={onClose}
            style={{ fontSize: 20, lineHeight: 1, border: 0, background: 'none', cursor: 'pointer', color: 'hsl(var(--ink-2))', flex: '0 0 auto' }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '16px 20px' }}>
          {error && <Notice tone="error" style={{ marginBottom: 14 }}>{error}</Notice>}

          {/* Meta */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '12px 16px', fontSize: 13 }}>
            <div>
              <div className="ktc-label" style={{ fontSize: 11, opacity: 0.7 }}>{t('BL Number')}</div>
              <div style={{ fontWeight: 500, wordBreak: 'break-word' }}>{r.bl_number}</div>
            </div>
            <div>
              <div className="ktc-label" style={{ fontSize: 11, opacity: 0.7 }}>{t('Date filed')}</div>
              <div style={{ fontWeight: 500 }}>{fmtDate(r.created_at)}</div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="ktc-label" style={{ fontSize: 11, opacity: 0.7 }}>{t('Consignee')}</div>
              <div style={{ fontWeight: 500, wordBreak: 'break-word' }}>{r.consignee ? `${r.consignee.code} – ${r.consignee.name}` : '—'}</div>
            </div>
          </div>

          {/* Status-specific actions */}
          <div style={{ marginTop: 18, display: 'grid', gap: 14 }}>
            {r.status === 'submitted' && (
              <Notice tone="info">{t('KTC is verifying your document. You’ll see the charges here once it’s checked.')}</Notice>
            )}

            {r.status === 'docs_verified' && (
              <Notice tone="info">{t('Documents verified. KTC is computing your charges — check back shortly.')}</Notice>
            )}

            {r.status === 'on_hold' && (
              <div style={{ display: 'grid', gap: 10 }}>
                <Notice tone="warning" title={t('A corrected document is needed')}>
                  {r.staff_note || t('Please re-upload a clearer or corrected DO / BL.')}
                </Notice>
                {!redoc ? (
                  <input className="ktc-input" type="file" accept="image/*,application/pdf" disabled={busy}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { setRedoc(f); setError(null) } }}
                    style={{ maxWidth: 360, padding: '10px 13px' }} />
                ) : (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <FileChip file={redoc} onRemove={() => setRedoc(null)} disabled={busy} />
                    <button type="button" className="ktc-btn ktc-btn--sm" disabled={busy} onClick={() => void resubmitDoc()}>
                      {busy ? t('Sending…') : t('Resubmit document')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {showPay && (
              <>
                {/* Charges */}
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontWeight: 650, fontSize: 15 }}>{t('Amount due')}</span>
                    <span className="ktc-mono" style={{ fontWeight: 700, fontSize: 17 }}>{peso(r.amount ?? 0)}</span>
                  </div>
                  {r.charges_note && <p className="ktc-label" style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>{r.charges_note}</p>}
                </div>

                {/* How to pay (bank details + QRPH) */}
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', padding: '14px 16px', borderRadius: 12, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
                  <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 650 }}>{t('How to pay')}</h3>
                    <div style={{ display: 'grid', gap: 5, marginTop: 10, fontSize: 13 }}>
                      {info.get('bank_name') && <div><span className="ktc-label">{t('Bank:')}</span> <b>{info.get('bank_name')}</b></div>}
                      {info.get('account_name') && <div><span className="ktc-label">{t('Account name:')}</span> <b>{info.get('account_name')}</b></div>}
                      {info.get('account_number') && <div><span className="ktc-label">{t('Account no.:')}</span> <b className="ktc-mono">{info.get('account_number')}</b></div>}
                      {!info.get('bank_name') && !info.get('account_number') && !qrUrl && (
                        <span className="ktc-label">{t('Payment details will be posted here soon — or pay directly at the KTC cashier.')}</span>
                      )}
                    </div>
                    {info.get('instructions') && (
                      <p className="ktc-label" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>{info.get('instructions')}</p>
                    )}
                  </div>
                  {qrUrl && (
                    <div style={{ flex: '0 0 auto', textAlign: 'center', maxWidth: '100%' }}>
                      <button type="button" onClick={onQrOpen} title={t('Tap to enlarge or download')}
                        style={{ display: 'block', margin: '0 auto', padding: 0, border: 0, background: 'none', cursor: 'pointer' }}>
                        <img src={qrUrl} alt={t('Payment QR code')}
                          style={{ width: 'min(200px, 56vw)', aspectRatio: '1 / 1', objectFit: 'contain', borderRadius: 14, background: '#fff', border: '1px solid var(--glass-brd)', boxShadow: 'var(--shadow-sm)' }} />
                      </button>
                      <div className="ktc-label" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
                        {t('QRPH — scan with any bank or e-wallet app (GCash, Maya, etc.)')}<br />
                        <button type="button" className="ktc-link" style={{ fontSize: 11 }} onClick={onQrOpen}>{t('Tap to enlarge or download')}</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Payment proof upload */}
                {proofSubmitted ? (
                  <Notice tone="info">{t('Payment proof under review.')}</Notice>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {proofRejected && (
                      <Notice tone="error">{t('Your payment proof wasn’t accepted')}{r.payment_note ? <>: <b>{r.payment_note}</b></> : ''}. {t('Please re-upload a corrected slip.')}</Notice>
                    )}
                    <p className="ktc-label" style={{ fontSize: 13, margin: 0 }}>{t('Upload a clear photo or PDF of the deposit / transfer receipt.')}</p>
                    {!proof ? (
                      <input className="ktc-input" type="file" accept="image/*,application/pdf" disabled={busy}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) { setProof(f); setError(null) } }}
                        style={{ maxWidth: 360, padding: '10px 13px' }} />
                    ) : (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <FileChip file={proof} onRemove={() => setProof(null)} disabled={busy} />
                        <button type="button" className="ktc-btn ktc-btn--sm" disabled={busy} onClick={() => void submitPayment()}>
                          {busy ? t('Sending…') : t('Submit to KTC')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Additional charges (release_supplements) — each paid separately;
                the OR is blocked until every line is confirmed. */}
            {!!r.supplements?.length && (
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 650 }}>{t('Additional charges')}</h3>
                  <p className="ktc-label" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
                    {t('Charges KTC added after assessment. Pay to the same account / QR above. All additional charges must be settled before your Official Receipt (OR) can be released.')}
                  </p>
                </div>
                {r.supplements.map((s) => (
                  <SupplementRow key={s.id} supp={s} uid={uid} busy={busy} setBusy={setBusy} setError={setError} onChanged={onChanged} />
                ))}
              </div>
            )}

            {r.status === 'paid' && (
              <Notice tone="success" title={t('Paid')}>
                {t('Paid — claim your Official Receipt (OR) at the KTC office for pull-out.')}
              </Notice>
            )}

            {r.status === 'released' && (
              <Notice tone="success" title={t('Released')}>
                {r.or_number
                  ? t('Released — Official Receipt No. {no}.', { no: r.or_number })
                  : t('Released.')}
              </Notice>
            )}

            {r.status === 'cancelled' && (
              <Notice tone="warning">{t('This release was cancelled.')}{r.staff_note ? <> {r.staff_note}</> : ''}</Notice>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Additional-charge line ─────────────────────────────────────────────────
// One release_supplements row: shows label + amount + status chip, and lets the
// customer pay it (separate proof per line) when unpaid / rejected. Mirrors the
// base payment-proof upload (payment-slips bucket, submit_release_supplement_payment).
function SupplementRow({ supp, uid, busy, setBusy, setError, onChanged }: {
  supp: ReleaseSupplement
  uid: string | undefined
  busy: boolean
  setBusy: (b: boolean) => void
  setError: (e: string | null) => void
  onChanged: () => Promise<void>
}) {
  const { t } = useT()
  const s = supp
  const [proof, setProof] = useState<File | null>(null)
  const canPay = s.payment_status === 'unpaid' || s.payment_status === 'rejected'

  async function paySupplement() {
    if (!proof || !uid) { setError(t('Choose your payment slip first.')); return }
    setBusy(true); setError(null)
    const prepared = await prepareUpload(proof)
    if ('error' in prepared) { setBusy(false); setError(t(prepared.error)); return }
    const ext = prepared.file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${uid}/release-supp-${s.id}.${ext}`
    const { error: upErr } = await supabase.storage.from('payment-slips').upload(path, prepared.file, { upsert: true, contentType: prepared.file.type })
    if (upErr) { setBusy(false); setError(upErr.message); return }
    const { error: rpcErr } = await supabase.rpc('submit_release_supplement_payment', { p_id: s.id, p_proof_path: path })
    setBusy(false)
    if (rpcErr) { setError(rpcErr.message); return }
    setProof(null)
    await onChanged()
  }

  const tone = SUPP_TONE[s.payment_status]
  return (
    <div style={{ display: 'grid', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 13.5, minWidth: 0, wordBreak: 'break-word' }}>{s.label}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
          <b className="ktc-mono" style={{ fontSize: 14 }}>{peso(s.amount)}</b>
          <span className={tone ? `ktc-chip ktc-chip--${tone}` : 'ktc-chip'}>{t(SUPP_LABEL[s.payment_status])}</span>
        </span>
      </div>

      {s.payment_status === 'submitted' && (
        <span className="ktc-label" style={{ fontSize: 12.5 }}>{t('Payment proof under review.')}</span>
      )}
      {s.payment_status === 'confirmed' && (
        <span className="ktc-label" style={{ fontSize: 12.5 }}>{t('Paid.')}</span>
      )}

      {canPay && (
        <div style={{ display: 'grid', gap: 10 }}>
          {s.payment_status === 'rejected' && (
            <Notice tone="error">{t('Your payment proof wasn’t accepted')}{s.payment_note ? <>: <b>{s.payment_note}</b></> : ''}. {t('Please re-upload a corrected slip.')}</Notice>
          )}
          <span className="ktc-label" style={{ fontSize: 12.5 }}>{t('Pay to the same account / QR above, then upload your receipt.')}</span>
          {!proof ? (
            <input className="ktc-input" type="file" accept="image/*,application/pdf" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { setProof(f); setError(null) } }}
              style={{ maxWidth: 360, padding: '10px 13px' }} />
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <FileChip file={proof} onRemove={() => setProof(null)} disabled={busy} />
              <button type="button" className="ktc-btn ktc-btn--sm" disabled={busy} onClick={() => void paySupplement()}>
                {busy ? t('Sending…') : t('Submit to KTC')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
