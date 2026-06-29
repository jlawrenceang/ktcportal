import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { usePermissions } from '../lib/usePermissions'
import { peso } from '../lib/pricing'
import Notice, { type NoticeTone } from '../components/Notice'
import SearchPicker, { type PickerItem } from '../components/SearchPicker'

// Admin editor for per-consignee special rates (0204/0208) over the single
// service_rates/move_rates spine. Confidential (staff-read only); the authoritative
// price is applied server-side at charge time — this screen only writes via
// set_consignee_rate_override. Module-level so SearchPicker's effect stays stable.
async function searchConsigneesPii(q: string): Promise<PickerItem[]> {
  const { data, error } = await supabase.rpc('search_consignees', { p_q: q })
  if (error) return []
  return ((data ?? []) as { id: string; code: string; name: string }[])
    .map((c) => ({ id: c.id, title: c.code, sub: c.name }))
}

type Override = {
  id: string
  consignee_id: string
  service: string
  rate: number
  active: boolean
  note: string | null
  consignee: { code: string; name: string } | null
}
type OverrideRow = {
  id: string; consignee_id: string; service: string; rate: number | string; active: boolean; note: string | null
  consignee: { code: string; name: string } | { code: string; name: string }[] | null
}
function mapOverrides(rows: OverrideRow[]): Override[] {
  return rows.map((r) => ({
    id: r.id, consignee_id: r.consignee_id, service: r.service, rate: Number(r.rate), active: r.active, note: r.note ?? null,
    consignee: Array.isArray(r.consignee) ? (r.consignee[0] ?? null) : (r.consignee ?? null),
  }))
}

export default function SettingsRateOverrides() {
  const { t } = useT()
  const { broker } = usePermissions()
  const isAdmin = !!(broker?.is_admin || broker?.is_owner)

  const [services, setServices] = useState<string[]>([])
  const [moves, setMoves] = useState<string[]>([])
  const [overrides, setOverrides] = useState<Override[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Editor form (set / replace an override; upsert is keyed on consignee + service).
  const [consignee, setConsignee] = useState<PickerItem | null>(null)
  const [service, setService] = useState('')
  const [rate, setRate] = useState('')
  const [active, setActive] = useState(true)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: NoticeTone; text: string } | null>(null)

  async function load() {
    setLoadError(null)
    const [{ data: sr, error: e1 }, { data: mr, error: e2 }, { data: ov, error: e3 }] = await Promise.all([
      supabase.from('service_rates').select('service').eq('active', true).order('sort_order').order('service'),
      supabase.from('move_rates').select('move_type').eq('active', true).order('sort_order'),
      supabase.from('consignee_rate_overrides')
        .select('id, consignee_id, service, rate, active, note, updated_at, consignee:consignees(code, name)')
        .order('updated_at', { ascending: false }),
    ])
    if (e1 || e2 || e3) { setLoadError((e1 || e2 || e3)!.message); setLoading(false); return }
    setServices(((sr ?? []) as { service: string }[]).map((x) => x.service))
    setMoves(((mr ?? []) as { move_type: string }[]).map((x) => x.move_type))
    setOverrides(mapOverrides((ov ?? []) as OverrideRow[]))
    setLoading(false)
  }
  useEffect(() => { if (isAdmin) void load() }, [isAdmin])

  async function reloadOverrides() {
    const { data, error } = await supabase.from('consignee_rate_overrides')
      .select('id, consignee_id, service, rate, active, note, updated_at, consignee:consignees(code, name)')
      .order('updated_at', { ascending: false })
    if (error) { setMsg({ tone: 'error', text: error.message }); return }
    setOverrides(mapOverrides((data ?? []) as OverrideRow[]))
  }

  async function save() {
    setMsg(null)
    if (!consignee) { setMsg({ tone: 'error', text: t('Pick a consignee from the list.') }); return }
    if (!service) { setMsg({ tone: 'error', text: t('Pick a service.') }); return }
    const r = rate.trim() === '' ? null : Number(rate)
    if (r == null || Number.isNaN(r) || r < 0) { setMsg({ tone: 'error', text: t('Enter a valid rate.') }); return }
    setBusy(true)
    const { error } = await supabase.rpc('set_consignee_rate_override', {
      p_consignee: consignee.id, p_service: service, p_rate: r, p_active: active, p_note: note.trim() || null,
    })
    setBusy(false)
    if (error) { setMsg({ tone: 'error', text: error.message }); return }
    setConsignee(null); setService(''); setRate(''); setActive(true); setNote('')
    setMsg({ tone: 'success', text: t('✓ Special rate saved.') })
    await reloadOverrides()
  }

  // Edit = prefill the form (the upsert replaces the existing consignee+service row).
  function edit(o: Override) {
    setConsignee(o.consignee ? { id: o.consignee_id, title: o.consignee.code, sub: o.consignee.name } : { id: o.consignee_id, title: o.consignee_id })
    setService(o.service); setRate(String(o.rate)); setActive(o.active); setNote(o.note ?? '')
    setMsg(null)
  }
  async function toggleActive(o: Override) {
    setMsg(null)
    const { error } = await supabase.rpc('set_consignee_rate_override', {
      p_consignee: o.consignee_id, p_service: o.service, p_rate: o.rate, p_active: !o.active, p_note: o.note,
    })
    if (error) { setMsg({ tone: 'error', text: error.message }); return }
    await reloadOverrides()
  }

  if (!isAdmin) return null

  return (
    <div className="ktc-glass" style={{ padding: 18, marginBottom: 18 }}>
      <h1 className="ktc-title">{t('Special rates')}</h1>
      <p className="ktc-sub" style={{ marginBottom: 16 }}>
        {t('Set a special per-consignee rate over the standard price list. These rates are confidential and applied automatically when billing.')}
      </p>

      {/* Editor */}
      <div style={{ display: 'grid', gap: 12, maxWidth: 480, marginBottom: 20 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="ktc-label" htmlFor="ro-consignee">{t('Consignee')}</label>
          <SearchPicker inputId="ro-consignee" placeholder={t('Search consignee by code or name…')}
            selected={consignee} onSelect={setConsignee} search={searchConsigneesPii} minChars={2} />
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="ktc-label" htmlFor="ro-service">{t('Service')}</label>
          <select id="ro-service" className="ktc-input" value={service} onChange={(e) => setService(e.target.value)}>
            <option value="">{t('Select a service…')}</option>
            {services.length > 0 && (
              <optgroup label={t('Ancillary services')}>
                {services.map((s) => <option key={`s-${s}`} value={s}>{s}</option>)}
              </optgroup>
            )}
            {moves.length > 0 && (
              <optgroup label={t('RPS moves')}>
                {moves.map((m) => <option key={`m-${m}`} value={m}>{m}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="ktc-label" htmlFor="ro-rate">{t('Special rate (₱)')}</label>
          <input id="ro-rate" className="ktc-input" type="number" min="0" step="0.01" inputMode="decimal"
            value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.00" />
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="ktc-label" htmlFor="ro-note">{t('Optional note (e.g. volume deal)')}</label>
          <input id="ro-note" className="ktc-input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t('Active')}
        </label>
        <button type="button" className="ktc-btn ktc-btn--sm" disabled={busy} onClick={() => void save()}
          style={{ width: 'auto', padding: '8px 16px', fontSize: 13, justifySelf: 'start' }}>
          {busy ? t('Saving…') : t('Save special rate')}
        </button>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </div>

      {/* Existing overrides */}
      <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>{t('Existing special rates')}</h2>
      {loading ? (
        <div style={{ display: 'grid', gap: 8 }} aria-label={t('Loading…')}>
          {[52, 52].map((h, i) => <div key={i} className="ktc-skeleton" style={{ height: h, borderRadius: 10 }} />)}
        </div>
      ) : loadError ? (
        <Notice tone="error" title={t("Couldn't load — tap Retry")}
          action={<button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => { setLoading(true); void load() }}>{t('Retry')}</button>}>
          {loadError}
        </Notice>
      ) : overrides.length === 0 ? (
        <div className="ktc-label" style={{ fontSize: 13.5 }}>{t('No special rates yet.')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {overrides.map((o) => (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.consignee ? `${o.consignee.code} – ${o.consignee.name}` : o.consignee_id}
                </div>
                <div className="ktc-label" style={{ fontSize: 12.5, marginTop: 2 }}>
                  <span className="ktc-mono">{o.service}</span> · {peso(o.rate)}
                  {o.note ? ` · ${o.note}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
                <span className={o.active ? 'ktc-chip ktc-chip--success' : 'ktc-chip ktc-chip--warning'} style={{ fontSize: 10.5 }}>
                  {o.active ? t('Active') : t('Inactive')}
                </span>
                <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => edit(o)}>{t('Edit')}</button>
                <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => void toggleActive(o)}>
                  {o.active ? t('Deactivate') : t('Reactivate')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
