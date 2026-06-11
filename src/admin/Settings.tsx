import { useEffect, useState, type FormEvent } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import type { Broker } from '../lib/types'
import { passwordIssue, PASSWORD_HINT } from '../lib/validation'

export default function Settings() {
  const { broker: me } = useBroker()
  const isOwner = !!me?.is_owner
  const [staff, setStaff] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [suUser, setSuUser] = useState('')
  const [suPass, setSuPass] = useState('')
  const [suName, setSuName] = useState('')
  const [suRole, setSuRole] = useState<'admin' | 'cashier' | 'checker'>('admin')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Pricing (service rates + flat fees + VAT) — admin-editable, read-only to others.
  type Rate = { service: string; rate: number; unit: string; vatable: boolean; active: boolean }
  type Setting = { key: string; value: number; label: string | null }
  const [rates, setRates] = useState<Rate[]>([])
  const [settings, setSettings] = useState<Setting[]>([])
  const [pricingBusy, setPricingBusy] = useState(false)
  const [pricingMsg, setPricingMsg] = useState<string | null>(null)

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
    setPayMsg(error ? error.message : '✓ Payment details saved.')
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
    setGatesMsg(error ? error.message : '✓ Gates saved. Staff see the change on their next page load.')
  }

  async function loadPricing() {
    const [{ data: r }, { data: s }] = await Promise.all([
      supabase.from('service_rates').select('service, rate, unit, vatable, active').order('service'),
      supabase.from('pricing_settings').select('key, value, label').order('key'),
    ])
    setRates((r ?? []) as Rate[])
    setSettings((s ?? []) as Setting[])
  }
  useEffect(() => { void loadPricing() }, [])

  function setRateVal(service: string, rate: number) {
    setRates((rs) => rs.map((x) => (x.service === service ? { ...x, rate } : x)))
  }
  function setSettingVal(key: string, value: number) {
    setSettings((ss) => ss.map((x) => (x.key === key ? { ...x, value } : x)))
  }
  async function savePricing() {
    setPricingBusy(true); setPricingMsg(null)
    const updatedAt = new Date().toISOString()
    const { error: e1 } = await supabase.from('service_rates').upsert(rates.map((r) => ({ ...r, updated_at: updatedAt })), { onConflict: 'service' })
    const { error: e2 } = await supabase.from('pricing_settings').upsert(settings.map((s) => ({ ...s, updated_at: updatedAt })), { onConflict: 'key' })
    setPricingBusy(false)
    if (e1 || e2) { setPricingMsg((e1 || e2)!.message); return }
    setPricingMsg('✓ Pricing saved.')
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
    setNotice(`Staff account created (${suRole}). They sign in with username "${u}" and the password you set.`)
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
      setError(`No account found for "${target}". Ask them to sign up first, then grant access here.`)
      return
    }
    setEmail(''); setNotice(`Admin access granted to ${target}.`)
    await load()
  }

  async function revoke(b: Broker) {
    if (b.is_owner) return
    setBusy(true); setError(null); setNotice(null)
    const { error } = await supabase.from('customers').update({ is_admin: false, staff_role: null }).eq('id', b.id)
    setBusy(false)
    if (error) return setError(error.message)
    setNotice(`Staff access revoked from ${b.email}.`)
    await load()
  }

  return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
        <h1 className="ktc-title">Staff &amp; access</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 20 }}>
          Internal KTC staff with admin access. Managed separately from brokers.
          {isOwner ? '' : ' Only the owner can change access.'}
        </p>

        {isOwner ? (
          <>
            <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600 }}>Create staff account</h2>
            <form onSubmit={createStaff} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <label className="ktc-label" htmlFor="suName">Full name</label>
                <input id="suName" className="ktc-input" required value={suName} onChange={(e) => setSuName(e.target.value)} style={{ width: 200 }} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label className="ktc-label" htmlFor="suUser">Username</label>
                <input id="suUser" className="ktc-input" required minLength={3} value={suUser} onChange={(e) => setSuUser(e.target.value)} placeholder="jdelacruz" style={{ width: 170 }} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label className="ktc-label" htmlFor="suPass">Password</label>
                <input id="suPass" className="ktc-input" type="text" required minLength={8} value={suPass} onChange={(e) => setSuPass(e.target.value)} style={{ width: 160 }} title={PASSWORD_HINT} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label className="ktc-label" htmlFor="suRole">Role</label>
                <select id="suRole" className="ktc-input" value={suRole} onChange={(e) => setSuRole(e.target.value as 'admin' | 'cashier' | 'checker')} style={{ width: 130 }}>
                  <option value="admin">Admin</option>
                  <option value="cashier">Cashier</option>
                  <option value="checker">Checker</option>
                </select>
              </div>
              <button className="ktc-btn" type="submit" disabled={busy} style={{ width: 'auto', padding: '11px 18px' }}>Create staff</button>
            </form>
            <p className="ktc-label" style={{ fontSize: 12, marginTop: 10, opacity: 0.8 }}>
              No email needed — hand them the username + password. They sign in at the login page with the username.
            </p>

            <div style={{ height: 1, background: 'hsl(var(--line-soft))', margin: '18px 0' }} />

            <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600 }}>Or grant admin to an existing account</h2>
            <form onSubmit={grant} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <label className="ktc-label" htmlFor="email">Email of a signed-up user</label>
                <input id="email" className="ktc-input" type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="someone@email.com" style={{ width: 280 }} />
              </div>
              <button className="ktc-btn" type="submit" disabled={busy} style={{ width: 'auto', padding: '11px 18px' }}>Grant access</button>
            </form>
          </>
        ) : (
          <p className="ktc-label" style={{ fontSize: 13 }}>Only the owner can add or change staff access.</p>
        )}

        {notice && <div className="ktc-label" style={{ marginTop: 10, fontSize: 13 }}>{notice}</div>}
        {error && <div style={{ marginTop: 10, color: 'var(--acc-2)', fontSize: 13 }}>{error}</div>}
      </div>

      <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>Service rates &amp; fees</h2>
        <p className="ktc-label" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
          Used for the online-payment computation (the official Service Invoice + receipt come from the ERP). Amounts in ₱. Editable by admins.
        </p>

        <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          {rates.map((r) => (
            <div key={r.service} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.55)', border: '1px solid var(--glass-brd)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{r.service}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="ktc-label" style={{ fontSize: 12 }}>₱</span>
                <input className="ktc-input" type="number" step="0.01" min="0" value={r.rate}
                  onChange={(e) => setRateVal(r.service, Number(e.target.value))} style={{ width: 120, padding: '7px 10px' }} />
                <span className="ktc-label" style={{ fontSize: 11, width: 86 }}>{r.unit.replace('per_', '/ ')}</span>
              </span>
            </div>
          ))}
        </div>

        <div style={{ height: 1, background: 'hsl(var(--line-soft))', margin: '16px 0' }} />

        <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          {settings.map((s) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.55)', border: '1px solid var(--glass-brd)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{s.label || s.key}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="ktc-label" style={{ fontSize: 12 }}>{s.key === 'vat_rate' ? '×' : '₱'}</span>
                <input className="ktc-input" type="number" step={s.key === 'vat_rate' ? '0.01' : '0.01'} min="0" value={s.value}
                  onChange={(e) => setSettingVal(s.key, Number(e.target.value))} style={{ width: 120, padding: '7px 10px' }} />
                {s.key === 'vat_rate' && <span className="ktc-label" style={{ fontSize: 11, width: 86 }}>= {(s.value * 100).toFixed(0)}%</span>}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
          <button className="ktc-btn" type="button" disabled={pricingBusy} onClick={() => void savePricing()} style={{ width: 'auto', padding: '10px 20px' }}>
            {pricingBusy ? 'Saving…' : 'Save pricing'}
          </button>
          {pricingMsg && <span className="ktc-label" style={{ fontSize: 13, color: 'var(--acc-2)', fontWeight: 600 }}>{pricingMsg}</span>}
        </div>
      </div>

      <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>Payment details (customer payment page)</h2>
        <p className="ktc-label" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
          Bank / GCash details + QR shown when a customer pays online. Leave fields blank to hide them.
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
            <label className="ktc-label" htmlFor="pi-qr" style={{ fontSize: 12 }}>QR code image (bank / GCash){payInfo.some((x) => x.key === 'qr_path' && x.value) ? ' — replace current' : ''}</label>
            <input id="pi-qr" className="ktc-input" type="file" accept="image/*" onChange={(e) => setQrFile(e.target.files?.[0] ?? null)} style={{ padding: '9px 11px' }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
          <button className="ktc-btn" type="button" disabled={payBusy} onClick={() => void savePayInfo()} style={{ width: 'auto', padding: '10px 20px' }}>
            {payBusy ? 'Saving…' : 'Save payment details'}
          </button>
          {payMsg && <span className="ktc-label" style={{ fontSize: 13, fontWeight: 600 }}>{payMsg}</span>}
        </div>
      </div>

      {isOwner && (
        <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>Roles &amp; gates</h2>
          <p className="ktc-label" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
            What each staff role may do. Owner-only — enforced server-side (RLS + RPCs), the UI just mirrors it.
          </p>
          {gates.length === 0 ? (
            <span className="ktc-label">Loading…</span>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 460 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px 14px 6px 0', fontWeight: 600 }} className="ktc-label">Gate</th>
                    {['admin', 'cashier', 'checker'].map((r) => (
                      <th key={r} style={{ padding: '6px 14px', fontWeight: 650, textTransform: 'capitalize' }}>{r}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    ['view_job_orders', 'View job orders'],
                    ['process_job_orders', 'Process job orders (approve / hold / reject / complete)'],
                    ['confirm_xray', 'Confirm X-ray done (checker station)'],
                    ['record_invoice', 'Record Service Invoice no. (= PAID)'],
                    ['review_payments', 'Review payment proofs (confirm / reject)'],
                    ['manage_approvals', 'Account approvals + dashboard'],
                    ['manage_customers', 'Manage customers'],
                    ['manage_consignees', 'Manage consignees'],
                    ['manage_pricing', 'Settings · rates & fees'],
                  ] as const).map(([perm, label]) => (
                    <tr key={perm} style={{ borderTop: '1px solid hsl(var(--line-soft))' }}>
                      <td style={{ padding: '8px 14px 8px 0', lineHeight: 1.4 }}>{label}</td>
                      {['admin', 'cashier', 'checker'].map((r) => {
                        const g = gates.find((x) => x.role === r && x.permission === perm)
                        return (
                          <td key={r} style={{ textAlign: 'center', padding: '8px 14px' }}>
                            <input
                              type="checkbox"
                              checked={g?.allowed ?? false}
                              onChange={() => toggleGate(r, perm)}
                              aria-label={`${r}: ${label}`}
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
              {gatesBusy ? 'Saving…' : 'Save gates'}
            </button>
            {gatesMsg && <span className="ktc-label" style={{ fontSize: 13, fontWeight: 600 }}>{gatesMsg}</span>}
          </div>
        </div>
      )}

      <div className="ktc-glass" style={{ padding: 28 }}>
        <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 600 }}>Current staff</h2>
        {loading ? <span className="ktc-label">Loading…</span> : staff.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>No staff yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {staff.map((b) => (
              <div key={b.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.55)', border: '1px solid var(--glass-brd)',
              }}>
                <div style={{ fontSize: 14 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <b>{b.full_name || b.email}</b>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, color: '#fff', background: 'linear-gradient(135deg, var(--acc), var(--acc-2))' }}>
                      {b.is_owner ? 'Owner'
                        : b.staff_role === 'cashier' ? 'Cashier'
                        : b.staff_role === 'checker' ? 'Checker'
                        : 'Admin'}
                    </span>
                  </div>
                  <div className="ktc-label" style={{ fontSize: 13 }}>{b.email}</div>
                </div>
                {isOwner && !b.is_owner && (
                  <button className="ktc-link" disabled={busy} onClick={() => revoke(b)} style={{ fontSize: 13, fontWeight: 600 }}>
                    Revoke access
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  )
}
