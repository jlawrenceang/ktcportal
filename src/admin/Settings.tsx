import { useEffect, useState, type FormEvent } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import type { Broker } from '../lib/types'

export default function Settings() {
  const { broker: me } = useBroker()
  const isOwner = !!me?.is_owner
  const [staff, setStaff] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [suUser, setSuUser] = useState('')
  const [suPass, setSuPass] = useState('')
  const [suName, setSuName] = useState('')
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
      .or('is_admin.eq.true,is_owner.eq.true')
      .order('is_owner', { ascending: false })
      .order('email', { ascending: true })
    if (error) { setError(error.message); setLoading(false); return }
    setStaff((data ?? []) as Broker[])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

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
    setBusy(true); setError(null); setNotice(null)
    const { error } = await supabase.rpc('create_staff', { p_username: u, p_password: suPass, p_full_name: suName.trim() })
    setBusy(false)
    if (error) { setError(error.message); return }
    setSuUser(''); setSuPass(''); setSuName('')
    setNotice(`Staff account created. They sign in with username "${u}" and the password you set.`)
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
    const { error } = await supabase.from('customers').update({ is_admin: false }).eq('id', b.id)
    setBusy(false)
    if (error) return setError(error.message)
    setNotice(`Admin access revoked from ${b.email}.`)
    await load()
  }

  return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 28, marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Staff &amp; access</h1>
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
                <input id="suPass" className="ktc-input" type="text" required minLength={6} value={suPass} onChange={(e) => setSuPass(e.target.value)} style={{ width: 160 }} />
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
                      {b.is_owner ? 'Owner' : 'Admin'}
                    </span>
                  </div>
                  <div className="ktc-label" style={{ fontSize: 13 }}>{b.email}</div>
                </div>
                {isOwner && !b.is_owner && (
                  <button className="ktc-link" disabled={busy} onClick={() => revoke(b)} style={{ fontSize: 13, fontWeight: 600 }}>
                    Revoke admin
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
