import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'

// Owner-only tool: search any account and fire a real test push to their
// subscribed devices (via the owner_send_test_push RPC, migration 0121).
interface UserRow {
  user_id: string
  full_name: string | null
  email: string | null
  is_owner: boolean
  is_admin: boolean
  staff_role: string | null
}

function roleLabel(u: UserRow): string {
  return u.is_owner ? 'Owner' : u.staff_role ? u.staff_role.toUpperCase() : u.is_admin ? 'Admin' : 'Customer'
}

export default function TestPushCard() {
  const { t } = useT()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<UserRow[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<UserRow | null>(null)
  const [title, setTitle] = useState('KTC test 🔔')
  const [body, setBody] = useState('This is a test notification from KTC Online Portal.')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function search(v: string) {
    setQ(v)
    const s = v.replace(/[,()%*]/g, ' ').trim() // sanitize for .or()
    if (s.length < 2) { setResults([]); return }
    setSearching(true); setErr(null)
    const { data, error } = await supabase
      .from('customers')
      .select('user_id, full_name, email, is_owner, is_admin, staff_role')
      .or(`full_name.ilike.*${s}*,email.ilike.*${s}*`)
      .limit(8)
    setSearching(false)
    if (error) { setErr(error.message); return }
    setResults((data ?? []) as UserRow[])
  }

  async function sendTest() {
    if (!selected) return
    setBusy(true); setErr(null); setMsg(null)
    const { data, error } = await supabase.rpc('owner_send_test_push', {
      p_user_id: selected.user_id,
      p_title: title.trim() || 'KTC test 🔔',
      p_body: body.trim(),
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    const n = typeof data === 'number' ? data : 0
    setMsg(n > 0
      ? t('Sent to {n} device(s) — it should arrive shortly.', { n })
      : t('This user has no notification devices yet — they haven’t enabled notifications anywhere.'))
  }

  return (
    <div className="ktc-glass" style={{ padding: 18, marginBottom: 18 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{t('Test push notifications')}</h2>
      <p className="ktc-sub" style={{ margin: '2px 0 12px', fontSize: 12 }}>
        {t('Send a real test notification to any account’s subscribed devices to confirm delivery.')}
      </p>

      {!selected ? (
        <div style={{ maxWidth: 420 }}>
          <input className="ktc-input ktc-input--compact" placeholder={t('Search name or email…')}
            value={q} onChange={(e) => void search(e.target.value)} style={{ width: '100%' }} />
          {searching && <div className="ktc-label" style={{ fontSize: 12, marginTop: 6 }}>{t('Searching…')}</div>}
          {results.length > 0 && (
            <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
              {results.map((u) => (
                <button key={u.user_id} type="button" className="ktc-menu-setting"
                  onClick={() => { setSelected(u); setResults([]); setQ(''); setMsg(null) }}>
                  <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.full_name || u.email || u.user_id}
                  </span>
                  <span className="ktc-chip" style={{ fontSize: 10.5 }}>{t(roleLabel(u))}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.full_name || selected.email}
            </span>
            <span className="ktc-chip" style={{ fontSize: 10.5 }}>{t(roleLabel(selected))}</span>
            <button className="ktc-link" type="button" onClick={() => { setSelected(null); setMsg(null) }} style={{ fontSize: 12.5 }}>{t('Change')}</button>
          </div>
          <input className="ktc-input ktc-input--compact" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('Title')} />
          <input className="ktc-input ktc-input--compact" value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('Message')} />
          <button className="ktc-btn ktc-btn--sm" type="button" disabled={busy} onClick={() => void sendTest()}
            style={{ width: 'auto', padding: '8px 16px', fontSize: 13, justifySelf: 'start' }}>
            {busy ? t('Sending…') : t('Send test notification')}
          </button>
        </div>
      )}

      {msg && <div className="ktc-label" style={{ marginTop: 10, fontSize: 12.5 }}>{msg}</div>}
      {err && <div style={{ marginTop: 10, color: 'var(--acc-2)', fontSize: 12.5 }}>{err}</div>}
    </div>
  )
}
