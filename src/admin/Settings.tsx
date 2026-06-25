import { useEffect, useState, type FormEvent } from 'react'
import AdminShell from './AdminShell'
import SystemHealth from './SystemHealth'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import type { Broker } from '../lib/types'
import { passwordIssue, PASSWORD_HINT } from '../lib/validation'
import { useT } from '../lib/i18n'
import LangToggle from '../components/LangToggle'
import TestPushCard from './TestPushCard'
import TestEmailCard from './TestEmailCard'
import { peso } from '../lib/pricing'
import { SHIPPING_LINES, TERMINAL_CHARGE_SERVICES, CHARGE_RULE_ACTIONS, tradeLabel, type Origin } from '../lib/shippingLines'
import OriginPill from '../components/OriginPill'
import { LockIcon, PencilIcon } from '../components/icons'

// Per-service rate granularity (0157): each service's rate can vary by any subset
// of these dimensions (or none = uniform). Storage is handled separately (tiered).
const TERM_DIMS: { key: string; label: string; values: readonly [string, string] }[] = [
  { key: 'origin', label: 'Origin (foreign / domestic)', values: ['foreign', 'domestic'] },
  { key: 'size', label: 'Size (20 / 40)', values: ['20', '40'] },
  { key: 'fill', label: 'Fill (empty / full)', values: ['empty', 'full'] },
  { key: 'kind', label: 'Kind (dry / reefer)', values: ['dry', 'reefer'] },
]
const DIM_VAL_LABEL: Record<string, string> = {
  foreign: 'Foreign', domestic: 'Domestic', '20': '20ft', '40': '40ft',
  empty: 'Empty', full: 'Full', dry: 'Dry', reefer: 'Reefer',
}
// Services edited via the per-dimension editor (storage has its own tiered editor).
const GRANULAR_SERVICES: [string, string][] = [['arrastre', 'Arrastre'], ['wharfage', 'Wharfage'], ['lolo', 'LoLo'], ['weighing', 'Weighing scale (export)']]
// Cartesian product of the values of the checked dimensions ([] -> one uniform combo).
function dimCombos(dims: string[]): Record<string, string>[] {
  let out: Record<string, string>[] = [{}]
  for (const d of TERM_DIMS) {
    if (!dims.includes(d.key)) continue
    const next: Record<string, string>[] = []
    for (const c of out) for (const v of d.values) next.push({ ...c, [d.key]: v })
    out = next
  }
  return out
}

export default function Settings() {
  const { t } = useT()
  const { broker: me } = useBroker()
  const isOwner = !!me?.is_owner
  const isRootOwner = !!me?.is_root_owner
  const [tab, setTab] = useState<'pricing' | 'ops' | 'access' | 'system'>('pricing')
  const [staff, setStaff] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)
  const [suEmail, setSuEmail] = useState('')
  const [suName, setSuName] = useState('')
  const [suRole, setSuRole] = useState<'admin' | 'cashier' | 'checker' | 'operations' | 'csr'>('admin')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Pricing (service rates + flat fees + VAT) — admin-editable, read-only to others.
  // rate/value of null = "not set" (a placeholder), distinct from a real ₱0 —
  // an empty input saves null straight through to the now-nullable column.
  type Rate = { service: string; rate: number | null; unit: string; vatable: boolean; active: boolean; sort_order: number }
  type Setting = { key: string; value: number | null; label: string | null }
  const [rates, setRates] = useState<Rate[]>([])
  const [settings, setSettings] = useState<Setting[]>([])
  const [pricingBusy, setPricingBusy] = useState(false)
  const [pricingMsg, setPricingMsg] = useState<string | null>(null)
  // Locked by default; saving re-locks — prices can't be nudged accidentally.
  const [pricingLocked, setPricingLocked] = useState(true)

  async function load() {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .or('is_admin.eq.true,is_owner.eq.true,staff_role.not.is.null')
      .order('is_owner', { ascending: false })
      .order('email', { ascending: true })
    if (error) { setError(error.message); setLoading(false); return }
    setStaff((data ?? []) as Broker[])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  // Payment details (bank/GCash + QR) shown on the customer payment page.
  type PayInfo = { key: string; value: string; label: string | null }
  const [payInfo, setPayInfo] = useState<PayInfo[]>([])
  const [payBusy, setPayBusy] = useState(false)
  const [payMsg, setPayMsg] = useState<string | null>(null)
  const [qrFile, setQrFile] = useState<File | null>(null)

  // Free storage days per shipping line — drives the vessel schedule's computed
  // Last Free Day (admin-only, migration 0058).
  type ShipLine = { name: string; free_days_import: number; free_days_export: number; internal: boolean }
  const [shipLines, setShipLines] = useState<ShipLine[]>([])
  const [slBusy, setSlBusy] = useState(false)
  const [slMsg, setSlMsg] = useState<string | null>(null)
  const [newLine, setNewLine] = useState('')
  useEffect(() => {
    void supabase.from('shipping_lines').select('name, free_days_import, free_days_export, internal').order('name')
      .then(({ data }) => setShipLines((data ?? []) as ShipLine[]))
  }, [])
  function setSl(name: string, field: 'free_days_import' | 'free_days_export', v: number) {
    setShipLines((xs) => xs.map((x) => (x.name === name ? { ...x, [field]: v } : x)))
  }
  // In-house lines: their vessels are hidden from customers (enforced server-side).
  function toggleInternal(name: string) {
    setShipLines((xs) => xs.map((x) => (x.name === name ? { ...x, internal: !x.internal } : x)))
  }
  function addLine() {
    const n = newLine.trim()
    if (!n) { setSlMsg(t('Enter the shipping line name first.')); return }
    if (shipLines.some((x) => x.name.toLowerCase() === n.toLowerCase())) { setSlMsg(t('That line already exists.')); return }
    setShipLines((xs) => [...xs, { name: n, free_days_import: 5, free_days_export: 7, internal: false }].sort((a, b) => a.name.localeCompare(b.name)))
    setNewLine(''); setSlMsg(t('"{n}" added — set its free-days and Save.', { n }))
  }
  async function saveLines() {
    setSlBusy(true); setSlMsg(null)
    const { error } = await supabase.from('shipping_lines').upsert(
      shipLines.map((x) => ({ ...x, updated_at: new Date().toISOString() })), { onConflict: 'name' })
    setSlBusy(false)
    setSlMsg(error ? error.message : t('✓ Free-days saved.'))
  }
  async function deleteLine(name: string) {
    const { error } = await supabase.from('shipping_lines').delete().eq('name', name)
    if (error) { setSlMsg(error.message); return }
    setShipLines((xs) => xs.filter((x) => x.name !== name))
    setSlMsg(t('"{name}" removed.', { name }))
  }

  // RPS per-move rates — admin-configured (manage_pricing). Charged when a JO
  // is assessed as needing RPS.
  type MoveRateRow = { move_type: string; rate: number | null; active: boolean; sort_order: number | null }
  const [moveRates, setMoveRates] = useState<MoveRateRow[]>([])
  const [mrBusy, setMrBusy] = useState(false)
  const [mrMsg, setMrMsg] = useState<string | null>(null)
  useEffect(() => {
    void supabase.from('move_rates').select('move_type, rate, active, sort_order').order('sort_order')
      .then(({ data }) => setMoveRates(((data ?? []) as MoveRateRow[]).map((x) => ({ ...x, rate: x.rate == null ? null : Number(x.rate) }))))
  }, [])
  function setMr(mt: string, rate: number | null) { setMoveRates((xs) => xs.map((x) => (x.move_type === mt ? { ...x, rate } : x))) }
  async function saveMoveRates() {
    setMrBusy(true); setMrMsg(null)
    const { error } = await supabase.from('move_rates').upsert(moveRates.map((x) => ({ ...x, updated_at: new Date().toISOString() })), { onConflict: 'move_type' })
    setMrBusy(false)
    setMrMsg(error ? error.message : t('✓ Move rates saved.'))
  }

  // Additional charge types (0155) — feed the "Add charge" dropdown on a job
  // order supplement. default_amount of null = "not set" (a placeholder),
  // distinct from a real ₱0 — an empty input saves null through. Rows have a
  // uuid PK, so a new type is inserted live (to mint its id); existing rows are
  // upserted by id on Save. Deactivate is the safe retire path; hard delete is
  // offered only once a row is already inactive (its label may be in use).
  type ChargeType = { id: string; label: string; default_amount: number | null; active: boolean; sort: number }
  const [chargeTypes, setChargeTypes] = useState<ChargeType[]>([])
  const [ctBusy, setCtBusy] = useState(false)
  const [ctMsg, setCtMsg] = useState<string | null>(null)
  const [newCharge, setNewCharge] = useState('')
  const [newChargeAmt, setNewChargeAmt] = useState('')
  const [delCharge, setDelCharge] = useState<string | null>(null)
  useEffect(() => {
    void supabase.from('additional_charge_types').select('id, label, default_amount, active, sort').order('sort').order('label')
      .then(({ data }) => setChargeTypes(((data ?? []) as ChargeType[]).map((x) => ({ ...x, default_amount: x.default_amount == null ? null : Number(x.default_amount) }))))
  }, [])
  function setCt(id: string, field: 'label' | 'default_amount' | 'active' | 'sort', v: string | number | boolean | null) {
    setChargeTypes((xs) => xs.map((x) => (x.id === id ? { ...x, [field]: v } : x)))
  }
  async function saveChargeTypes() {
    setCtBusy(true); setCtMsg(null)
    const { error } = await supabase.from('additional_charge_types')
      .upsert(chargeTypes.map((x) => ({ id: x.id, label: x.label.trim(), default_amount: x.default_amount, active: x.active, sort: x.sort })), { onConflict: 'id' })
    setCtBusy(false)
    setCtMsg(error ? error.message : t('✓ Charge types saved.'))
  }
  async function addChargeType() {
    const label = newCharge.trim()
    if (!label) { setCtMsg(t('Enter the charge type name first.')); return }
    if (chargeTypes.some((c) => c.label.toLowerCase() === label.toLowerCase())) { setCtMsg(t('That charge type already exists.')); return }
    setCtBusy(true); setCtMsg(null)
    const amount = newChargeAmt.trim() === '' ? null : Number(newChargeAmt)
    const { data, error } = await supabase.from('additional_charge_types')
      .insert({ label, default_amount: amount, sort: chargeTypes.length + 1 })
      .select('id, label, default_amount, active, sort').single()
    setCtBusy(false)
    if (error) { setCtMsg(error.message); return }
    const row = data as ChargeType
    setChargeTypes((xs) => [...xs, { ...row, default_amount: row.default_amount == null ? null : Number(row.default_amount) }])
    setNewCharge(''); setNewChargeAmt('')
    setCtMsg(t('"{label}" added.', { label }))
  }
  async function deleteChargeType(id: string) {
    setCtBusy(true); setCtMsg(null)
    const { error } = await supabase.from('additional_charge_types').delete().eq('id', id)
    setCtBusy(false); setDelCharge(null)
    if (error) { setCtMsg(error.message); return }
    setChargeTypes((xs) => xs.filter((x) => x.id !== id))
    setCtMsg(t('Charge type deleted.'))
  }

  useEffect(() => {
    void supabase.from('payment_info').select('key, value, label').order('key')
      .then(({ data }) => setPayInfo((data ?? []) as PayInfo[]))
  }, [])
  function setPayVal(key: string, value: string) {
    setPayInfo((xs) => xs.map((x) => (x.key === key ? { ...x, value } : x)))
  }
  async function savePayInfo() {
    setPayBusy(true); setPayMsg(null)
    let qrPath: string | null = null
    if (qrFile) {
      const { error: upErr } = await supabase.storage.from('payment-qr').upload('ktc-qr.png', qrFile, { upsert: true, contentType: qrFile.type })
      if (upErr) { setPayBusy(false); setPayMsg(upErr.message); return }
      qrPath = 'ktc-qr.png'
    }
    const rows = payInfo.filter((x) => x.key !== 'qr_path').map((x) => ({ ...x, updated_at: new Date().toISOString() }))
    if (qrPath) rows.push({ key: 'qr_path', value: qrPath, label: 'QR image path', updated_at: new Date().toISOString() } as PayInfo & { updated_at: string })
    const { error } = await supabase.from('payment_info').upsert(rows, { onConflict: 'key' })
    setPayBusy(false)
    setQrFile(null)
    setPayMsg(error ? error.message : t('✓ Payment details saved.'))
  }

  // Roles & gates (owner-only editor; backend enforced via has_permission()).
  type Gate = { role: string; permission: string; allowed: boolean }
  const [gates, setGates] = useState<Gate[]>([])
  const [gatesBusy, setGatesBusy] = useState(false)
  const [gatesMsg, setGatesMsg] = useState<string | null>(null)

  async function loadGates() {
    const { data } = await supabase.from('role_permissions').select('role, permission, allowed')
    setGates((data ?? []) as Gate[])
  }
  useEffect(() => { if (isOwner) void loadGates() }, [isOwner])

  function toggleGate(role: string, permission: string) {
    setGates((gs) => gs.map((g) => (g.role === role && g.permission === permission ? { ...g, allowed: !g.allowed } : g)))
  }
  async function saveGates() {
    setGatesBusy(true); setGatesMsg(null)
    const { error } = await supabase.from('role_permissions').upsert(
      gates.map((g) => ({ ...g, updated_at: new Date().toISOString() })),
      { onConflict: 'role,permission' },
    )
    setGatesBusy(false)
    setGatesMsg(error ? error.message : t('✓ Gates saved. Staff see the change on their next page load.'))
  }

  async function loadPricing() {
    const [{ data: r }, { data: s }] = await Promise.all([
      supabase.from('service_rates').select('service, rate, unit, vatable, active, sort_order').order('sort_order').order('service'),
      supabase.from('pricing_settings').select('key, value, label').order('key'),
    ])
    setRates((r ?? []) as Rate[])
    // print_fee was merged into admin_fee ("Admin & print fee", 0156) — hide it.
    setSettings(((s ?? []) as Setting[]).filter((x) => x.key !== 'print_fee'))
  }
  useEffect(() => { void loadPricing() }, [])

  function setRateVal(service: string, rate: number | null) {
    setRates((rs) => rs.map((x) => (x.service === service ? { ...x, rate } : x)))
  }
  function setRateActive(service: string, active: boolean) {
    setRates((rs) => rs.map((x) => (x.service === service ? { ...x, active } : x)))
  }

  // Drag & drop ordering (unlocked only); position is persisted on save.
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  function moveRate(from: number, to: number) {
    setRates((rs) => {
      const next = [...rs]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  // Delete (inactive + unreferenced only — the DB trigger re-checks).
  const [delService, setDelService] = useState<string | null>(null)
  async function deleteService(name: string) {
    setPricingBusy(true); setPricingMsg(null)
    const { error } = await supabase.from('service_rates').delete().eq('service', name)
    setPricingBusy(false); setDelService(null)
    if (error) { setPricingMsg(error.message); return }
    setRates((rs) => rs.filter((r) => r.service !== name))
    setPricingMsg(t('"{name}" deleted.', { name }))
  }

  // Add a new service to the catalogue (saved with "Save pricing"). The name
  // is the primary key — it can't be renamed later, only deactivated.
  const [newService, setNewService] = useState('')
  const [newVatable, setNewVatable] = useState(true)
  function addService() {
    const name = newService.trim()
    if (!name) { setPricingMsg(t('Enter the service name first.')); return }
    if (rates.some((r) => r.service.toLowerCase() === name.toLowerCase())) {
      setPricingMsg(t('That service already exists — reactivate it instead.'))
      return
    }
    setRates((rs) => [...rs, { service: name, rate: null, unit: 'per_container', vatable: newVatable, active: true, sort_order: rs.length + 1 }])
    setNewService(''); setNewVatable(true)
    setPricingMsg(t('"{name}" added — set its rate and Save pricing.', { name }))
  }
  function setSettingVal(key: string, value: number | null) {
    setSettings((ss) => ss.map((x) => (x.key === key ? { ...x, value } : x)))
  }
  async function savePricing() {
    setPricingBusy(true); setPricingMsg(null)
    const updatedAt = new Date().toISOString()
    // sort_order = current list position (drag & drop arranges the array)
    const { error: e1 } = await supabase.from('service_rates').upsert(rates.map((r, i) => ({ ...r, sort_order: i + 1, updated_at: updatedAt })), { onConflict: 'service' })
    // vat_rate is statutory (12%) — read-only here, server-guarded (0050)
    const editable = settings.filter((s) => s.key !== 'vat_rate')
    const { error: e2 } = await supabase.from('pricing_settings').upsert(editable.map((s) => ({ ...s, updated_at: updatedAt })), { onConflict: 'key' })
    setPricingBusy(false)
    if (e1 || e2) { setPricingMsg((e1 || e2)!.message); return }
    setPricingMsg(t('✓ Pricing saved.'))
    setPricingLocked(true)
  }

  // Terminal tariff — per-service dimension granularity (terminal_rate_config) +
  // tiered foreign storage (storage_tiers), 0157. The physical terminal_rates grid
  // is kept consistent (fan-out) so the calculator's full-key lookup is unchanged.
  type TermRate = { id: string; service: string; trade: string; origin: string; size: string; fill: string; kind: string; rate: number | null }
  type StorageTier = { id: string; trade: string; size: string; day_from: number; day_to: number | null; rate: number | null }
  const [termRates, setTermRates] = useState<TermRate[]>([])
  const [termConfig, setTermConfig] = useState<Record<string, string[]>>({})
  const [storageTiers, setStorageTiers] = useState<StorageTier[]>([])
  const [termBusy, setTermBusy] = useState(false)
  const [termMsg, setTermMsg] = useState<string | null>(null)
  useEffect(() => {
    void (async () => {
      const [{ data: tr }, { data: tc }, { data: st }] = await Promise.all([
        supabase.from('terminal_rates').select('id, service, trade, origin, size, fill, kind, rate'),
        supabase.from('terminal_rate_config').select('service, dims'),
        supabase.from('storage_tiers').select('id, trade, size, day_from, day_to, rate'),
      ])
      setTermRates(((tr ?? []) as TermRate[]).map((x) => ({ ...x, rate: x.rate == null ? null : Number(x.rate) })))
      setTermConfig(Object.fromEntries(((tc ?? []) as { service: string; dims: string[] }[]).map((x) => [x.service, x.dims ?? []])))
      setStorageTiers(((st ?? []) as StorageTier[]).map((x) => ({ ...x, rate: x.rate == null ? null : Number(x.rate) })))
    })()
  }, [])
  const rowMatches = (r: TermRate, combo: Record<string, string>) =>
    Object.entries(combo).every(([k, v]) => (r as unknown as Record<string, string>)[k] === v)
  // Canonical rate for a service + partial dimension combo.
  function comboRate(svc: string, combo: Record<string, string>): number | null {
    return termRates.find((r) => r.service === svc && rowMatches(r, combo))?.rate ?? null
  }
  // Fan a rate out to EVERY physical cell matching the combo (irrelevant dims too).
  function setComboRate(svc: string, combo: Record<string, string>, rate: number | null) {
    setTermRates((rs) => rs.map((r) => (r.service === svc && rowMatches(r, combo) ? { ...r, rate } : r)))
  }
  function toggleDim(svc: string, dim: string) {
    setTermConfig((m) => {
      const cur = m[svc] ?? []
      return { ...m, [svc]: cur.includes(dim) ? cur.filter((d) => d !== dim) : [...cur, dim] }
    })
  }
  function setTierRate(id: string, rate: number | null) {
    setStorageTiers((ts) => ts.map((x) => (x.id === id ? { ...x, rate } : x)))
  }
  async function saveTerm() {
    setTermBusy(true); setTermMsg(null)
    // Normalize granular services: every physical cell takes its combo's canonical
    // rate so the calculator's full-key lookup stays consistent.
    const norm = termRates.map((r) => {
      const dims = termConfig[r.service]
      if (!dims) return r
      const canon = termRates.find((x) => x.service === r.service
        && dims.every((d) => (x as unknown as Record<string, string>)[d] === (r as unknown as Record<string, string>)[d])
        && x.rate != null)
      return { ...r, rate: canon ? canon.rate : null }
    })
    const [e1, e2, e3] = await Promise.all([
      supabase.from('terminal_rates').upsert(norm.map((x) => ({ id: x.id, service: x.service, trade: x.trade, origin: x.origin, size: x.size, fill: x.fill, kind: x.kind, rate: x.rate })), { onConflict: 'id' }),
      supabase.from('terminal_rate_config').upsert(Object.entries(termConfig).map(([service, dims]) => ({ service, dims })), { onConflict: 'service' }),
      supabase.from('storage_tiers').upsert(storageTiers.map((x) => ({ id: x.id, trade: x.trade, size: x.size, day_from: x.day_from, day_to: x.day_to, rate: x.rate })), { onConflict: 'id' }),
    ])
    setTermRates(norm)
    setTermBusy(false)
    const err = e1.error || e2.error || e3.error
    setTermMsg(err ? err.message : t('✓ Terminal rates saved.'))
  }

  // Per-shipping-line charge rules (0080): waive/discount/surcharge layered on
  // the base tariff. Inserted/deleted live (admin RLS).
  type LineRule = { id: string; shipping_line: string; service: string; trade: string | null; action: string; value: number }
  const [lineRules, setLineRules] = useState<LineRule[]>([])
  const [ruleMsg, setRuleMsg] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ line: string; service: string; trade: string; action: string; value: string } | null>(null)
  useEffect(() => {
    void supabase.from('shipping_line_charge_rules').select('id, shipping_line, service, trade, action, value').order('shipping_line')
      .then(({ data }) => setLineRules(((data ?? []) as LineRule[]).map((x) => ({ ...x, value: Number(x.value) }))))
  }, [])
  function openDraft(line: string) {
    setRuleMsg(null)
    setDraft({ line, service: 'lolo', trade: 'export', action: 'waive', value: '' })
  }
  async function addRule() {
    if (!draft) return
    const needsValue = CHARGE_RULE_ACTIONS.find((a) => a.key === draft.action)?.needsValue
    const row = {
      shipping_line: draft.line, service: draft.service,
      trade: draft.trade === 'any' ? null : draft.trade,
      action: draft.action, value: needsValue ? (Number(draft.value) || 0) : 0,
    }
    const { data, error } = await supabase.from('shipping_line_charge_rules')
      .insert(row).select('id, shipping_line, service, trade, action, value').single()
    if (error) { setRuleMsg(error.message); return }
    setLineRules((rs) => [...rs, { ...(data as LineRule), value: Number((data as LineRule).value) }])
    setDraft(null); setRuleMsg(t('✓ Rule added.'))
  }
  async function deleteRule(id: string) {
    const { error } = await supabase.from('shipping_line_charge_rules').delete().eq('id', id)
    if (error) { setRuleMsg(error.message); return }
    setLineRules((rs) => rs.filter((r) => r.id !== id))
  }
  function ruleLabel(r: LineRule): string {
    const svc = TERMINAL_CHARGE_SERVICES.find((s) => s.key === r.service)?.label ?? r.service
    const tr = r.trade ? t(r.trade) : t('all')
    let act = t('Waive')
    if (r.action === 'discount_pct') act = `−${r.value}%`
    else if (r.action === 'discount_amt') act = `−${peso(r.value)}/${t('cont')}`
    else if (r.action === 'surcharge_amt') act = `+${peso(r.value)}/${t('cont')}`
    return `${svc} · ${tr} · ${act}`
  }

  // Support contact channels (0083) — deep-link targets for the customer's
  // "talk to an agent" hand-off. Admin-editable, all-read.
  type SC = { key: string; value: string }
  const SC_FIELDS: [string, string][] = [['phone', 'Phone (call)'], ['sms', 'SMS number'], ['viber', 'Viber number'], ['email', 'Email'], ['hours', 'Support hours']]
  const [support, setSupport] = useState<SC[]>([])
  const [supportBusy, setSupportBusy] = useState(false)
  const [supportMsg, setSupportMsg] = useState<string | null>(null)
  useEffect(() => {
    void supabase.from('support_contact').select('key, value').then(({ data }) => setSupport((data ?? []) as SC[]))
  }, [])
  function supportVal(key: string) { return support.find((x) => x.key === key)?.value ?? '' }
  function setSupportVal(key: string, value: string) {
    setSupport((xs) => (xs.some((x) => x.key === key) ? xs.map((x) => (x.key === key ? { ...x, value } : x)) : [...xs, { key, value }]))
  }
  async function saveSupport() {
    setSupportBusy(true); setSupportMsg(null)
    const rows = SC_FIELDS.map(([k]) => ({ key: k, value: supportVal(k) }))
    const { error } = await supabase.from('support_contact').upsert(rows, { onConflict: 'key' })
    setSupportBusy(false)
    setSupportMsg(error ? error.message : t('✓ Support contacts saved.'))
  }

  // Owner access (root owner only): grant/revoke OWNER on another admin (0093).
  const [ownerBusy, setOwnerBusy] = useState(false)
  const [ownerMsg, setOwnerMsg] = useState<string | null>(null)
  async function setOwner(id: string, grant: boolean) {
    setOwnerBusy(true); setOwnerMsg(null)
    const { error } = await supabase.rpc('set_owner_access', { p_target: id, p_grant: grant })
    setOwnerBusy(false)
    if (error) { setOwnerMsg(error.message); return }
    setOwnerMsg(grant ? t('✓ Owner access granted.') : t('✓ Owner access revoked.'))
    await load()
  }

  // Owner switch: customer notification emails on/off (0074). Default OFF.
  const [emailsOn, setEmailsOn] = useState<boolean | null>(null)
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailMsg, setEmailMsg] = useState<string | null>(null)
  useEffect(() => {
    void supabase.from('app_settings').select('bool_value').eq('key', 'emails_enabled').maybeSingle()
      .then(({ data }) => setEmailsOn(!!(data as { bool_value?: boolean } | null)?.bool_value))
  }, [])
  async function toggleEmails(next: boolean) {
    setEmailBusy(true); setEmailMsg(null)
    const prev = emailsOn
    setEmailsOn(next)
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'emails_enabled', bool_value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    setEmailBusy(false)
    if (error) { setEmailsOn(prev); setEmailMsg(error.message); return }
    setEmailMsg(next ? t('✓ Customer emails are ON.') : t('✓ Customer emails are suspended.'))
  }

  // Bulletin board moved to its own page (/admin/bulletin) — see BulletinBoardAdmin.

  async function createStaff(e: FormEvent) {
    e.preventDefault()
    const addr = suEmail.trim().toLowerCase()
    setBusy(true); setError(null); setNotice(null)
    // Staff access is granted ONLY here: GoTrue inviteUserByEmail (admin-create-staff
    // edge fn) emails an invite link; the invitee sets their own password.
    const { data, error: fnErr } = await supabase.functions.invoke('admin-create-staff', {
      body: { email: addr, full_name: suName.trim(), role: suRole, redirect_to: `${window.location.origin}/reset-password` },
    })
    setBusy(false)
    const error = fnErr || (data && (data as { error?: string }).error ? { message: (data as { error: string }).error } : null)
    if (error) { setError(error.message); return }
    setSuEmail(''); setSuName(''); setSuRole('admin')
    setNotice(t('Invite sent to {addr} ({suRole}). They’ll set their password via the email link.', { addr, suRole }))
    await load()
  }

  // Real-email staff: send a password-reset email (legacy @ktc-staff.local accounts
  // use the inline owner-set reset below).
  async function sendStaffReset(b: Broker) {
    if (!b.email) return
    setBusy(true); setError(null); setNotice(null)
    const { error } = await supabase.auth.resetPasswordForEmail(b.email, { redirectTo: `${window.location.origin}/reset-password` })
    setBusy(false)
    if (error) return setError(error.message)
    setNotice(t('Password-reset email sent to {email}.', { email: b.email }))
  }

  // Owner-only staff password reset (staff use synthetic @ktc-staff.local
  // emails, so the email reset flow can't reach them — RPC from 0039).
  const [resetId, setResetId] = useState<string | null>(null)
  const [resetPw, setResetPw] = useState('')

  async function doResetPw(b: Broker) {
    const username = (b.email ?? '').split('@')[0]
    const pwIssue2 = passwordIssue(resetPw)
    if (pwIssue2) { setError(pwIssue2); return }
    setBusy(true); setError(null); setNotice(null)
    const { error } = await supabase.rpc('reset_staff_password', { p_username: username, p_password: resetPw })
    setBusy(false)
    if (error) return setError(error.message)
    setResetId(null); setResetPw('')
    setNotice(t('Password reset for "{username}" — hand them the new password.', { username }))
  }

  async function revoke(b: Broker) {
    if (b.is_owner) return
    setBusy(true); setError(null); setNotice(null)
    const { error } = await supabase.from('customers').update({ is_admin: false, staff_role: null }).eq('id', b.id)
    setBusy(false)
    if (error) return setError(error.message)
    setNotice(t('Staff access revoked from {email}.', { email: b.email ?? '' }))
    await load()
  }

  return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 18, marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{t('Language')}</h2>
          <p className="ktc-sub" style={{ margin: '2px 0 0', fontSize: 12 }}>
            {t('Switch the portal between English and Filipino. Also available as EN / FIL in the side menu.')}
          </p>
        </div>
        <LangToggle />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        <button type="button" onClick={() => setTab('pricing')} className={tab === 'pricing' ? 'ktc-btn ktc-btn--sm' : 'ktc-btn-secondary ktc-btn--sm'} style={{ width: 'auto', padding: '7px 14px' }}>{t('Pricing & tariff')}</button>
        <button type="button" onClick={() => setTab('ops')} className={tab === 'ops' ? 'ktc-btn ktc-btn--sm' : 'ktc-btn-secondary ktc-btn--sm'} style={{ width: 'auto', padding: '7px 14px' }}>{t('Operations')}</button>
        <button type="button" onClick={() => setTab('access')} className={tab === 'access' ? 'ktc-btn ktc-btn--sm' : 'ktc-btn-secondary ktc-btn--sm'} style={{ width: 'auto', padding: '7px 14px' }}>{t('Access & staff')}</button>
        {isOwner && (
          <button type="button" onClick={() => setTab('system')} className={tab === 'system' ? 'ktc-btn ktc-btn--sm' : 'ktc-btn-secondary ktc-btn--sm'} style={{ width: 'auto', padding: '7px 14px' }}>{t('System')}</button>
        )}
      </div>

      {tab === 'system' && isOwner && <TestPushCard />}
      {tab === 'system' && isOwner && <TestEmailCard />}

      <div className="ktc-glass" style={{ padding: 18, marginBottom: 18, display: tab === 'access' ? undefined : 'none' }}>
        <h1 className="ktc-title">{t('Staff & access')}</h1>
        <p className="ktc-sub" style={{ marginBottom: 20 }}>
          {t('Internal KTC staff with admin access. Managed separately from brokers.')}
          {isOwner ? '' : ' ' + t('Only the owner can change access.')}
        </p>

        {isOwner ? (
          <>
            <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600 }}>{t('Create staff account')}</h2>
            <form onSubmit={createStaff} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <label className="ktc-label" htmlFor="suName">{t('Full name')}</label>
                <input id="suName" className="ktc-input" required value={suName} onChange={(e) => setSuName(e.target.value)} style={{ maxWidth: 200, width: '100%' }} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label className="ktc-label" htmlFor="suEmail">{t('Email')}</label>
                <input id="suEmail" className="ktc-input" type="email" required value={suEmail} onChange={(e) => setSuEmail(e.target.value)} placeholder="staff@email.com" style={{ maxWidth: 240, width: '100%' }} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label className="ktc-label" htmlFor="suRole">{t('Role')}</label>
                <select id="suRole" className="ktc-input" value={suRole} onChange={(e) => setSuRole(e.target.value as 'admin' | 'cashier' | 'checker' | 'operations' | 'csr')} style={{ maxWidth: 130, width: '100%' }}>
                  <option value="admin">{t('Admin')}</option>
                  <option value="operations">{t('Operations')}</option>
                  <option value="cashier">{t('Cashier')}</option>
                  <option value="checker">{t('Checker')}</option>
                  <option value="csr">{t('CSR')}</option>
                </select>
              </div>
              <button className="ktc-btn" type="submit" disabled={busy} style={{ width: 'auto', padding: '11px 18px' }}>{t('Send invite')}</button>
            </form>
            <p className="ktc-label" style={{ fontSize: 12, marginTop: 10, opacity: 0.8 }}>
              {t('We email them a secure invite link to set their own password — this is the only way to grant staff access. For a shared/kiosk device, use a dedicated inbox (e.g. gate1@ktcterminal.com).')}
            </p>
          </>
        ) : (
          <p className="ktc-label" style={{ fontSize: 13 }}>{t('Only the owner can add or change staff access.')}</p>
        )}

        {notice && <div className="ktc-label" style={{ marginTop: 10, fontSize: 13 }}>{notice}</div>}
        {error && <div style={{ marginTop: 10, color: 'var(--acc-2)', fontSize: 13 }}>{error}</div>}
      </div>

      {isOwner && (
        <div className="ktc-glass" style={{ padding: 18, marginBottom: 18, display: tab === 'ops' ? undefined : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ maxWidth: 460 }}>
              <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{t('Customer notification emails')}</h2>
              <p className="ktc-label" style={{ marginTop: 0, marginBottom: 0, fontSize: 13 }}>
                {t('Master switch for emails sent to customers (account approved, order on-hold / rejected, payment-proof issues). In-app notifications keep working either way. Owner security / watchdog alerts are never affected by this.')}
              </p>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: emailBusy ? 'default' : 'pointer', flex: '0 0 auto' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: emailsOn ? 'var(--acc-2)' : 'hsl(var(--ink-3))' }}>
                {emailsOn === null ? t('…') : emailsOn ? t('ON') : t('Suspended')}
              </span>
              <input type="checkbox" role="switch" checked={!!emailsOn} disabled={emailBusy || emailsOn === null}
                onChange={(e) => void toggleEmails(e.target.checked)}
                style={{ width: 40, height: 22, cursor: 'inherit' }} />
            </label>
          </div>
          {emailMsg && <div className="ktc-label" style={{ marginTop: 12, fontSize: 13, color: 'var(--acc-2)', fontWeight: 600 }}>{emailMsg}</div>}
          {emailsOn === false && (
            <div className="ktc-label" style={{ marginTop: 12, fontSize: 12.5, padding: '9px 12px', borderRadius: 9, background: 'var(--c-w35)', border: '1px dashed var(--glass-brd)' }}>
              {t('Currently suspended — no customer emails are being sent. Flip the switch when you’re ready to turn them on.')}
            </div>
          )}
        </div>
      )}

      <div className="ktc-glass" style={{ padding: 18, marginBottom: 18, display: tab === 'pricing' ? undefined : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{t('Service rates & fees')}</h2>
            <p className="ktc-label" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
              {t('Used for the online-payment computation (the official Service Invoice + receipt come from the ERP). Amounts in ₱.')}
            </p>
          </div>
          <button
            type="button"
            className="ktc-btn-secondary ktc-btn--sm"
            onClick={() => { setPricingLocked((v) => !v); setPricingMsg(null) }}
            title={pricingLocked ? t('Prices are locked against accidental edits — unlock to change them') : t('Lock editing again')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {pricingLocked ? <><LockIcon size={14} /> {t('Locked — unlock to edit')}</> : <><PencilIcon size={14} /> {t('Editing · tap to lock')}</>}
          </button>
        </div>

        <div style={{ display: 'grid', gap: 8, maxWidth: 600, opacity: pricingLocked ? 0.65 : 1 }}>
          {rates.map((r, i) => (
            <div
              key={r.service}
              draggable={!pricingLocked}
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragIdx !== null && dragIdx !== i) moveRate(dragIdx, i); setDragIdx(null) }}
              onDragEnd={() => setDragIdx(null)}
              style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 12px', borderRadius: 10,
                background: r.active ? 'var(--c-w55)' : 'var(--c-w30)',
                border: dragIdx === i ? '1px dashed rgb(var(--acc-rgb) / 0.6)' : '1px solid var(--glass-brd)',
                opacity: r.active ? 1 : 0.6,
                cursor: pricingLocked ? 'default' : 'grab',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                {!pricingLocked && <span aria-hidden title={t('Drag to reorder')} style={{ color: 'hsl(var(--ink-3))', fontSize: 14 }}>⠿</span>}
                {r.service}
                {!r.active && <span className="ktc-chip" style={{ fontSize: 10 }}>{t('inactive')}</span>}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span className="ktc-label" style={{ fontSize: 12 }}>₱</span>
                <input className="ktc-input" type="number" step="0.01" min="0" value={r.rate ?? ''} disabled={pricingLocked}
                  placeholder={t('Enter rate')}
                  onChange={(e) => setRateVal(r.service, e.target.value === '' ? null : Number(e.target.value))} style={{ width: 110, padding: '7px 10px' }} />
                <span className="ktc-label" style={{ fontSize: 11, width: 72 }}>{r.unit.replace('per_', '/ ')}</span>
                <label className="ktc-label" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: pricingLocked ? 'default' : 'pointer' }}
                  title={r.active ? t('Untick to remove from the New Job Order form and calculator (existing orders unaffected)') : t('Tick to offer this service again')}>
                  <input type="checkbox" checked={r.active} disabled={pricingLocked}
                    onChange={(e) => setRateActive(r.service, e.target.checked)} />
                  {t('active')}
                </label>
                {!pricingLocked && !r.active && (
                  delService === r.service ? (
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                      <button type="button" className="ktc-link" style={{ fontWeight: 700, color: 'var(--acc-2)' }} disabled={pricingBusy}
                        onClick={() => void deleteService(r.service)}>{t('delete?')}</button>
                      <button type="button" className="ktc-link" onClick={() => setDelService(null)}>{t('no')}</button>
                    </span>
                  ) : (
                    <button type="button" className="ktc-link" aria-label={t('Delete {service}', { service: r.service })} title={t('Delete (only possible while unused by any order)')}
                      style={{ fontSize: 14, color: 'var(--acc-2)', opacity: 0.8 }} onClick={() => setDelService(r.service)}>✕</button>
                  )
                )}
              </span>
            </div>
          ))}

          {!pricingLocked && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, border: '1px dashed var(--glass-brd)' }}>
              <input className="ktc-input" placeholder={t("New service name (can't be renamed later)")} value={newService}
                onChange={(e) => setNewService(e.target.value)} style={{ flex: '1 1 220px', padding: '7px 10px', fontSize: 13 }} />
              <label className="ktc-label" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={newVatable} onChange={(e) => setNewVatable(e.target.checked)} /> {t('VATable')}
              </label>
              <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={addService}>{t('+ Add service')}</button>
              <span className="ktc-label" style={{ flexBasis: '100%', fontSize: 11, lineHeight: 1.5, opacity: 0.8 }}>
                {t('Names containing “X-Ray”, “DEA”, or “OOG” join those serving-number queues; anything else queues under “Other”. Drag ⠿ to arrange the display order. Deactivate to retire a service (past orders keep their pricing); ✕ delete is only possible while no order has ever used it.')}
              </span>
            </div>
          )}
        </div>

        <div style={{ height: 1, background: 'hsl(var(--line-soft))', margin: '16px 0' }} />

        <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          {settings.map((s) =>
            s.key === 'vat_rate' ? (
              // Statutory — read-only here, server-guarded (migration 0050).
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 12px', borderRadius: 10, background: 'var(--c-w35)', border: '1px dashed var(--glass-brd)' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{s.label || t('VAT rate')}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <b className="ktc-mono" style={{ fontSize: 14 }}>{((s.value ?? 0.12) * 100).toFixed(0)}%</b>
                  <span className="ktc-chip" title={t('Philippine statutory VAT — changeable only server-side if the law changes')}>{t('statutory · fixed')}</span>
                </span>
              </div>
            ) : (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 12px', borderRadius: 10, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)', opacity: pricingLocked ? 0.65 : 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{s.label || s.key}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="ktc-label" style={{ fontSize: 12 }}>₱</span>
                  <input className="ktc-input" type="number" step="0.01" min="0" value={s.value ?? ''} disabled={pricingLocked}
                    placeholder={t('Enter amount')}
                    onChange={(e) => setSettingVal(s.key, e.target.value === '' ? null : Number(e.target.value))} style={{ width: 120, padding: '7px 10px' }} />
                </span>
              </div>
            ),
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
          <button className="ktc-btn" type="button" disabled={pricingBusy || pricingLocked} onClick={() => void savePricing()} style={{ width: 'auto', padding: '10px 20px' }}
            title={pricingLocked ? t('Unlock editing first') : undefined}>
            {pricingBusy ? t('Saving…') : t('Save pricing')}
          </button>
          {pricingLocked && !pricingMsg && <span className="ktc-label" style={{ fontSize: 12.5 }}>{t('Locked against accidental edits.')}</span>}
          {pricingMsg && <span className="ktc-label" style={{ fontSize: 13, color: 'var(--acc-2)', fontWeight: 600 }}>{pricingMsg}</span>}
        </div>
      </div>

      {isRootOwner && (
        <div className="ktc-glass" style={{ padding: 18, marginBottom: 18, display: tab === 'access' ? undefined : 'none' }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{t('Owner access (root owner only)')}</h2>
          <p className="ktc-label" style={{ marginTop: 0, marginBottom: 16, fontSize: 13, lineHeight: 1.55 }}>
            {t('You are the root owner. You can grant or revoke OWNER access for other admin accounts. A secondary owner has every owner power EXCEPT minting owners — only you (root) can create owners. The root owner can’t be changed here.')}
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {staff.filter((s) => !s.is_root_owner && (s.is_admin || s.is_owner)).length === 0 ? (
              <span className="ktc-label" style={{ fontSize: 13 }}>{t('No other admins yet — create an admin first, then grant owner here.')}</span>
            ) : staff.filter((s) => !s.is_root_owner && (s.is_admin || s.is_owner)).map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
                <span style={{ fontSize: 13.5, minWidth: 0 }}>
                  <b>{s.full_name || s.email}</b>
                  <span className="ktc-label" style={{ fontSize: 11.5, marginLeft: 8 }}>{s.email}{s.is_owner ? ` · ${t('Owner')}` : ` · ${t('Admin')}`}</span>
                </span>
                {s.is_owner ? (
                  <button type="button" className="ktc-link" style={{ fontSize: 12.5, color: 'var(--c-h0-60-40)' }} disabled={ownerBusy} onClick={() => void setOwner(s.id, false)}>{t('Revoke owner')}</button>
                ) : (
                  <button type="button" className="ktc-btn ktc-btn--sm" disabled={ownerBusy} onClick={() => void setOwner(s.id, true)}>{t('Grant owner')}</button>
                )}
              </div>
            ))}
          </div>
          {ownerMsg && <p className="ktc-label" style={{ fontSize: 13, color: 'var(--acc-2)', fontWeight: 600, marginTop: 12 }}>{ownerMsg}</p>}
        </div>
      )}

      <div className="ktc-glass" style={{ padding: 18, marginBottom: 18, display: tab === 'pricing' ? undefined : 'none' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{t('Terminal tariff')}</h2>
        <p className="ktc-label" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
          {t('Per-container rates the Rate Calculator looks up. For each service, tick the conditions its rate depends on — leave all unticked for one uniform rate. Storage is special: domestic is a flat per-day rate by size; foreign is a progressive per-day band tariff. Amounts in ₱, VAT-exclusive (12% VAT is added on the subtotal).')}
        </p>
        <div style={{ display: 'grid', gap: 16 }}>
          {GRANULAR_SERVICES.map(([svc, svcLabel]) => {
            const dims = termConfig[svc] ?? []
            return (
              <div key={svc} style={{ display: 'grid', gap: 8, padding: '12px 14px', borderRadius: 12, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{t(svcLabel)}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                  <span className="ktc-label" style={{ fontSize: 11.5 }}>{t('Rate varies by:')}</span>
                  {TERM_DIMS.map((d) => (
                    <label key={d.key} className="ktc-label" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                      <input type="checkbox" checked={dims.includes(d.key)} onChange={() => toggleDim(svc, d.key)} /> {t(d.label)}
                    </label>
                  ))}
                  {dims.length === 0 && <span className="ktc-chip">{t('Uniform rate')}</span>}
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {dimCombos(dims).map((combo) => {
                    const label = dims.length === 0
                      ? t('All containers')
                      : TERM_DIMS.filter((d) => dims.includes(d.key)).map((d) => t(DIM_VAL_LABEL[combo[d.key]] ?? combo[d.key])).join(' · ')
                    return (
                      <div key={JSON.stringify(combo)} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ flex: '1 1 180px', minWidth: 0, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {dims.includes('origin') && <OriginPill origin={combo.origin as Origin} size="sm" />}
                          {label}
                        </span>
                        <span className="ktc-label" style={{ fontSize: 12 }}>₱</span>
                        <input className="ktc-input" type="number" step="0.01" min="0" value={comboRate(svc, combo) ?? ''} placeholder={t('not set')}
                          onChange={(e) => setComboRate(svc, combo, e.target.value === '' ? null : Number(e.target.value))} style={{ width: 120, padding: '7px 10px' }} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Storage — domestic flat by size + foreign progressive bands */}
          <div style={{ display: 'grid', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{t('Storage (per day)')}</span>
            <div style={{ display: 'grid', gap: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600 }}><OriginPill origin="domestic" size="sm" /> {t('Flat per-day rate by size')}</span>
              {(['20', '40'] as const).map((sz) => (
                <div key={sz} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: '1 1 120px', fontSize: 12 }}>{t(sz === '20' ? '20ft' : '40ft')}</span>
                  <span className="ktc-label" style={{ fontSize: 12 }}>₱</span>
                  <input className="ktc-input" type="number" step="0.01" min="0" value={comboRate('storage', { origin: 'domestic', size: sz }) ?? ''} placeholder={t('not set')}
                    onChange={(e) => setComboRate('storage', { origin: 'domestic', size: sz }, e.target.value === '' ? null : Number(e.target.value))} style={{ width: 120, padding: '7px 10px' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600 }}><OriginPill origin="foreign" size="sm" /> {t('Progressive per-day bands (charged cumulatively after the free days)')}</span>
              {(['import', 'export', 'transhipment'] as const).map((tr) => {
                const bands = storageTiers.filter((b) => b.trade === tr && b.size === '20').sort((a, b) => a.day_from - b.day_from)
                return (
                  <div key={tr} style={{ display: 'grid', gap: 6 }}>
                    <span className="ktc-label" style={{ fontSize: 12.5, fontWeight: 700 }}>{t(tradeLabel(tr, 'foreign'))}</span>
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
                        <thead>
                          <tr>
                            <th className="ktc-label" style={{ textAlign: 'left', padding: '4px 12px 6px 0', fontWeight: 600 }}>{t('Days')}</th>
                            {bands.map((b) => (
                              <th key={b.id} className="ktc-label" style={{ padding: '4px 6px 6px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'center' }}>
                                {b.day_from}{b.day_to ? `–${b.day_to}` : '+'}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(['20', '40'] as const).map((sz) => (
                            <tr key={sz}>
                              <td className="ktc-label" style={{ padding: '3px 12px 3px 0', fontWeight: 600, whiteSpace: 'nowrap' }}>{t(sz === '20' ? '20ft' : '40ft')}</td>
                              {storageTiers.filter((b) => b.trade === tr && b.size === sz).sort((a, b) => a.day_from - b.day_from).map((b) => (
                                <td key={b.id} style={{ padding: '3px 4px' }}>
                                  <input className="ktc-input ktc-mono" type="number" step="0.01" min="0" value={b.rate ?? ''} placeholder="—"
                                    onChange={(e) => setTierRate(b.id, e.target.value === '' ? null : Number(e.target.value))} style={{ width: 96, padding: '7px 8px', textAlign: 'right' }} />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
          <button className="ktc-btn" type="button" disabled={termBusy} onClick={() => void saveTerm()} style={{ width: 'auto', padding: '10px 20px' }}>
            {termBusy ? t('Saving…') : t('Save terminal rates')}
          </button>
          {termMsg && <span className="ktc-label" style={{ fontSize: 13, color: 'var(--acc-2)', fontWeight: 600 }}>{termMsg}</span>}
        </div>
      </div>

      <div className="ktc-glass" style={{ padding: 18, marginBottom: 18, display: tab === 'pricing' ? undefined : 'none' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{t('Per-shipping-line charge rules')}</h2>
        <p className="ktc-label" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
          {t('Layer line-specific rules on top of the tariff: waive a charge, give a discount (% or ₱/container), or add a surcharge. Example: Maersk & MCC waive LoLo on export. Free storage days are set per line in the vessel schedule settings.')}
        </p>
        <div style={{ display: 'grid', gap: 12 }}>
          {SHIPPING_LINES.map((l) => {
            const rs = lineRules.filter((r) => r.shipping_line === l.code)
            return (
              <div key={l.code} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{l.label} <span className="ktc-label" style={{ fontSize: 11.5, fontWeight: 500 }}>({l.origin === 'domestic' ? t('Domestic') : t('Foreign')})</span></span>
                  <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => openDraft(l.code)}>+ {t('Add rule')}</button>
                </div>
                {rs.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {rs.map((r) => (
                      <span key={r.id} className="ktc-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                        {ruleLabel(r)}
                        <button type="button" aria-label={t('Remove')} onClick={() => void deleteRule(r.id)}
                          style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', fontSize: 13, lineHeight: 1, padding: 0 }}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
                {draft?.line === l.code && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' }}>
                    <select className="ktc-input" value={draft.service} onChange={(e) => setDraft({ ...draft, service: e.target.value })} style={{ width: 'auto', padding: '7px 10px', fontSize: 12.5 }}>
                      {TERMINAL_CHARGE_SERVICES.map((s) => <option key={s.key} value={s.key}>{t(s.label)}</option>)}
                    </select>
                    <select className="ktc-input" value={draft.trade} onChange={(e) => setDraft({ ...draft, trade: e.target.value })} style={{ width: 'auto', padding: '7px 10px', fontSize: 12.5 }}>
                      <option value="any">{t('Import & export')}</option>
                      <option value="import">{t('Import')}</option>
                      <option value="export">{t('Export')}</option>
                    </select>
                    <select className="ktc-input" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} style={{ width: 'auto', padding: '7px 10px', fontSize: 12.5 }}>
                      {CHARGE_RULE_ACTIONS.map((a) => <option key={a.key} value={a.key}>{t(a.label)}</option>)}
                    </select>
                    {CHARGE_RULE_ACTIONS.find((a) => a.key === draft.action)?.needsValue && (
                      <input className="ktc-input" type="number" step="0.01" min="0" value={draft.value} placeholder="0"
                        onChange={(e) => setDraft({ ...draft, value: e.target.value })} style={{ width: 90, padding: '7px 10px', fontSize: 12.5 }} aria-label={t('Value')} />
                    )}
                    <button type="button" className="ktc-btn ktc-btn--sm" onClick={() => void addRule()} style={{ width: 'auto', padding: '7px 14px' }}>{t('Add')}</button>
                    <button type="button" className="ktc-link" style={{ fontSize: 12.5 }} onClick={() => setDraft(null)}>{t('Cancel')}</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {ruleMsg && <p className="ktc-label" style={{ fontSize: 13, color: 'var(--acc-2)', fontWeight: 600, marginTop: 12 }}>{ruleMsg}</p>}
      </div>

      <div className="ktc-glass" style={{ padding: 18, marginBottom: 18, display: tab === 'ops' ? undefined : 'none' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{t('Support contact channels')}</h2>
        <p className="ktc-label" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
          {t('Shown on the customer Help & Support page as “talk to an agent” deep links (call / SMS / Viber / email) with a prefilled message + ticket number. Leave a field blank to hide that channel.')}
        </p>
        <div style={{ display: 'grid', gap: 8, maxWidth: 460 }}>
          {SC_FIELDS.map(([k, label]) => (
            <div key={k} style={{ display: 'grid', gap: 5 }}>
              <label className="ktc-label" htmlFor={`sc-${k}`} style={{ fontSize: 12 }}>{t(label)}</label>
              <input id={`sc-${k}`} className="ktc-input" value={supportVal(k)} onChange={(e) => setSupportVal(k, e.target.value)}
                placeholder={k === 'hours' ? t('e.g. Mon–Sat, 8am–5pm') : ''} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
          <button className="ktc-btn" type="button" disabled={supportBusy} onClick={() => void saveSupport()} style={{ width: 'auto', padding: '10px 20px' }}>
            {supportBusy ? t('Saving…') : t('Save support contacts')}
          </button>
          {supportMsg && <span className="ktc-label" style={{ fontSize: 13, color: 'var(--acc-2)', fontWeight: 600 }}>{supportMsg}</span>}
        </div>
      </div>

      <div className="ktc-glass" style={{ padding: 18, marginBottom: 18, display: tab === 'ops' ? undefined : 'none' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{t('Payment details (customer payment page)')}</h2>
        <p className="ktc-label" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
          {t('Bank account + QRPH QR shown when a customer pays online. Online payments (GCash / Maya / banks) all route through the QR. Leave fields blank to hide them.')}
        </p>
        <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          {payInfo.filter((x) => x.key !== 'qr_path' && x.key !== 'gcash_number').map((x) => (
            <div key={x.key} style={{ display: 'grid', gap: 5 }}>
              <label className="ktc-label" htmlFor={`pi-${x.key}`} style={{ fontSize: 12 }}>{x.label || x.key}</label>
              {x.key === 'instructions' ? (
                <textarea id={`pi-${x.key}`} className="ktc-input" rows={2} value={x.value} onChange={(e) => setPayVal(x.key, e.target.value)} />
              ) : (
                <input id={`pi-${x.key}`} className="ktc-input" value={x.value} onChange={(e) => setPayVal(x.key, e.target.value)} />
              )}
            </div>
          ))}
          <div style={{ display: 'grid', gap: 5 }}>
            <label className="ktc-label" htmlFor="pi-qr" style={{ fontSize: 12 }}>{t('QRPH QR code image')}{payInfo.some((x) => x.key === 'qr_path' && x.value) ? ' ' + t('— replace current') : ''}</label>
            <input id="pi-qr" className="ktc-input" type="file" accept="image/*" onChange={(e) => setQrFile(e.target.files?.[0] ?? null)} style={{ padding: '9px 11px' }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
          <button className="ktc-btn" type="button" disabled={payBusy} onClick={() => void savePayInfo()} style={{ width: 'auto', padding: '10px 20px' }}>
            {payBusy ? t('Saving…') : t('Save payment details')}
          </button>
          {payMsg && <span className="ktc-label" style={{ fontSize: 13, fontWeight: 600 }}>{payMsg}</span>}
        </div>
      </div>

      <div className="ktc-glass" style={{ padding: 18, marginBottom: 18, display: tab === 'pricing' ? undefined : 'none' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{t('Free storage days per shipping line')}</h2>
        <p className="ktc-label" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
          {t("Drives the vessel schedule's")} <strong>{t('Last Free Day')}</strong> {t('(finish discharging + import days). Set for import and export.')}
        </p>
        <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          <div className="ktc-label" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11.5 }}>
            <span style={{ flex: 1, minWidth: 0 }}>{t('Shipping line')}</span>
            <span style={{ width: 90, textAlign: 'center' }}>{t('Import days')}</span>
            <span style={{ width: 90, textAlign: 'center' }}>{t('Export days')}</span>
            <span style={{ width: 96, textAlign: 'center' }}>{t('In-house')}</span>
            <span style={{ width: 24 }} />
          </div>
          {shipLines.map((l) => (
            <div key={l.name} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 10, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>{l.name}</span>
              <input className="ktc-input" type="number" min="0" value={l.free_days_import} onChange={(e) => setSl(l.name, 'free_days_import', Number(e.target.value))} style={{ width: 90, padding: '7px 10px', textAlign: 'center' }} />
              <input className="ktc-input" type="number" min="0" value={l.free_days_export} onChange={(e) => setSl(l.name, 'free_days_export', Number(e.target.value))} style={{ width: 90, padding: '7px 10px', textAlign: 'center' }} />
              <label style={{ width: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 12 }} title={t('In-house line — hide its vessels from customers')}>
                <input type="checkbox" checked={l.internal} onChange={() => toggleInternal(l.name)} /> {t('Hide')}
              </label>
              <button type="button" className="ktc-link" title={t('Remove {name}', { name: l.name })} style={{ width: 24, color: 'var(--acc-2)', fontSize: 14 }} onClick={() => void deleteLine(l.name)}>✕</button>
            </div>
          ))}
          {shipLines.length === 0 && <p className="ktc-label" style={{ fontSize: 13 }}>{t('No lines yet — add your shipping lines below.')}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, border: '1px dashed var(--glass-brd)' }}>
            <input className="ktc-input" placeholder={t('New shipping line (e.g. SITC)')} value={newLine} onChange={(e) => setNewLine(e.target.value)} style={{ flex: 1, padding: '7px 10px', fontSize: 13 }} />
            <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={addLine}>{t('+ Add line')}</button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
          <button className="ktc-btn" type="button" disabled={slBusy} onClick={() => void saveLines()} style={{ width: 'auto', padding: '10px 20px' }}>
            {slBusy ? t('Saving…') : t('Save free-days')}
          </button>
          {slMsg && <span className="ktc-label" style={{ fontSize: 13, fontWeight: 600 }}>{slMsg}</span>}
        </div>
      </div>

      <div className="ktc-glass" style={{ padding: 18, marginBottom: 18, display: tab === 'pricing' ? undefined : 'none' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{t('RPS per-move rates')}</h2>
        <p className="ktc-label" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
          {t('Charged per move when operations assesses a JO as needing RPS (VATable, added on top of the base). Amounts in ₱.')}
        </p>
        <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
          {moveRates.map((m) => (
            <div key={m.move_type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 12px', borderRadius: 10, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{m.move_type}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="ktc-label" style={{ fontSize: 12 }}>₱</span>
                <input className="ktc-input" type="number" step="0.01" min="0" value={m.rate ?? ''} placeholder={t('Enter rate')}
                  onChange={(e) => setMr(m.move_type, e.target.value === '' ? null : Number(e.target.value))} style={{ width: 120, padding: '7px 10px' }} />
                <span className="ktc-label" style={{ fontSize: 11 }}>{t('/ move')}</span>
              </span>
            </div>
          ))}
          {moveRates.length === 0 && <p className="ktc-label" style={{ fontSize: 13 }}>{t('No move types configured.')}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
          <button className="ktc-btn" type="button" disabled={mrBusy} onClick={() => void saveMoveRates()} style={{ width: 'auto', padding: '10px 20px' }}>
            {mrBusy ? t('Saving…') : t('Save move rates')}
          </button>
          {mrMsg && <span className="ktc-label" style={{ fontSize: 13, fontWeight: 600 }}>{mrMsg}</span>}
        </div>
      </div>

      <div className="ktc-glass" style={{ padding: 18, marginBottom: 18, display: tab === 'pricing' ? undefined : 'none' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{t('Additional charge types')}</h2>
        <p className="ktc-label" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
          {t('These feed the “Add charge” dropdown on a job order. The amount pre-fills, but staff can adjust it per charge. Leave an amount blank for “not set”. Deactivate to retire a type (it disappears from the dropdown); delete is only offered once inactive. Amounts in ₱.')}
        </p>
        <div style={{ display: 'grid', gap: 8, maxWidth: 600 }}>
          <div className="ktc-label" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11.5, paddingLeft: 2 }}>
            <span style={{ flex: '1 1 180px', minWidth: 0 }}>{t('Label')}</span>
            <span style={{ width: 130, textAlign: 'center' }}>{t('Default amount')}</span>
            <span style={{ width: 70, textAlign: 'center' }}>{t('Sort')}</span>
            <span style={{ width: 64, textAlign: 'center' }}>{t('Active')}</span>
            <span style={{ width: 24 }} />
          </div>
          {chargeTypes.map((c) => (
            <div key={c.id} style={{
              display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10,
              background: c.active ? 'var(--c-w55)' : 'var(--c-w30)', border: '1px solid var(--glass-brd)', opacity: c.active ? 1 : 0.6,
            }}>
              <input className="ktc-input" value={c.label} onChange={(e) => setCt(c.id, 'label', e.target.value)}
                style={{ flex: '1 1 180px', minWidth: 0, padding: '7px 10px', fontSize: 13, fontWeight: 600 }} aria-label={t('Label')} />
              <span style={{ width: 130, display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
                <span className="ktc-label" style={{ fontSize: 12 }}>₱</span>
                <input className="ktc-input" type="number" step="0.01" min="0" value={c.default_amount ?? ''} placeholder={t('not set')}
                  onChange={(e) => setCt(c.id, 'default_amount', e.target.value === '' ? null : Number(e.target.value))}
                  style={{ width: 100, padding: '7px 10px' }} aria-label={t('Default amount')} />
              </span>
              <input className="ktc-input" type="number" min="0" value={c.sort}
                onChange={(e) => setCt(c.id, 'sort', e.target.value === '' ? 0 : Number(e.target.value))}
                style={{ width: 70, padding: '7px 10px', textAlign: 'center' }} aria-label={t('Sort')} />
              <label className="ktc-label" style={{ width: 64, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}
                title={c.active ? t('Untick to remove from the “Add charge” dropdown (existing charges unaffected)') : t('Tick to offer this charge type again')}>
                <input type="checkbox" checked={c.active} onChange={(e) => setCt(c.id, 'active', e.target.checked)} />
              </label>
              {!c.active ? (
                delCharge === c.id ? (
                  <span style={{ width: 24, display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
                    <button type="button" className="ktc-link" style={{ fontWeight: 700, color: 'var(--acc-2)' }} disabled={ctBusy}
                      onClick={() => void deleteChargeType(c.id)}>{t('delete?')}</button>
                    <button type="button" className="ktc-link" onClick={() => setDelCharge(null)}>{t('no')}</button>
                  </span>
                ) : (
                  <button type="button" className="ktc-link" aria-label={t('Delete {label}', { label: c.label })} title={t('Delete this charge type')}
                    style={{ width: 24, fontSize: 14, color: 'var(--acc-2)', opacity: 0.8 }} onClick={() => setDelCharge(c.id)}>✕</button>
                )
              ) : (
                <span style={{ width: 24 }} />
              )}
            </div>
          ))}
          {chargeTypes.length === 0 && <p className="ktc-label" style={{ fontSize: 13 }}>{t('No charge types yet — add one below.')}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, border: '1px dashed var(--glass-brd)' }}>
            <input className="ktc-input" placeholder={t('New charge type name')} value={newCharge}
              onChange={(e) => setNewCharge(e.target.value)} style={{ flex: '1 1 200px', padding: '7px 10px', fontSize: 13 }} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className="ktc-label" style={{ fontSize: 12 }}>₱</span>
              <input className="ktc-input" type="number" step="0.01" min="0" value={newChargeAmt} placeholder={t('amount (optional)')}
                onChange={(e) => setNewChargeAmt(e.target.value)} style={{ width: 130, padding: '7px 10px' }} aria-label={t('Default amount')} />
            </span>
            <button type="button" className="ktc-btn-secondary ktc-btn--sm" disabled={ctBusy} onClick={() => void addChargeType()}>{t('+ Add type')}</button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
          <button className="ktc-btn" type="button" disabled={ctBusy} onClick={() => void saveChargeTypes()} style={{ width: 'auto', padding: '10px 20px' }}>
            {ctBusy ? t('Saving…') : t('Save charge types')}
          </button>
          {ctMsg && <span className="ktc-label" style={{ fontSize: 13, color: 'var(--acc-2)', fontWeight: 600 }}>{ctMsg}</span>}
        </div>
      </div>

      {isOwner && (
        <div className="ktc-glass" style={{ padding: 18, marginBottom: 18, display: tab === 'access' ? undefined : 'none' }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{t('Roles & gates')}</h2>
          <p className="ktc-label" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
            {t('What each staff role may do. Owner-only — enforced server-side (RLS + RPCs), the UI just mirrors it.')}
          </p>
          {gates.length === 0 ? (
            <span className="ktc-label">{t('Loading…')}</span>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 460 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px 14px 6px 0', fontWeight: 600 }} className="ktc-label">{t('Gate')}</th>
                    {['admin', 'operations', 'cashier', 'checker', 'csr'].map((r) => (
                      <th key={r} style={{ padding: '6px 14px', fontWeight: 650, textTransform: 'capitalize' }}>{t(r)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    ['view_job_orders', 'View job orders'],
                    ['view_xray_queue', 'View the X-ray queue (ops / checker / CSR — not cashier)'],
                    ['file_job_orders', 'File JO on behalf of a customer (walk-ins / in-house)'],
                    ['accept_orders', 'Accept order (submitted → processing)'],
                    ['complete_orders', 'Complete order (needs X-ray + payment done)'],
                    ['hold_reject_orders', 'Hold / reject an order'],
                    ['process_job_orders', 'Mark DEA/OOG service done · requeue / restore'],
                    ['confirm_xray', 'Confirm X-ray per van (checker station)'],
                    ['assess_rps', 'Assess RPS (port-services moves)'],
                    ['review_payments', 'Review payment proofs / record walk-in'],
                    ['record_invoice', 'Record ERP Service Invoice no. (= PAID)'],
                    ['manage_support', 'Support inbox'],
                    ['manage_approvals', 'Account approvals + dashboard'],
                    ['manage_customers', 'Manage customers'],
                    ['manage_consignees', 'Manage consignees'],
                    ['manage_vessel_schedule', 'Vessel schedule'],
                    ['manage_pricing', 'Settings · rates & fees'],
                  ] as const).map(([perm, label]) => (
                    <tr key={perm} style={{ borderTop: '1px solid hsl(var(--line-soft))' }}>
                      <td style={{ padding: '8px 14px 8px 0', lineHeight: 1.4 }}>{t(label)}</td>
                      {['admin', 'operations', 'cashier', 'checker', 'csr'].map((r) => {
                        const g = gates.find((x) => x.role === r && x.permission === perm)
                        return (
                          <td key={r} style={{ textAlign: 'center', padding: '8px 14px' }}>
                            <input
                              type="checkbox"
                              checked={g?.allowed ?? false}
                              onChange={() => toggleGate(r, perm)}
                              aria-label={`${t(r)}: ${t(label)}`}
                              style={{ width: 17, height: 17, cursor: 'pointer' }}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
            <button className="ktc-btn" type="button" disabled={gatesBusy || gates.length === 0} onClick={() => void saveGates()} style={{ width: 'auto', padding: '10px 20px' }}>
              {gatesBusy ? t('Saving…') : t('Save gates')}
            </button>
            {gatesMsg && <span className="ktc-label" style={{ fontSize: 13, fontWeight: 600 }}>{gatesMsg}</span>}
          </div>
        </div>
      )}

      <div className="ktc-glass" style={{ padding: 18, display: tab === 'access' ? undefined : 'none' }}>
        <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 600 }}>{t('Current staff')}</h2>
        {loading ? <span className="ktc-label">{t('Loading…')}</span> : staff.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>{t('No staff yet.')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {staff.map((b) => (
              <div key={b.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '12px 14px', borderRadius: 12, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)',
              }}>
                <div style={{ fontSize: 14 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <b>{b.full_name || b.email}</b>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, color: '#fff', background: 'linear-gradient(135deg, var(--acc), var(--acc-2))' }}>
                      {b.is_owner ? t('Owner')
                        : b.staff_role === 'operations' ? t('Operations')
                        : b.staff_role === 'cashier' ? t('Cashier')
                        : b.staff_role === 'checker' ? t('Checker')
                        : b.staff_role === 'csr' ? t('CSR')
                        : b.staff_role === 'purchaser' ? t('Purchaser')
                        : t('Admin')}
                    </span>
                  </div>
                  <div className="ktc-label" style={{ fontSize: 13 }}>{b.email}</div>
                </div>
                {isOwner && !b.is_owner && (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {b.email?.endsWith('@ktc-staff.local') ? (
                      resetId === b.id ? (
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <input className="ktc-input" type="text" value={resetPw} onChange={(e) => setResetPw(e.target.value)}
                            placeholder={t('New password')} title={PASSWORD_HINT} style={{ width: 150, padding: '7px 10px', fontSize: 13 }} autoFocus />
                          <button className="ktc-link" disabled={busy || !resetPw} onClick={() => void doResetPw(b)} style={{ fontSize: 13, fontWeight: 600 }}>{t('Save')}</button>
                          <button className="ktc-link" onClick={() => { setResetId(null); setResetPw('') }} style={{ fontSize: 13 }}>{t('Cancel')}</button>
                        </span>
                      ) : (
                        <button className="ktc-link" disabled={busy} onClick={() => { setResetId(b.id); setResetPw(''); setError(null) }} style={{ fontSize: 13 }}>
                          {t('Reset password')}
                        </button>
                      )
                    ) : (
                      <button className="ktc-link" disabled={busy} onClick={() => void sendStaffReset(b)} style={{ fontSize: 13 }}>
                        {t('Send reset email')}
                      </button>
                    )}
                    <button className="ktc-link" disabled={busy} onClick={() => revoke(b)} style={{ fontSize: 13, fontWeight: 600 }}>
                      {t('Revoke access')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* G12: cron / outbound / client-error monitor */}
      {tab === 'system' && <SystemHealth />}
    </AdminShell>
  )
}
