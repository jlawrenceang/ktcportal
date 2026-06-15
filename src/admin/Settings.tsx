import { useEffect, useState, type FormEvent } from 'react'
import AdminShell from './AdminShell'
import SystemHealth from './SystemHealth'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import type { Broker } from '../lib/types'
import { passwordIssue, PASSWORD_HINT } from '../lib/validation'
import { useT } from '../lib/i18n'

// Terminal tariff dimensions (migration 0073): service × trade × origin × size.
const TERM_SERVICES: [string, string][] = [['arrastre', 'Arrastre'], ['wharfage', 'Wharfage'], ['lolo', 'LoLo'], ['weighing', 'Weighing scale (export)'], ['storage', 'Storage (per day)']]
const TERM_COMBOS: [string, string][] = [['import', 'domestic'], ['import', 'foreign'], ['export', 'domestic'], ['export', 'foreign']]

export default function Settings() {
  const { t } = useT()
  const { broker: me } = useBroker()
  const isOwner = !!me?.is_owner
  const [staff, setStaff] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [suUser, setSuUser] = useState('')
  const [suPass, setSuPass] = useState('')
  const [suName, setSuName] = useState('')
  const [suRole, setSuRole] = useState<'admin' | 'cashier' | 'checker' | 'operations'>('admin')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Pricing (service rates + flat fees + VAT) — admin-editable, read-only to others.
  type Rate = { service: string; rate: number; unit: string; vatable: boolean; active: boolean; sort_order: number }
  type Setting = { key: string; value: number; label: string | null }
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
  type ShipLine = { name: string; free_days_import: number; free_days_export: number }
  const [shipLines, setShipLines] = useState<ShipLine[]>([])
  const [slBusy, setSlBusy] = useState(false)
  const [slMsg, setSlMsg] = useState<string | null>(null)
  const [newLine, setNewLine] = useState('')
  useEffect(() => {
    void supabase.from('shipping_lines').select('name, free_days_import, free_days_export').order('name')
      .then(({ data }) => setShipLines((data ?? []) as ShipLine[]))
  }, [])
  function setSl(name: string, field: 'free_days_import' | 'free_days_export', v: number) {
    setShipLines((xs) => xs.map((x) => (x.name === name ? { ...x, [field]: v } : x)))
  }
  function addLine() {
    const n = newLine.trim()
    if (!n) { setSlMsg(t('Enter the shipping line name first.')); return }
    if (shipLines.some((x) => x.name.toLowerCase() === n.toLowerCase())) { setSlMsg(t('That line already exists.')); return }
    setShipLines((xs) => [...xs, { name: n, free_days_import: 5, free_days_export: 7 }].sort((a, b) => a.name.localeCompare(b.name)))
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
  type MoveRateRow = { move_type: string; rate: number; active: boolean; sort_order: number | null }
  const [moveRates, setMoveRates] = useState<MoveRateRow[]>([])
  const [mrBusy, setMrBusy] = useState(false)
  const [mrMsg, setMrMsg] = useState<string | null>(null)
  useEffect(() => {
    void supabase.from('move_rates').select('move_type, rate, active, sort_order').order('sort_order')
      .then(({ data }) => setMoveRates(((data ?? []) as MoveRateRow[]).map((x) => ({ ...x, rate: Number(x.rate) }))))
  }, [])
  function setMr(mt: string, rate: number) { setMoveRates((xs) => xs.map((x) => (x.move_type === mt ? { ...x, rate } : x))) }
  async function saveMoveRates() {
    setMrBusy(true); setMrMsg(null)
    const { error } = await supabase.from('move_rates').upsert(moveRates.map((x) => ({ ...x, updated_at: new Date().toISOString() })), { onConflict: 'move_type' })
    setMrBusy(false)
    setMrMsg(error ? error.message : t('✓ Move rates saved.'))
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
    setSettings((s ?? []) as Setting[])
  }
  useEffect(() => { void loadPricing() }, [])

  function setRateVal(service: string, rate: number) {
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
    setRates((rs) => [...rs, { service: name, rate: 0, unit: 'per_container', vatable: newVatable, active: true, sort_order: rs.length + 1 }])
    setNewService(''); setNewVatable(true)
    setPricingMsg(t('"{name}" added — set its rate and Save pricing.', { name }))
  }
  function setSettingVal(key: string, value: number) {
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

  // Terminal tariff (arrastre / LoLo / storage), keyed by trade × origin × size (0073).
  type TermRate = { id: string; service: string; trade: string; origin: string; size: string; rate: number }
  const [termRates, setTermRates] = useState<TermRate[]>([])
  const [termBusy, setTermBusy] = useState(false)
  const [termMsg, setTermMsg] = useState<string | null>(null)
  useEffect(() => {
    void supabase.from('terminal_rates').select('id, service, trade, origin, size, rate')
      .then(({ data }) => setTermRates(((data ?? []) as TermRate[]).map((x) => ({ ...x, rate: Number(x.rate) }))))
  }, [])
  function setTermVal(id: string, rate: number) {
    setTermRates((rs) => rs.map((x) => (x.id === id ? { ...x, rate } : x)))
  }
  async function saveTerm() {
    setTermBusy(true); setTermMsg(null)
    const { error } = await supabase.from('terminal_rates')
      .upsert(termRates.map((x) => ({ id: x.id, service: x.service, trade: x.trade, origin: x.origin, size: x.size, rate: x.rate })), { onConflict: 'id' })
    setTermBusy(false)
    setTermMsg(error ? error.message : t('✓ Terminal rates saved.'))
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

  // Bulletin board (0076): admin posts announcements shown on customer Home.
  type Bulletin = { id: string; title: string; body: string; is_published: boolean; pinned: boolean; created_at: string }
  const [bposts, setBposts] = useState<Bulletin[]>([])
  const [bTitle, setBTitle] = useState('')
  const [bBody, setBBody] = useState('')
  const [bBusy, setBBusy] = useState(false)
  const [bMsg, setBMsg] = useState<string | null>(null)
  async function loadBulletins() {
    const { data } = await supabase.from('bulletin_posts')
      .select('id, title, body, is_published, pinned, created_at')
      .order('pinned', { ascending: false }).order('created_at', { ascending: false })
    setBposts((data ?? []) as Bulletin[])
  }
  useEffect(() => { void loadBulletins() }, [])
  async function addBulletin() {
    if (!bTitle.trim() || !bBody.trim()) { setBMsg(t('Enter a title and a message.')); return }
    setBBusy(true); setBMsg(null)
    const { error } = await supabase.from('bulletin_posts').insert({ title: bTitle.trim(), body: bBody.trim() })
    setBBusy(false)
    if (error) { setBMsg(error.message); return }
    setBTitle(''); setBBody(''); setBMsg(t('✓ Posted to the bulletin board.'))
    await loadBulletins()
  }
  async function patchBulletin(b: Bulletin, patch: Partial<Bulletin>) {
    const { error } = await supabase.from('bulletin_posts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', b.id)
    if (error) { setBMsg(error.message); return }
    await loadBulletins()
  }
  async function delBulletin(id: string) {
    const { error } = await supabase.from('bulletin_posts').delete().eq('id', id)
    if (error) { setBMsg(error.message); return }
    await loadBulletins()
  }

  async function createStaff(e: FormEvent) {
    e.preventDefault()
    const u = suUser.trim().toLowerCase()
    const pwIssue = passwordIssue(suPass)
    if (pwIssue) { setError(pwIssue); return }
    setBusy(true); setError(null); setNotice(null)
    const { error } = await supabase.rpc('create_staff', { p_username: u, p_password: suPass, p_full_name: suName.trim(), p_role: suRole })
    setBusy(false)
    if (error) { setError(error.message); return }
    setSuUser(''); setSuPass(''); setSuName(''); setSuRole('admin')
    setNotice(t('Staff account created ({suRole}). They sign in with username "{u}" and the password you set.', { suRole, u }))
    await load()
  }

  async function grant(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setNotice(null)
    const target = email.trim().toLowerCase()
    const { data, error } = await supabase
      .from('customers')
      .update({ is_admin: true, status: 'approved', decided_at: new Date().toISOString() })
      .eq('email', target)
      .select('id')
    setBusy(false)
    if (error) return setError(error.message)
    if (!data || data.length === 0) {
      setError(t('No account found for "{target}". Ask them to sign up first, then grant access here.', { target }))
      return
    }
    setEmail(''); setNotice(t('Admin access granted to {target}.', { target }))
    await load()
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
      <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
        <h1 className="ktc-title">{t('Staff & access')}</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 20 }}>
          {t('Internal KTC staff with admin access. Managed separately from brokers.')}
          {isOwner ? '' : ' ' + t('Only the owner can change access.')}
        </p>

        {isOwner ? (
          <>
            <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600 }}>{t('Create staff account')}</h2>
            <form onSubmit={createStaff} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <label className="ktc-label" htmlFor="suName">{t('Full name')}</label>
                <input id="suName" className="ktc-input" required value={suName} onChange={(e) => setSuName(e.target.value)} style={{ width: 200 }} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label className="ktc-label" htmlFor="suUser">{t('Username')}</label>
                <input id="suUser" className="ktc-input" required minLength={3} value={suUser} onChange={(e) => setSuUser(e.target.value)} placeholder="jdelacruz" style={{ width: 170 }} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label className="ktc-label" htmlFor="suPass">{t('Password')}</label>
                <input id="suPass" className="ktc-input" type="text" required minLength={8} value={suPass} onChange={(e) => setSuPass(e.target.value)} style={{ width: 160 }} title={PASSWORD_HINT} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label className="ktc-label" htmlFor="suRole">{t('Role')}</label>
                <select id="suRole" className="ktc-input" value={suRole} onChange={(e) => setSuRole(e.target.value as 'admin' | 'cashier' | 'checker' | 'operations')} style={{ width: 130 }}>
                  <option value="admin">{t('Admin')}</option>
                  <option value="operations">{t('Operations')}</option>
                  <option value="cashier">{t('Cashier')}</option>
                  <option value="checker">{t('Checker')}</option>
                </select>
              </div>
              <button className="ktc-btn" type="submit" disabled={busy} style={{ width: 'auto', padding: '11px 18px' }}>{t('Create staff')}</button>
            </form>
            <p className="ktc-label" style={{ fontSize: 12, marginTop: 10, opacity: 0.8 }}>
              {t('No email needed — hand them the username + password. They sign in at the login page with the username.')}
            </p>

            <div style={{ height: 1, background: 'hsl(var(--line-soft))', margin: '18px 0' }} />

            <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600 }}>{t('Or grant admin to an existing account')}</h2>
            <form onSubmit={grant} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <label className="ktc-label" htmlFor="email">{t('Email of a signed-up user')}</label>
                <input id="email" className="ktc-input" type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="someone@email.com" style={{ width: 280 }} />
              </div>
              <button className="ktc-btn" type="submit" disabled={busy} style={{ width: 'auto', padding: '11px 18px' }}>{t('Grant access')}</button>
            </form>
          </>
        ) : (
          <p className="ktc-label" style={{ fontSize: 13 }}>{t('Only the owner can add or change staff access.')}</p>
        )}

        {notice && <div className="ktc-label" style={{ marginTop: 10, fontSize: 13 }}>{notice}</div>}
        {error && <div style={{ marginTop: 10, color: 'var(--acc-2)', fontSize: 13 }}>{error}</div>}
      </div>

      {isOwner && (
        <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
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

      <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{t('Bulletin board')}</h2>
        <p className="ktc-label" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
          {t('Announcements shown on every customer’s Home. Each post is a topic customers tap to read in full.')}
        </p>
        <div style={{ display: 'grid', gap: 8, maxWidth: 560 }}>
          <input className="ktc-input" placeholder={t('Topic title')} value={bTitle} onChange={(e) => setBTitle(e.target.value)} />
          <textarea className="ktc-input" rows={3} placeholder={t('Message')} value={bBody} onChange={(e) => setBBody(e.target.value)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="ktc-btn" type="button" disabled={bBusy} onClick={() => void addBulletin()} style={{ width: 'auto', padding: '10px 20px' }}>
              {bBusy ? t('Posting…') : t('Post to board')}
            </button>
            {bMsg && <span className="ktc-label" style={{ fontSize: 13, color: 'var(--acc-2)', fontWeight: 600 }}>{bMsg}</span>}
          </div>
        </div>
        {bposts.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginTop: 16, maxWidth: 560 }}>
            {bposts.map((b) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: b.is_published ? 'var(--c-w55)' : 'var(--c-w30)', border: '1px solid var(--glass-brd)', opacity: b.is_published ? 1 : 0.6 }}>
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.pinned ? '📌 ' : ''}{b.title}</span>
                  <span className="ktc-label" style={{ fontSize: 11.5 }}>{b.is_published ? t('Published') : t('Draft')}</span>
                </span>
                <button type="button" className="ktc-link" style={{ fontSize: 12 }} onClick={() => void patchBulletin(b, { pinned: !b.pinned })}>{b.pinned ? t('Unpin') : t('Pin')}</button>
                <button type="button" className="ktc-link" style={{ fontSize: 12 }} onClick={() => void patchBulletin(b, { is_published: !b.is_published })}>{b.is_published ? t('Hide') : t('Publish')}</button>
                <button type="button" className="ktc-link" style={{ fontSize: 12, color: 'var(--acc-2)' }} onClick={() => void delBulletin(b.id)}>{t('Delete')}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
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
          >
            {pricingLocked ? t('🔒 Locked — unlock to edit') : t('🔓 Editing · tap to lock')}
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
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 12px', borderRadius: 10,
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
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="ktc-label" style={{ fontSize: 12 }}>₱</span>
                <input className="ktc-input" type="number" step="0.01" min="0" value={r.rate} disabled={pricingLocked}
                  onChange={(e) => setRateVal(r.service, Number(e.target.value))} style={{ width: 110, padding: '7px 10px' }} />
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
                  <b className="ktc-mono" style={{ fontSize: 14 }}>{(s.value * 100).toFixed(0)}%</b>
                  <span className="ktc-chip" title={t('Philippine statutory VAT — changeable only server-side if the law changes')}>{t('statutory · fixed')}</span>
                </span>
              </div>
            ) : (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 12px', borderRadius: 10, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)', opacity: pricingLocked ? 0.65 : 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{s.label || s.key}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="ktc-label" style={{ fontSize: 12 }}>₱</span>
                  <input className="ktc-input" type="number" step="0.01" min="0" value={s.value} disabled={pricingLocked}
                    onChange={(e) => setSettingVal(s.key, Number(e.target.value))} style={{ width: 120, padding: '7px 10px' }} />
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

      <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{t('Terminal tariff (arrastre · wharfage · LoLo · weighing · storage)')}</h2>
        <p className="ktc-label" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
          {t('Per-container rates the Rate Calculator looks up by the customer’s combination — trade (import/export), origin (domestic/foreign) and container size. Import bills arrastre + wharfage + LoLo; export adds weighing. Weighing applies to export only; on export, Maersk/MCC waive LoLo (the line shoulders it). Storage is per container, per day past the Last Free Day. Amounts in ₱, VAT-exclusive (12% VAT is added on the subtotal).')}
        </p>
        <div style={{ display: 'grid', gap: 16 }}>
          {TERM_SERVICES.map(([svc, svcLabel]) => (
            <div key={svc} style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t(svcLabel)}</span>
              <div className="ktc-label" style={{ display: 'flex', gap: 10, fontSize: 11.5, paddingLeft: 2 }}>
                <span style={{ flex: '1 1 150px' }}>{t('Trade · origin')}</span>
                <span style={{ width: 120, textAlign: 'center' }}>{t('20ft')}</span>
                <span style={{ width: 120, textAlign: 'center' }}>{t('40ft')}</span>
              </div>
              {TERM_COMBOS.map(([trade, origin]) => {
                const r20 = termRates.find((x) => x.service === svc && x.trade === trade && x.origin === origin && x.size === '20')
                const r40 = termRates.find((x) => x.service === svc && x.trade === trade && x.origin === origin && x.size === '40')
                return (
                  <div key={`${trade}-${origin}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 10, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
                    <span style={{ flex: '1 1 150px', fontSize: 12.5, fontWeight: 600, textTransform: 'capitalize' }}>{t(trade)} · {t(origin)}</span>
                    {[r20, r40].map((row, idx) => (
                      <span key={idx} style={{ width: 120, display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' }}>
                        <span className="ktc-label" style={{ fontSize: 12 }}>₱</span>
                        <input className="ktc-input" type="number" step="0.01" min="0" value={row?.rate ?? 0}
                          disabled={!row}
                          onChange={(e) => row && setTermVal(row.id, Number(e.target.value))}
                          style={{ width: 92, padding: '7px 10px' }} />
                      </span>
                    ))}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
          <button className="ktc-btn" type="button" disabled={termBusy} onClick={() => void saveTerm()} style={{ width: 'auto', padding: '10px 20px' }}>
            {termBusy ? t('Saving…') : t('Save terminal rates')}
          </button>
          {termMsg && <span className="ktc-label" style={{ fontSize: 13, color: 'var(--acc-2)', fontWeight: 600 }}>{termMsg}</span>}
        </div>
      </div>

      <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{t('Payment details (customer payment page)')}</h2>
        <p className="ktc-label" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
          {t('Bank / GCash details + QR shown when a customer pays online. Leave fields blank to hide them.')}
        </p>
        <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          {payInfo.filter((x) => x.key !== 'qr_path').map((x) => (
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
            <label className="ktc-label" htmlFor="pi-qr" style={{ fontSize: 12 }}>{t('QR code image (bank / GCash)')}{payInfo.some((x) => x.key === 'qr_path' && x.value) ? ' ' + t('— replace current') : ''}</label>
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

      <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{t('Free storage days per shipping line')}</h2>
        <p className="ktc-label" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
          {t("Drives the vessel schedule's")} <strong>{t('Last Free Day')}</strong> {t('(finish discharging + import days). Set for import and export.')}
        </p>
        <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          <div className="ktc-label" style={{ display: 'flex', gap: 10, fontSize: 11.5 }}>
            <span style={{ flex: 1 }}>{t('Shipping line')}</span>
            <span style={{ width: 90, textAlign: 'center' }}>{t('Import days')}</span>
            <span style={{ width: 90, textAlign: 'center' }}>{t('Export days')}</span>
            <span style={{ width: 24 }} />
          </div>
          {shipLines.map((l) => (
            <div key={l.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 10, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{l.name}</span>
              <input className="ktc-input" type="number" min="0" value={l.free_days_import} onChange={(e) => setSl(l.name, 'free_days_import', Number(e.target.value))} style={{ width: 90, padding: '7px 10px', textAlign: 'center' }} />
              <input className="ktc-input" type="number" min="0" value={l.free_days_export} onChange={(e) => setSl(l.name, 'free_days_export', Number(e.target.value))} style={{ width: 90, padding: '7px 10px', textAlign: 'center' }} />
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

      <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
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
                <input className="ktc-input" type="number" step="0.01" min="0" value={m.rate} onChange={(e) => setMr(m.move_type, Number(e.target.value))} style={{ width: 120, padding: '7px 10px' }} />
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

      {isOwner && (
        <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
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
                    {['admin', 'operations', 'cashier', 'checker'].map((r) => (
                      <th key={r} style={{ padding: '6px 14px', fontWeight: 650, textTransform: 'capitalize' }}>{t(r)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    ['view_job_orders', 'View job orders'],
                    ['file_job_orders', 'File JO on behalf of a customer (walk-ins / in-house)'],
                    ['process_job_orders', 'Process job orders (approve / hold / reject / complete)'],
                    ['confirm_xray', 'Confirm X-ray done (checker station)'],
                    ['record_invoice', 'Record Service Invoice no. (= PAID)'],
                    ['review_payments', 'Review payment proofs (confirm / reject)'],
                    ['manage_approvals', 'Account approvals + dashboard'],
                    ['manage_customers', 'Manage customers'],
                    ['manage_consignees', 'Manage consignees'],
                    ['manage_vessel_schedule', 'Vessel schedule'],
                    ['assess_rps', 'Assess RPS (confirm X-ray / port-services moves)'],
                    ['manage_pricing', 'Settings · rates & fees'],
                  ] as const).map(([perm, label]) => (
                    <tr key={perm} style={{ borderTop: '1px solid hsl(var(--line-soft))' }}>
                      <td style={{ padding: '8px 14px 8px 0', lineHeight: 1.4 }}>{t(label)}</td>
                      {['admin', 'operations', 'cashier', 'checker'].map((r) => {
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

      <div className="ktc-glass" style={{ padding: 28 }}>
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
                        : t('Admin')}
                    </span>
                  </div>
                  <div className="ktc-label" style={{ fontSize: 13 }}>{b.email}</div>
                </div>
                {isOwner && !b.is_owner && (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {b.email?.endsWith('@ktc-staff.local') && (
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
      <SystemHealth />
    </AdminShell>
  )
}
