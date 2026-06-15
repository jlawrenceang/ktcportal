import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Shell from '../components/Shell'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import SearchPicker, { type PickerItem } from '../components/SearchPicker'
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
  const [entryNumber, setEntryNumber] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Ref guard: state updates are async, so a rapid double-click can pass a
  // `busy` check twice and file the order twice.
  const submittingRef = useRef(false)

  // Vessel + voyage (required) — picked from the current vessel schedule, with
  // an escape hatch for a call not yet listed (operations reconciles it later).
  type VesselOpt = { vessel_visit: string; vessel_name: string; voyage_number: string }
  const [vessels, setVessels] = useState<VesselOpt[]>([])
  const [vesselVisit, setVesselVisit] = useState('')
  const [notListed, setNotListed] = useState(false)
  const [mVessel, setMVessel] = useState('')
  const [mVoyage, setMVoyage] = useState('')
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
    if (notListed) return (!mVessel.trim() || !mVoyage.trim()) ? t('Enter the vessel name and voyage number.') : null
    return !vessels.find((v) => v.vessel_visit === vesselVisit) ? t('Select the vessel & voyage (or tick “not listed”).') : null
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
    if (!entryNumber.trim()) {
      setError(t('Enter the Entry Number (C-…).'))
      return
    }
    // Resolve vessel + voyage (required). Entry, vessel, voyage and container
    // numbers are all stored UPPERCASE — shipping identifiers are canonically caps.
    let vVisit: string | null = null, vName = '', vVoyage = ''
    if (notListed) {
      vName = mVessel.trim().toUpperCase(); vVoyage = mVoyage.trim().toUpperCase()
      if (!vName || !vVoyage) { setError(t('Enter the vessel name and voyage number.')); return }
    } else {
      const sel = vessels.find((v) => v.vessel_visit === vesselVisit)
      if (!sel) { setError(t('Select the vessel & voyage (or tick “not listed”).')); return }
      vVisit = sel.vessel_visit; vName = sel.vessel_name.toUpperCase(); vVoyage = sel.voyage_number.toUpperCase()
    }
    const filled = lines.filter((l) => l.container_number.trim())
    if (filled.length === 0) {
      setError(t('Add at least one container.'))
      return
    }
    submittingRef.current = true
    setBusy(true)
    const { data: jo, error: joErr } = await supabase
      .from('job_orders')
      .insert({
        customer_id: broker.id,
        consignee_id: consignee.id,
        entry_number: entryNumber.trim().toUpperCase(),
        vessel_visit: vVisit,
        vessel_name: vName,
        voyage_number: vVoyage,
        // Pending brokers file as 'held' (released to the admin queue on approval);
        // approved brokers go straight to 'submitted'. Enforced by RLS either way.
        status: approved ? 'submitted' : 'held',
      })
      .select('id, jo_number')
      .single()

    if (joErr || !jo) {
      submittingRef.current = false
      setBusy(false)
      setError(joErr?.message ?? t('Could not create job order.'))
      return
    }
    const { error: lineErr } = await supabase.from('job_order_lines').insert(
      filled.map((l) => ({
        job_order_id: (jo as { id: string }).id,
        container_number: l.container_number.trim().toUpperCase(),
        service_request: l.service_request,
      })),
    )
    setBusy(false)
    if (lineErr) {
      submittingRef.current = false
      setError(lineErr.message)
      return
    }
    // Redirect to the list and auto-expand the order we just filed.
    sessionStorage.setItem('ktc_jo_filed_id', (jo as { id: string }).id)
    navigate('/job-orders')
  }

  const pendingNotice = !approved ? (
    <div style={{ fontSize: 13, lineHeight: 1.6, padding: '10px 12px', borderRadius: 10, marginTop: 14, background: 'hsl(40 90% 97%)', border: '1px solid hsl(35 85% 82%)', color: 'hsl(30 60% 32%)' }}>
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
              onSelect={setConsignee}
              search={searchConsignees}
            />
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
          <label className="ktc-label" htmlFor="vessel">{t('Vessel & Voyage')}</label>
          {!notListed ? (
            <select id="vessel" className="ktc-input" value={vesselVisit} onChange={(e) => setVesselVisit(e.target.value)}>
              <option value="">{t('Select a vessel…')}</option>
              {vessels.map((v) => (
                <option key={v.vessel_visit} value={v.vessel_visit}>{v.vessel_name.toUpperCase()} — {v.voyage_number.toUpperCase()}</option>
              ))}
            </select>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input className="ktc-input" style={{ textTransform: 'uppercase' }} placeholder={t('Vessel name')} value={mVessel} onChange={(e) => setMVessel(e.target.value.toUpperCase())} />
              <input className="ktc-input" style={{ textTransform: 'uppercase' }} placeholder={t('Voyage number')} value={mVoyage} onChange={(e) => setMVoyage(e.target.value.toUpperCase())} />
            </div>
          )}
          <label className="ktc-label" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={notListed} onChange={(e) => setNotListed(e.target.checked)} />
            {t('My vessel isn’t listed — enter it manually (operations will match it)')}
          </label>
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
          onSubmit={submit}
          busy={busy}
          error={error}
          footer={pendingNotice}
          submitLabel={busy ? (approved ? t('Submitting…') : t('Filing…')) : approved ? t('Submit Job Order') : t('File Job Order')}
        />
      </div>
    </Shell>
  )
}
