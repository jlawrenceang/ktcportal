import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'

// Settings → System health (G12): cron job runs, outbound calls (emails /
// BOC mirror), and client errors — the system_health() RPC reconciles
// pg_net responses and snapshots everything in one call. Loaded on demand.

interface Health {
  jobs: { name: string; schedule: string; last_run: string | null; status: string | null; message: string | null }[]
  outbound_failures: { kind: string; label: string; status: number | null; error: string | null; at: string }[]
  outbound_24h: number
  client_errors_24h: number
  client_errors: { message: string; path: string | null; at: string }[]
  /** Owner-only (admins receive an empty list). */
  security_events: { kind: string; actor: string | null; detail: Record<string, unknown>; at: string }[]
}

const SECURITY_LABEL: Record<string, string> = {
  protected_field_attempt: '🚨 Blocked privilege-escalation attempt',
  role_gate_changed: 'Role gate changed',
}

const JOB_HINT: Record<string, string> = {
  'expire-unverified-brokers': 'rejects pending accounts with no ID after 48h',
  'boc-mirror-hourly': 'snapshots job orders to the BOC Google Sheet',
  'archive-done-orders-weekly': 'archives completed + paid orders (Mon 00:30 PH)',
  'requeue-carryovers-weekly': 'carry-overs to the front of the new week (Mon 00:15 PH)',
  'ops-watchdog-hourly': 'this monitor — emails the owner on failures',
}

const ago = (iso: string | null) => {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 60 / 24)}d ago`
}

export default function SystemHealth() {
  const { t } = useT()
  const [health, setHealth] = useState<Health | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error: rpcErr } = await supabase.rpc('system_health')
    setLoading(false)
    if (rpcErr) { setError(rpcErr.message); return }
    setHealth(data as unknown as Health)
  }

  return (
    <div className="ktc-glass" style={{ padding: 28, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{t('System health')}</h2>
          <p className="ktc-label" style={{ margin: 0, fontSize: 12.5 }}>
            {t('Background jobs, outgoing emails / BOC mirror calls, and client errors. The hourly watchdog emails the owner on failures.')}
          </p>
        </div>
        <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => void load()} disabled={loading}>
          {loading ? t('Checking…') : health ? t('↻ Re-check') : t('Run health check')}
        </button>
      </div>

      {error && <p style={{ color: 'var(--acc-2)', fontSize: 13, marginTop: 12 }}>{error}</p>}

      {health && (
        <div style={{ display: 'grid', gap: 18, marginTop: 18 }}>
          {/* Cron jobs */}
          <div>
            <h3 className="ktc-label" style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('Scheduled jobs')}</h3>
            <div style={{ display: 'grid', gap: 6 }}>
              {health.jobs.map((j) => (
                <div key={j.name} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 13, padding: '8px 12px', borderRadius: 9, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)', overflowWrap: 'anywhere' }}>
                  <span className={`ktc-chip ${j.status === 'succeeded' ? 'ktc-chip--success' : j.status === 'failed' ? 'ktc-chip--danger' : ''}`}>
                    {j.status ? t(j.status) : t('no runs yet')}
                  </span>
                  <b className="ktc-mono" style={{ fontSize: 12.5 }}>{j.name}</b>
                  <span className="ktc-label" style={{ fontSize: 12 }}>{JOB_HINT[j.name] ? t(JOB_HINT[j.name]) : j.schedule}</span>
                  <span className="ktc-label" style={{ fontSize: 12, marginLeft: 'auto' }} title={j.last_run ? new Date(j.last_run).toLocaleString() : undefined}>
                    {j.last_run ? ago(j.last_run) : t('never')}
                  </span>
                  {j.status === 'failed' && j.message && (
                    <span style={{ flexBasis: '100%', fontSize: 12, color: 'var(--acc-2)' }}>{j.message}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Outbound */}
          <div>
            <h3 className="ktc-label" style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('Outgoing calls — {n} in 24h', { n: health.outbound_24h })} · {health.outbound_failures.length === 0 ? t('no failures this week 🎉') : t('{n} recent failure(s)', { n: health.outbound_failures.length })}
            </h3>
            {health.outbound_failures.length > 0 && (
              <div style={{ display: 'grid', gap: 6 }}>
                {health.outbound_failures.map((f, i) => (
                  <div key={i} style={{ fontSize: 12.5, padding: '8px 12px', borderRadius: 9, background: 'var(--c-h0-75-97)', border: '1px solid var(--c-h0-70-88)', overflowWrap: 'anywhere' }}>
                    <b>{f.kind}</b> · {f.label} — {f.status ? t('HTTP {status}', { status: f.status }) : f.error}{' '}
                    <span className="ktc-label" style={{ fontSize: 11.5 }}>{new Date(f.at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Security events (owner only — empty for admins) */}
          {health.security_events.length > 0 && (
            <div>
              <h3 className="ktc-label" style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('Security events')}
              </h3>
              <div style={{ display: 'grid', gap: 6 }}>
                {health.security_events.map((s, i) => (
                  <div key={i} style={{
                    fontSize: 12.5, padding: '8px 12px', borderRadius: 9, overflowWrap: 'anywhere',
                    background: s.kind === 'protected_field_attempt' ? 'var(--c-h0-75-97)' : 'var(--c-w55)',
                    border: s.kind === 'protected_field_attempt' ? '1px solid var(--c-h0-70-88)' : '1px solid var(--glass-brd)',
                  }}>
                    <b>{SECURITY_LABEL[s.kind] ? t(SECURITY_LABEL[s.kind]) : s.kind}</b>
                    <span className="ktc-mono" style={{ fontSize: 11.5, marginLeft: 8 }}>{JSON.stringify(s.detail)}</span>
                    <span className="ktc-label" style={{ fontSize: 11.5, marginLeft: 8 }}>
                      {s.actor ? t('actor {id}…', { id: s.actor.slice(0, 8) }) : t('system')} · {new Date(s.at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Client errors */}
          <div>
            <h3 className="ktc-label" style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('Client errors — {n} in 24h', { n: health.client_errors_24h })}
            </h3>
            {health.client_errors.length === 0 ? (
              <span className="ktc-label" style={{ fontSize: 13 }}>{t('None recorded. 🎉')}</span>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {health.client_errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 12.5, padding: '8px 12px', borderRadius: 9, background: 'var(--c-w55)', border: '1px solid var(--glass-brd)', overflowWrap: 'anywhere' }}>
                    <span className="ktc-mono" style={{ fontSize: 12 }}>{e.message}</span>
                    <span className="ktc-label" style={{ fontSize: 11.5, marginLeft: 8 }}>
                      {e.path ?? ''} · {new Date(e.at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
