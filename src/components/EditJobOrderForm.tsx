import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import SearchPicker, { type PickerItem } from './SearchPicker'
import ContainerLinesEditor, { emptyLine, type LineDraft } from './ContainerLinesEditor'
import { searchConsignees } from '../lib/pickerSearches'
import { useT } from '../lib/i18n'
import type { JobOrder } from '../lib/types'

// Edit an order's details BEFORE KTC accepts it (held / submitted only). Mirrors
// the New Job Order form, pre-filled, and saves via the update_job_order RPC
// (0075) — customers have no UPDATE policy; the RPC re-checks ownership + the
// editable window server-side. Status is unchanged, so a submitted order keeps
// its queue position and serving number.
type VesselOpt = { vessel_visit: string; vessel_name: string; voyage_number: string }

export default function EditJobOrderForm({ order, onDone, onError, onCancel }: {
  order: JobOrder
  onDone: () => void
  onError: (msg: string) => void
  onCancel: () => void
}) {
  const { t } = useT()
  const [consignee, setConsignee] = useState<PickerItem | null>(
    order.consignee_id && order.consignee
      ? { id: order.consignee_id, title: order.consignee.code, sub: order.consignee.name }
      : null,
  )
  const [entryNumber, setEntryNumber] = useState(order.entry_number ?? '')
  const [lines, setLines] = useState<LineDraft[]>(
    order.lines && order.lines.length
      ? order.lines.map((l) => ({ container_number: l.container_number, service_request: l.service_request }))
      : [emptyLine()],
  )
  const [vessels, setVessels] = useState<VesselOpt[]>([])
  const [notListed, setNotListed] = useState(!order.vessel_visit)
  const [vesselVisit, setVesselVisit] = useState(order.vessel_visit ?? '')
  const [mVessel, setMVessel] = useState(order.vessel_visit ? '' : (order.vessel_name ?? ''))
  const [mVoyage, setMVoyage] = useState(order.vessel_visit ? '' : (order.voyage_number ?? ''))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void supabase.from('vessel_schedule_v').select('vessel_visit, vessel_name, voyage_number').eq('is_current', true).order('vessel_name')
      .then(({ data }) => {
        const list = (data ?? []) as VesselOpt[]
        setVessels(list)
        // If the saved vessel has since dropped off the current schedule, fall
        // back to manual entry pre-filled with the stored name/voyage (no data loss).
        if (order.vessel_visit && !list.some((v) => v.vessel_visit === order.vessel_visit)) {
          setNotListed(true)
          setMVessel(order.vessel_name ?? '')
          setMVoyage(order.voyage_number ?? '')
        }
      })
  }, [order.vessel_visit, order.vessel_name, order.voyage_number])

  async function save() {
    onError('')
    if (!consignee) { onError(t('Select a consignee from the list.')); return }
    if (!entryNumber.trim()) { onError(t('Enter the Entry Number (C-…).')); return }
    let vVisit: string | null = null, vName = '', vVoyage = ''
    if (notListed) {
      vName = mVessel.trim().toUpperCase(); vVoyage = mVoyage.trim().toUpperCase()
      if (!vName || !vVoyage) { onError(t('Enter the vessel name and voyage number.')); return }
    } else {
      const sel = vessels.find((v) => v.vessel_visit === vesselVisit)
      if (!sel) { onError(t('Select the vessel & voyage (or tick “not listed”).')); return }
      vVisit = sel.vessel_visit; vName = sel.vessel_name.toUpperCase(); vVoyage = sel.voyage_number.toUpperCase()
    }
    const filled = lines.filter((l) => l.container_number.trim())
    if (filled.length === 0) { onError(t('Add at least one container.')); return }
    setBusy(true)
    const { error } = await supabase.rpc('update_job_order', {
      p_id: order.id,
      p_consignee_id: consignee.id,
      p_entry_number: entryNumber.trim().toUpperCase(),
      p_vessel_visit: vVisit,
      p_vessel_name: vName,
      p_voyage_number: vVoyage,
      p_lines: filled.map((l) => ({ container_number: l.container_number.trim().toUpperCase(), service_request: l.service_request })),
    })
    setBusy(false)
    if (error) { onError(error.message); return }
    onDone()
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, padding: '9px 12px', borderRadius: 9, background: 'var(--c-w60)', border: '1px solid var(--glass-brd)' }}>
        {t('Editing this order. You can change it while it’s still waiting — once KTC accepts it, it locks.')}
      </div>
      {order.status === 'submitted' && (
        <div style={{ fontSize: 12.5, lineHeight: 1.5, padding: '9px 12px', borderRadius: 9, background: 'var(--tone-warning-bg)', color: 'var(--tone-warning-ink)', border: '1px solid var(--glass-brd)' }}>
          {t('Heads up: saving changes sends this filed order to the back of the queue so KTC can re-review it — your serving number will be reissued.')}
        </div>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        <label className="ktc-label" htmlFor="edit-consignee">{t('Consignee')} *</label>
        <SearchPicker inputId="edit-consignee" placeholder={t('Search consignee by code or name…')}
          selected={consignee} onSelect={setConsignee} search={searchConsignees} />
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <label className="ktc-label" htmlFor="edit-entry">{t('Entry Number')} *</label>
        <input id="edit-entry" className="ktc-input" required placeholder={t('e.g. C-0000012345')}
          value={entryNumber} onChange={(e) => setEntryNumber(e.target.value.toUpperCase())} style={{ textTransform: 'uppercase' }} />
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <label className="ktc-label" htmlFor="edit-vessel">{t('Vessel & Voyage')}</label>
        {!notListed ? (
          <select id="edit-vessel" className="ktc-input" value={vesselVisit} onChange={(e) => setVesselVisit(e.target.value)}>
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

      <ContainerLinesEditor lines={lines} onChange={setLines} />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="ktc-btn ktc-btn--sm" disabled={busy} onClick={() => void save()} style={{ display: 'inline-flex' }}>
          {busy ? t('Saving…') : t('Save changes')}
        </button>
        <button type="button" className="ktc-link" disabled={busy} onClick={onCancel}>{t('Cancel')}</button>
      </div>
    </div>
  )
}
