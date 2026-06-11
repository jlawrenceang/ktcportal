import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Settings → System health (G12): cron job runs, outbound calls (emails /
// BOC mirror), and client errors — the system_health() RPC reconciles
// pg_net responses and snapshots everything in one call. Loaded on demand.

interface Health {
  jobs: { name: string; schedule: string; last_run: string | null; status: string | null; message: string | null }[]
  outbound_failures: { kind: string; label: string; status: number | null; error: string | null; at: string }[]
  outbound_24h: number
  client_errors_24h: number
  client_errors: { message: string; path: string | null; at: string }[]
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
          <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>System health</h2>
          <p className="ktc-label" style={{ margin: 0, fontSize: 12.5 }}>
            Background jobs, outgoing emails / BOC mirror calls, and client errors. The hourly watchdog emails the owner on failures.
          </p>
        </div>
        <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={() => void load()} disabled={loading}>
          {loading ? 'Checking…' : health ? '↻ Re-check' : 'Run health check'}
        </button>
      </div>

      {error && <p style={{ color: 'var(--acc-2)', fontSize: 13, marginTop: 12 }}>{error}</p>}

      {health && (
        <div style={{ display: 'grid', gap: 18, marginTop: 18 }}>
          {/* Cron jobs */}
          <div>
            <h3 className="ktc-label" style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scheduled jobs</h3>
            <div style={{ display: 'grid', gap: 6 }}>
              {health.jobs.map((j) => (
                <div key={j.name} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 13, padding: '8px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.55)', border: '1px solid var(--glass-brd)' }}>
                  <span className={`ktc-chip ${j.status === 'succeeded' ? 'ktc-chip--success' : j.status === 'failed' ? 'ktc-chip--danger' : ''}`}>
                    {j.status ?? 'no runs yet'}
                  </span>
                  <b className="ktc-mono" style={{ fontSize: 12.5 }}>{j.name}</b>
                  <span className="ktc-label" style={{ fontSize: 12 }}>{JOB_HINT[j.name] ?? j.schedule}</span>
                  <span className="ktc-label" style={{ fontSize: 12, marginLeft: 'auto' }} title={j.last_run ? new Date(j.last_run).toLocaleString() : undefined}>
                    {ago(j.last_run)}
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
              Outgoing calls — {health.outbound_24h} in 24h · {health.outbound_failures.length === 0 ? 'no failures this week 🎉' : `${health.outbound_failures.length} recent failure${health.outbound_failures.length === 1 ? '' : 's'}`}
            </h3>
            {health.outbound_failures.length > 0 && (
              <div style={{ display: 'grid', gap: 6 }}>
                {health.outbound_failures.map((f, i) => (
                  <div key={i} style={{ fontSize: 12.5, padding: '8px 12px', borderRadius: 9, background: 'hsl(0 75% 97%)', border: '1px solid hsl(0 70% 88%)' }}>
                    <b>{f.kind}</b> · {f.label} — {f.status ? `HTTP ${f.status}` : f.error}{' '}
                    <span className="ktc-label" style={{ fontSize: 11.5 }}>{new Date(f.at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Client errors */}
          <div>
            <h3 className="ktc-label" style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Client errors — {health.client_errors_24h} in 24h
            </h3>
            {health.client_errors.length === 0 ? (
              <span className="ktc-label" style={{ fontSize: 13 }}>None recorded. 🎉</span>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {health.client_errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 12.5, padding: '8px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.55)', border: '1px solid var(--glass-brd)' }}>
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
