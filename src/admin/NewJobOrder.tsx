import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { usePermissions } from '../lib/usePermissions'
import SearchPicker, { type PickerItem } from '../components/SearchPicker'
import ContainerLinesEditor, { emptyLine, type LineDraft } from '../components/ContainerLinesEditor'
import { searchConsignees, searchCustomers } from '../lib/pickerSearches'
import { useT } from '../lib/i18n'
import { PrinterIcon } from '../components/icons'

// Admin "file on behalf of" (gap G3) — walk-ins at the window and in-house
// ops. Files straight to 'submitted' via the admin_file_job_order RPC
// (permission-gated server-side; JO number + serving numbers + audit actor
// all come from the same triggers as a customer filing).

interface Filed {
  id: string
  jo_number: string | null
  customer_name: string | null
}

export default function NewJobOrder() {
  const { can, loading } = usePermissions()
  const { t } = useT()
  const [customer, setCustomer] = useState<PickerItem | null>(null)
  const [consignee, setConsignee] = useState<PickerItem | null>(null)
  const [entryNumber, setEntryNumber] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filed, setFiled] = useState<Filed | null>(null)
  const submittingRef = useRef(false)

  // Vessel + voyage from the current schedule (escape hatch for not-listed).
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

  function reset() {
    setCustomer(null)
    setConsignee(null)
    setEntryNumber('')
    setLines([emptyLine()])
    setVesselVisit(''); setNotListed(false); setMVessel(''); setMVoyage('')
    setFiled(null)
    setError(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return
    setError(null)
    if (!customer) { setError(t('Pick the customer this order is for.')); return }
    if (!consignee) { setError(t('Select a consignee from the list.')); return }
    let vVisit: string | null = null, vName = '', vVoyage = ''
    if (notListed) {
      vName = mVessel.trim(); vVoyage = mVoyage.trim()
      if (!vName || !vVoyage) { setError(t('Enter the vessel name and voyage number.')); return }
    } else {
      const sel = vessels.find((v) => v.vessel_visit === vesselVisit)
      if (!sel) { setError(t('Select the vessel & voyage (or tick “not listed”).')); return }
      vVisit = sel.vessel_visit; vName = sel.vessel_name; vVoyage = sel.voyage_number
    }
    const filled = lines.filter((l) => l.container_number.trim())
    if (filled.length === 0) { setError(t('Add at least one container.')); return }

    submittingRef.current = true
    setBusy(true)
    const { data, error: rpcErr } = await supabase.rpc('admin_file_job_order', {
      p_customer_id: customer.id,
      p_consignee_id: consignee.id,
      p_entry_number: entryNumber.trim() || null,
      p_lines: filled.map((l) => ({
        container_number: l.container_number.trim(),
        service_request: l.service_request,
        size: l.size,
        fill: l.fill,
        kind: l.kind,
      })),
      p_vessel_visit: vVisit,
      p_vessel_name: vName,
      p_voyage_number: vVoyage,
    })
    submittingRef.current = false
    setBusy(false)
    if (rpcErr) { setError(rpcErr.message); return }
    setFiled(data as unknown as Filed)
  }

  if (!loading && !can('file_job_orders')) {
    return (
      <AdminShell>
        <div className="ktc-glass" style={{ padding: 18 }}>
          <p className="ktc-label">{t("Your role doesn't have permission to file job orders on behalf of customers.")}</p>
        </div>
      </AdminShell>
    )
  }

  return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 18, maxWidth: 720 }}>
        <h1 className="ktc-title">{t('File for a Customer')}</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 22 }}>
          {t("Walk-ins and in-house ops — the order is filed under the customer's account and enters the line as")}{' '}<b>{t('submitted')}</b>{' '}{t('(serving number assigned now).')}
        </p>

        {filed ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ fontSize: 15, lineHeight: 1.7, padding: '16px 18px', borderRadius: 12, background: 'var(--c-h145-60-96)', border: '1px solid var(--c-h145-50-80)' }}>
              ✓ {t('Filed')} <b className="ktc-mono">{filed.jo_number ?? '—'}</b>
              {filed.customer_name ? <> {t('for')} <b>{filed.customer_name}</b></> : null}.
              {' '}{t('Serving numbers are assigned — the slip can be printed now.')}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link to={`/job-order/${filed.id}/print`} className="ktc-btn" style={{ width: 'auto', padding: '11px 22px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <PrinterIcon size={16} /> {t('Print slip')}
              </Link>
              <button type="button" className="ktc-btn-secondary" onClick={reset} style={{ width: 'auto', padding: '11px 22px' }}>
                + {t('File another')}
              </button>
              <Link to="/admin/job-orders" className="ktc-link" style={{ alignSelf: 'center' }}>
                {t('View queue →')}
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="customer">{t('Customer')}</label>
              <SearchPicker
                inputId="customer"
                placeholder={t('Search by name, customer code, or email…')}
                selected={customer}
                onSelect={setCustomer}
                search={searchCustomers}
              />
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="consignee">{t('Consignee')}</label>
              <SearchPicker
                inputId="consignee"
                placeholder={t('Search consignee by code or name…')}
                selected={consignee}
                onSelect={setConsignee}
                search={searchConsignees}
                minChars={1}
              />
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="entry">{t('Entry Number')}</label>
              <input
                id="entry"
                className="ktc-input"
                placeholder={t('e.g. C-0000012345')}
                value={entryNumber}
                onChange={(e) => setEntryNumber(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <label className="ktc-label" htmlFor="vessel">{t('Vessel & Voyage')}</label>
              {!notListed ? (
                <select id="vessel" className="ktc-input" value={vesselVisit} onChange={(e) => setVesselVisit(e.target.value)}>
                  <option value="">{t('Select a vessel…')}</option>
                  {vessels.map((v) => (
                    <option key={v.vessel_visit} value={v.vessel_visit}>{v.vessel_name} — {v.voyage_number}</option>
                  ))}
                </select>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input className="ktc-input" placeholder={t('Vessel name')} value={mVessel} onChange={(e) => setMVessel(e.target.value)} />
                  <input className="ktc-input" placeholder={t('Voyage number')} value={mVoyage} onChange={(e) => setMVoyage(e.target.value)} />
                </div>
              )}
              <label className="ktc-label" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={notListed} onChange={(e) => setNotListed(e.target.checked)} /> {t('Vessel not listed — enter manually')}
              </label>
            </div>

            <ContainerLinesEditor lines={lines} onChange={setLines} />

            {error && <div style={{ color: 'var(--acc-2)', fontSize: 13 }}>{error}</div>}

            <button className="ktc-btn" type="submit" disabled={busy} style={{ marginTop: 4 }}>
              {busy ? t('Filing…') : t('File Job Order')}
            </button>
          </form>
        )}
      </div>
    </AdminShell>
  )
}
