import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Shell from '../components/Shell'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import SearchPicker, { type PickerItem } from '../components/SearchPicker'
import ConsigneeRequestForm from '../components/ConsigneeRequestForm'
import ContainerLinesEditor, { emptyLine, type LineDraft } from '../components/ContainerLinesEditor'
import { searchConsignees } from '../lib/pickerSearches'
import { usePageTour } from '../components/TourProvider'
import { jobOrderSteps } from '../components/WelcomeTour'
import { useT } from '../lib/i18n'
import Wizard, { type WizardStep } from '../components/Wizard'

export default function JobOrder() {
  const { t } = useT()
  const { broker } = useBroker()
  const navigate = useNavigate()
  // Mobile renders this form as a paginated wizard (one step on screen). Lift
  // the step so the demo tour can WALK it — each tour step reveals its fields —
  // and so it resets to the first step when the demo finishes.
  const [wizStep, setWizStep] = useState(0)
  const tourSteps = useMemo(
    () => jobOrderSteps.map((s, idx) => ({ ...s, onEnter: () => setWizStep(idx) })),
    [],
  )
  usePageTour('job-order', tourSteps, () => setWizStep(0))

  // Consignee picker — searchable typeahead over the full master list.
  // (No per-broker accreditation gate: any registered broker can pick any consignee.)
  const [consignee, setConsignee] = useState<PickerItem | null>(null)
  // True when the chosen consignee is one the customer just requested (pending
  // KTC approval) — drives the "needs approval" tag. Reset when they pick another.
  const [consigneePending, setConsigneePending] = useState(false)
  function pickConsignee(item: PickerItem | null) { setConsignee(item); setConsigneePending(false) }
  const [entryNumber, setEntryNumber] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Ref guard: state updates are async, so a rapid double-click can pass a
  // `busy` check twice and file the order twice.
  const submittingRef = useRef(false)
  const [reviewing, setReviewing] = useState(false)

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

  const approved = broker?.status === 'approved'
  const hasId = !!broker?.valid_id_path

  // Per-step validation (used to gate Next on mobile; the full re-check still
  // runs in submit()). Step 1 needs a consignee AND the entry (C-) number.
  function step1Error() {
    if (!consignee) return t('Select a consignee from the list.')
    if (!entryNumber.trim()) return t('Enter the Entry Number (C-…).')
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
    const ev = vesselError(); if (ev) { setError(ev); setWizStep(1); return }
    if (lines.filter((l) => l.container_number.trim()).length === 0) { setError(t('Add at least one container.')); setWizStep(2); return }
    setReviewing(true)
  }
  const reviewVessel = (() => { const s = vessels.find((v) => v.vessel_visit === vesselVisit); return s ? `${s.vessel_name.toUpperCase()} — ${s.voyage_number.toUpperCase()}` : '' })()

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
    if (!entryNumber.trim()) {
      setError(t('Enter the Entry Number (C-…).'))
      return
    }
    // Resolve vessel + voyage (required). Entry, vessel, voyage and container
    // numbers are all stored UPPERCASE — shipping identifiers are canonically caps.
    const sel = vessels.find((v) => v.vessel_visit === vesselVisit)
    if (!sel) { setError(t('Select the vessel & voyage from the list.')); return }
    const vVisit: string = sel.vessel_visit
    const vName = sel.vessel_name.toUpperCase()
    const vVoyage = sel.voyage_number.toUpperCase()
    const filled = lines.filter((l) => l.container_number.trim())
    if (filled.length === 0) {
      setError(t('Add at least one container.'))
      return
    }
    submittingRef.current = true
    setBusy(true)
    // Atomic: the order + its lines are inserted in one transaction server-side
    // (0098), so a failure can't leave an orphan line-less order. Pending vs
    // approved (held/submitted) is decided in the RPC.
    const { error: fileErr } = await supabase.rpc('file_job_order', {
      p_consignee: consignee.id,
      p_entry_number: entryNumber.trim().toUpperCase(),
      p_vessel_visit: vVisit,
      p_vessel_name: vName,
      p_voyage_number: vVoyage,
      p_lines: filled.map((l) => ({ container_number: l.container_number.trim().toUpperCase(), service_request: l.service_request })),
    })
    setBusy(false)
    if (fileErr) {
      submittingRef.current = false
      setError(fileErr.message)
      return
    }
    // Redirect to the orders list (no auto-open — the new order shows at the top).
    navigate('/job-orders')
  }

  const pendingNotice = !approved ? (
    <div style={{ fontSize: 13, lineHeight: 1.6, padding: '10px 12px', borderRadius: 10, marginTop: 14, background: 'var(--c-h40-90-97)', border: '1px solid var(--c-h35-85-82)', color: 'var(--c-h30-60-32)' }}>
      {t('You can file job orders now, but they')}{' '}<b>{t('can’t be processed until you pass final verification')}</b>.{' '}
      {hasId
        ? t('Your valid ID is on file — a KTC admin is verifying your account. Once approved, your held orders are sent to KTC automatically.')
        : t('Upload your valid ID for final verification (banner above); once a KTC admin approves you, your held orders are sent automatically.')}
    </div>
  ) : null

  const wizardSteps: WizardStep[] = [
    {
      title: 'Consignee & entry',
      validate: step1Error,
      content: (
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
            <ConsigneeRequestForm onCreated={(item) => { setConsignee(item); setConsigneePending(true) }} />
            {consigneePending && (
              <div style={{ fontSize: 12.5, lineHeight: 1.5, padding: '9px 11px', borderRadius: 10, background: 'var(--c-h40-90-94)', border: '1px solid var(--c-h35-85-82)', color: 'var(--c-h30-60-32)' }}>
                {t('New consignee — pending KTC approval. You can still file; KTC will verify it.')}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
            <label className="ktc-label" htmlFor="entry">{t('Entry Number')} *</label>
            <input
              id="entry"
              className="ktc-input"
              required
              placeholder={t('e.g. C-0000012345')}
              value={entryNumber}
              onChange={(e) => setEntryNumber(e.target.value.toUpperCase())}
              style={{ textTransform: 'uppercase' }}
            />
          </div>
        </div>
      ),
    },
    {
      title: 'Vessel & voyage',
      validate: vesselError,
      content: (
        <div data-tour="jo-vessel" style={{ display: 'grid', gap: 6 }}>
          <label className="ktc-label" htmlFor="vessel">{t('Vessel & Voyage')} *</label>
          <select id="vessel" className="ktc-input" value={vesselVisit} onChange={(e) => setVesselVisit(e.target.value)}>
            <option value="">{t('Select a vessel…')}</option>
            {vessels.map((v) => (
              <option key={v.vessel_visit} value={v.vessel_visit}>{v.vessel_name.toUpperCase()} — {v.voyage_number.toUpperCase()}</option>
            ))}
          </select>
          <span className="ktc-label" style={{ fontSize: 11.5 }}>
            {t('Can’t find your vessel? Contact KTC customer service to have it added to the schedule.')}
          </span>
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

        <Wizard
          steps={wizardSteps}
          step={wizStep}
          onStepChange={setWizStep}
          onSubmit={openReview}
          busy={busy}
          error={error}
          footer={pendingNotice}
          submitLabel={busy ? (approved ? t('Submitting…') : t('Filing…')) : approved ? t('Submit Job Order') : t('File Job Order')}
        />
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
              <div><span className="ktc-label" style={{ fontSize: 12 }}>{t('Entry Number')}</span><div style={{ fontWeight: 600 }}>{entryNumber.trim().toUpperCase()}</div></div>
              <div><span className="ktc-label" style={{ fontSize: 12 }}>{t('Vessel & Voyage')}</span><div style={{ fontWeight: 600 }}>{reviewVessel}</div></div>
              <div>
                <span className="ktc-label" style={{ fontSize: 12 }}>{t('Containers')}</span>
                <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
                  {lines.filter((l) => l.container_number.trim()).map((l, i) => (
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
                {approved ? t('Confirm & submit') : t('Confirm & file')}
              </button>
              <button type="button" className="ktc-link" disabled={busy} onClick={() => setReviewing(false)}>{t('← Go back & edit')}</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}
