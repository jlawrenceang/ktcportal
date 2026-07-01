import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Shell from '../components/Shell'
import { supabase } from '../lib/supabase'
import { prepareUpload } from '../lib/validation'
import { useBroker } from '../lib/useBroker'
import SearchPicker, { type PickerItem } from '../components/SearchPicker'
import ConsigneeRequestForm from '../components/ConsigneeRequestForm'
import ContainerLinesEditor, { emptyLine, type LineDraft } from '../components/ContainerLinesEditor'
import { searchConsignees } from '../lib/pickerSearches'
import { formatEntryNumberInput, isCompleteEntryNumber, normalizeEntryNumber } from '../lib/entryNumber'
import { usePageTour } from '../components/TourProvider'
import { jobOrderSteps } from '../components/WelcomeTour'
import { useT } from '../lib/i18n'
import Wizard, { type WizardStep } from '../components/Wizard'
import Notice from '../components/Notice'

const MAX_SUPPORTING_IMAGES = 10

export default function JobOrder() {
  const { t } = useT()
  const { broker } = useBroker()
  const navigate = useNavigate()
  // Mobile renders this form as a paginated wizard (one step on screen). Lift
  // the step so the demo tour can WALK it — each tour step reveals its fields —
  // and so it resets to the first step when the demo finishes.
  const [wizStep, setWizStep] = useState(0)
  const tourSteps = useMemo(
    // The wizard has 2 steps but 3 tour cards: cards 0 (consignee) + 1 (vessel) both
    // live in wizStep 0; card 2 (containers) is wizStep 1. Map accordingly so each
    // card's spotlight target is actually on screen when it opens.
    () => jobOrderSteps.map((s, idx) => ({ ...s, onEnter: () => setWizStep(idx < 2 ? 0 : 1) })),
    [],
  )
  usePageTour('job-order', tourSteps, () => setWizStep(0))

  // Consignee picker — searchable typeahead over the full master list.
  // (No per-broker accreditation gate: any registered broker can pick any consignee.)
  const [consignee, setConsignee] = useState<PickerItem | null>(null)
  function pickConsignee(item: PickerItem | null) { setConsignee(item) }
  const [entryNumber, setEntryNumber] = useState('')
  const [supportingDocs, setSupportingDocs] = useState<File[]>([])
  const [docError, setDocError] = useState<string | null>(null)
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Ref guard: state updates are async, so a rapid double-click can pass a
  // `busy` check twice and file the order twice.
  const submittingRef = useRef(false)
  const [reviewing, setReviewing] = useState(false)
  // On success we keep the customer on this page and confirm the filed order's
  // reference (the assigned JO number) rather than silently redirecting.
  const [filed, setFiled] = useState<{ joNumber: string | null; warning?: string | null } | null>(null)

  // Vessel + voyage (required) — picked from the current vessel schedule ONLY.
  // A call not yet listed is operations' work: the customer contacts KTC CS to
  // have it added (self-service "new vessel" would conflict with the schedule).
  type VesselOpt = { vessel_visit: string; vessel_name: string; voyage_number: string }
  const [vessels, setVessels] = useState<VesselOpt[]>([])
  const [vesselVisit, setVesselVisit] = useState('')
  useEffect(() => {
    void supabase.from('vessel_schedule_v').select('vessel_visit, vessel_name, voyage_number').eq('is_current', true).order('vessel_name')
      .then(({ data }) => setVessels((data ?? []) as VesselOpt[]))
  }, [])

  // Lara hands off a prefilled draft ONLY when it navigates here with ?laraDraft=1
  // (nav.newJO.draft). Consume it exactly once — otherwise a stale draft could
  // re-apply after the user starts editing, or leak into an unrelated later visit
  // on a shared tab. Vessel matching waits for the schedule to load (second effect).
  const laraDraftRef = useRef<{ entry?: string; vessel?: string } | null>(null)
  const laraConsumedRef = useRef(false)
  useEffect(() => {
    if (laraConsumedRef.current) return
    if (new URLSearchParams(window.location.search).get('laraDraft') !== '1') return
    laraConsumedRef.current = true
    let raw: string | null = null
    try { raw = sessionStorage.getItem('ktc_lara_job_order_draft') } catch { /* ignore */ }
    try { sessionStorage.removeItem('ktc_lara_job_order_draft') } catch { /* ignore */ }
    if (!raw) return
    try {
      const draft = JSON.parse(raw) as { entry?: string; vessel?: string }
      laraDraftRef.current = draft
      if (draft.entry) setEntryNumber(formatEntryNumberInput(draft.entry))
    } catch { /* ignore a malformed draft */ }
  }, [])
  useEffect(() => {
    const draft = laraDraftRef.current
    if (!draft?.vessel || !vessels.length) return
    const needle = draft.vessel.toUpperCase()
    const hit = vessels.find((v) => `${v.vessel_name} ${v.voyage_number} ${v.vessel_visit}`.toUpperCase().includes(needle))
    if (hit) setVesselVisit(hit.vessel_visit)
    laraDraftRef.current = { ...draft, vessel: undefined }  // match once — never re-clobber
  }, [vessels])

  // Per-step validation (used to gate Next on mobile; the full re-check still
  // runs in submit()). Step 1 needs a consignee AND the entry (C-) number.
  function step1Error() {
    if (!consignee) return t('Select a consignee from the list.')
    if (!isCompleteEntryNumber(entryNumber)) return t('Enter the Entry Number starting with C-.')
    const ev = vesselError(); if (ev) return ev
    return null
  }
  function vesselError() {
    return !vessels.find((v) => v.vessel_visit === vesselVisit) ? t('Select the vessel & voyage from the list.') : null
  }

  // Show a "review everything before submitting" confirmation. Validates the
  // same fields submit() does, jumping to the offending step if something's off.
  function openReview() {
    setError(null)
    const e1 = step1Error(); if (e1) { setError(e1); setWizStep(0); return }
    if (lines.filter((l) => l.container_number.trim()).length === 0) { setError(t('Add at least one container.')); setWizStep(1); return }
    setReviewing(true)
  }
  const reviewVessel = (() => { const s = vessels.find((v) => v.vessel_visit === vesselVisit); return s ? `${s.vessel_name.toUpperCase()} — ${s.voyage_number.toUpperCase()}` : '' })()
  const filledLines = lines.filter((l) => l.container_number.trim())
  const containerCountLabel = t(filledLines.length === 1 ? '{count} container van' : '{count} container vans', { count: filledLines.length })

  function addSupportingImages(files: FileList | null) {
    if (!files) return
    setDocError(null)
    const incoming = Array.from(files)
    const images = incoming.filter((f) => f.type.startsWith('image/'))
    if (images.length !== incoming.length) setDocError(t('Only image files are allowed for job order verification documents.'))
    const room = MAX_SUPPORTING_IMAGES - supportingDocs.length
    if (room <= 0) {
      setDocError(t('You can attach up to {n} image(s).', { n: MAX_SUPPORTING_IMAGES }))
      return
    }
    const next = images.slice(0, room)
    if (images.length > room) setDocError(t('You can attach up to {n} image(s).', { n: MAX_SUPPORTING_IMAGES }))
    setSupportingDocs((prev) => [...prev, ...next])
  }

  async function uploadSupportingImages(orderId: string): Promise<string | null> {
    if (!broker || supportingDocs.length === 0) return null
    const failed: string[] = []
    for (const [idx, file] of supportingDocs.entries()) {
      const prepared = await prepareUpload(file)
      if ('error' in prepared) {
        failed.push(`${file.name}: ${prepared.error}`)
        continue
      }
      const safe = prepared.file.name.replace(/[^A-Za-z0-9._-]/g, '_')
      const path = `${broker.user_id}/${orderId}/${Date.now()}_${idx}_${safe}`
      const { error: upErr } = await supabase.storage.from('jo-documents').upload(path, prepared.file, { upsert: false })
      if (upErr) {
        failed.push(`${file.name}: ${upErr.message}`)
        continue
      }
      const { error: rpcErr } = await supabase.rpc('add_jo_support', {
        p_jo: orderId,
        p_path: path,
        p_filename: file.name,
        p_note: t('Verification document attached during filing.'),
      })
      if (rpcErr) failed.push(`${file.name}: ${rpcErr.message}`)
    }
    return failed.length
      ? t('Job Order filed, but some supporting images were not attached: {items}', { items: failed.join('; ') })
      : null
  }

  async function submit() {
    if (submittingRef.current) return
    setError(null)
    if (!broker) {
      setError(t('Customer profile not found.'))
      return
    }
    if (!consignee) {
      setError(t('Select a consignee from the list.'))
      return
    }
    const normalizedEntry = normalizeEntryNumber(entryNumber)
    if (!isCompleteEntryNumber(normalizedEntry)) {
      setError(t('Enter the Entry Number starting with C-.'))
      return
    }
    // Resolve vessel + voyage (required). Entry, vessel, voyage and container
    // numbers are all stored UPPERCASE — shipping identifiers are canonically caps.
    const sel = vessels.find((v) => v.vessel_visit === vesselVisit)
    if (!sel) { setError(t('Select the vessel & voyage from the list.')); return }
    const vVisit: string = sel.vessel_visit
    const vName = sel.vessel_name.toUpperCase()
    const vVoyage = sel.voyage_number.toUpperCase()
    const filled = filledLines
    if (filled.length === 0) {
      setError(t('Add at least one container.'))
      return
    }
    submittingRef.current = true
    setBusy(true)
    try {
      // Atomic: the order + its lines are inserted in one transaction server-side
      // (0098), so a failure can't leave an orphan line-less order. Pending vs
      // approved (held/submitted) is decided in the RPC.
      const { data: newId, error: fileErr } = await supabase.rpc('file_job_order', {
        p_consignee: consignee.id,
        p_entry_number: normalizedEntry,
        p_vessel_visit: vVisit,
        p_vessel_name: vName,
        p_voyage_number: vVoyage,
        p_lines: filled.map((l) => ({ container_number: l.container_number.trim().toUpperCase(), service_request: l.service_request })),
      })
      if (fileErr) {
        setError(fileErr.message)
        return
      }
      // The RPC returns the new order's id; look up its assigned JO number so we
      // can confirm the reference to the customer (null while still "Draft").
      let joNumber: string | null = null
      let warning: string | null = null
      if (newId) {
        const id = newId as string
        try { sessionStorage.setItem('ktc_jo_filed_id', id) } catch { /* ignore */ }
        warning = await uploadSupportingImages(id)
        const { data: row } = await supabase.from('job_orders').select('jo_number').eq('id', id).maybeSingle()
        joNumber = row?.jo_number ?? null
      }
      setFiled({ joNumber, warning })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not file the Job Order. Please try again.'))
    } finally {
      setBusy(false)
      submittingRef.current = false
    }
  }

  const wizardSteps: WizardStep[] = [
    {
      title: 'Consignee, entry & vessel',
      validate: step1Error,
      content: (
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="ktc-fields" data-tour="jo-consignee">
            <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
              <label className="ktc-label" htmlFor="consignee">{t('Consignee')} *</label>
              <SearchPicker
                inputId="consignee"
                placeholder={t('Search consignee by code or name…')}
                selected={consignee}
                onSelect={pickConsignee}
                search={searchConsignees}
                minChars={1}
              />
              <ConsigneeRequestForm />
            </div>
            <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
              <label className="ktc-label" htmlFor="entry">{t('Entry Number')} *</label>
              <input
                id="entry"
                className="ktc-input"
                required
                placeholder={t('e.g. C-0000012345')}
                value={entryNumber}
                onChange={(e) => setEntryNumber(formatEntryNumberInput(e.target.value))}
                onBlur={() => setEntryNumber((v) => normalizeEntryNumber(v))}
                style={{ textTransform: 'uppercase' }}
              />
            </div>
          </div>

          <div data-tour="jo-vessel" style={{ display: 'grid', gap: 6 }}>
            <label className="ktc-label" htmlFor="vessel">{t('Vessel & Voyage')} *</label>
            <select id="vessel" className="ktc-input" value={vesselVisit} onChange={(e) => setVesselVisit(e.target.value)}>
              <option value="">{t('Select a vessel…')}</option>
              {vessels.map((v) => (
                <option key={v.vessel_visit} value={v.vessel_visit}>{v.vessel_name.toUpperCase()} — {v.voyage_number.toUpperCase()}</option>
              ))}
            </select>
            <span className="ktc-label" style={{ fontSize: 11.5 }}>
              {t('If the vessel isn’t listed here, please call KTC customer service for updates.')}
            </span>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <label className="ktc-label" htmlFor="jo-supporting-images">{t('Verification documents')}</label>
              <span className="ktc-label" style={{ fontSize: 11.5 }}>{supportingDocs.length}/{MAX_SUPPORTING_IMAGES}</span>
            </div>
            <input
              id="jo-supporting-images"
              className="ktc-input"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => { addSupportingImages(e.target.files); e.currentTarget.value = '' }}
              style={{ padding: '10px 13px' }}
            />
            <span className="ktc-label" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
              {t('Optional: attach up to {n} image(s) that verify the legitimacy of this job order.', { n: MAX_SUPPORTING_IMAGES })}
            </span>
            {docError && <div role="alert" style={{ color: 'var(--acc-2)', fontSize: 12.5 }}>{docError}</div>}
            {supportingDocs.length > 0 && (
              <div style={{ display: 'grid', gap: 6 }}>
                {supportingDocs.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 9, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5 }}>{file.name}</span>
                    <button type="button" className="ktc-link" style={{ fontSize: 12.5, color: 'var(--acc-2)' }}
                      onClick={() => setSupportingDocs((prev) => prev.filter((_, i) => i !== idx))}>
                      {t('Remove')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Containers',
      content: (
        <div data-tour="jo-containers"><ContainerLinesEditor lines={lines} onChange={setLines} /></div>
      ),
    },
  ]

  return (
    <Shell>
      <div className="ktc-glass ktc-pad-mobile" style={{ padding: 22 }}>
        <h1 className="ktc-title">{t('New Job Order')}</h1>
        <p className="ktc-label" style={{ marginTop: 5, marginBottom: 16 }}>
          {t('File for container terminal services.')}
        </p>

        {filed ? (
          <Notice
            tone="success"
            title={t('Job Order filed')}
            action={
              <button type="button" className="ktc-btn" style={{ width: 'auto', padding: '10px 18px' }} onClick={() => navigate('/job-orders')}>
                {t('View job orders')}
              </button>
            }
          >
            <span>
              {filed.joNumber
                ? <>{t('Your reference is')} <span className="ktc-mono" style={{ fontWeight: 700 }}>{filed.joNumber}</span></>
                : t('Your job order has been filed.')}
              {filed.warning && (
                <span style={{ display: 'block', marginTop: 8, color: 'var(--acc-2)', fontWeight: 600 }}>{filed.warning}</span>
              )}
            </span>
          </Notice>
        ) : (
          <Wizard
            steps={wizardSteps}
            step={wizStep}
            onStepChange={setWizStep}
            onSubmit={openReview}
            busy={busy}
            error={error}
            submitLabel={busy ? t('Submitting…') : t('Submit Job Order')}
          />
        )}
      </div>

      {reviewing && (
        <div className="ktc-modal-backdrop" onClick={() => setReviewing(false)}>
          <div className="ktc-glass ktc-modal-panel" onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 460, padding: 0, display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--glass-brd)' }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{t('Review before submitting')}</div>
              <div className="ktc-label" style={{ fontSize: 12, marginTop: 2 }}>{t('Please double-check everything before you file.')}</div>
            </div>
            <div style={{ overflowY: 'auto', padding: '14px 20px', display: 'grid', gap: 10, fontSize: 13.5 }}>
              <div><span className="ktc-label" style={{ fontSize: 12 }}>{t('Consignee')}</span><div style={{ fontWeight: 600 }}>{consignee?.title}{consignee?.sub ? ` — ${consignee.sub}` : ''}</div></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'end' }}>
                <div><span className="ktc-label" style={{ fontSize: 12 }}>{t('Entry Number')}</span><div style={{ fontWeight: 600 }}>{normalizeEntryNumber(entryNumber)}</div></div>
                <div style={{ justifySelf: 'end' }}><span className="ktc-label" style={{ fontSize: 12 }}>{t('Containers')}</span><div style={{ fontWeight: 600 }}>{containerCountLabel}</div></div>
              </div>
              <div><span className="ktc-label" style={{ fontSize: 12 }}>{t('Vessel & Voyage')}</span><div style={{ fontWeight: 600 }}>{reviewVessel}</div></div>
              <div><span className="ktc-label" style={{ fontSize: 12 }}>{t('Verification documents')}</span><div style={{ fontWeight: 600 }}>{t('{n} image(s)', { n: supportingDocs.length })}</div></div>
              <div>
                <span className="ktc-label" style={{ fontSize: 12 }}>{t('Containers')}</span>
                <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
                  {filledLines.map((l, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 10px', borderRadius: 8, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
                      <span className="ktc-mono">{l.container_number.trim().toUpperCase()}</span>
                      <span className="ktc-label" style={{ fontSize: 12 }}>{l.service_request}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '14px 20px', borderTop: '1px solid var(--glass-brd)' }}>
              <button type="button" className="ktc-btn" disabled={busy} onClick={() => { setReviewing(false); void submit() }} style={{ width: 'auto', padding: '10px 18px' }}>
                {t('Confirm & submit')}
              </button>
              <button type="button" className="ktc-link" disabled={busy} onClick={() => setReviewing(false)}>{t('← Go back & edit')}</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}
