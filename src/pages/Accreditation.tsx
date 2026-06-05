import { useEffect, useState } from 'react'
import Shell from '../components/Shell'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import type { AccreditationStatus, Consignee } from '../lib/types'

const STATUS_STYLE: Record<AccreditationStatus, { bg: string; fg: string; label: string }> = {
  pending: { bg: 'hsl(40 90% 94%)', fg: 'hsl(35 80% 38%)', label: 'Pending' },
  approved: { bg: 'hsl(150 50% 93%)', fg: 'hsl(150 60% 30%)', label: 'Approved' },
  rejected: { bg: 'hsl(0 70% 95%)', fg: 'hsl(0 65% 45%)', label: 'Rejected' },
}

export default function Accreditation() {
  const { broker } = useBroker()
  const [consignees, setConsignees] = useState<Consignee[]>([])
  const [statusByConsignee, setStatusByConsignee] = useState<Record<string, AccreditationStatus>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requesting, setRequesting] = useState<string | null>(null)

  async function load() {
    const [{ data: cons }, { data: accs }] = await Promise.all([
      supabase.from('consignees').select('id, code, name').order('code'),
      supabase.from('accreditations').select('consignee_id, status'),
    ])
    setConsignees((cons ?? []) as Consignee[])
    const map: Record<string, AccreditationStatus> = {}
    for (const a of (accs ?? []) as { consignee_id: string; status: AccreditationStatus }[]) {
      map[a.consignee_id] = a.status
    }
    setStatusByConsignee(map)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  async function request(consigneeId: string) {
    if (!broker) return
    setRequesting(consigneeId)
    setError(null)
    const { error } = await supabase
      .from('accreditations')
      .insert({ broker_id: broker.id, consignee_id: consigneeId, status: 'pending' })
    setRequesting(null)
    if (error) {
      setError(error.message)
      return
    }
    setStatusByConsignee((m) => ({ ...m, [consigneeId]: 'pending' }))
  }

  return (
    <Shell>
      <div className="ktc-glass" style={{ padding: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Accreditation</h1>
        <p className="ktc-label" style={{ marginTop: 6, marginBottom: 22 }}>
          Request the consignees you handle. KTC approves them, after which they appear in your Job Order form.
        </p>

        {error && <div style={{ color: 'var(--acc-2)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {loading ? (
          <span className="ktc-label">Loading…</span>
        ) : consignees.length === 0 ? (
          <div className="ktc-label" style={{ fontSize: 14 }}>
            No consignees are available yet — the KTC master list hasn't been uploaded. Check back soon.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {consignees.map((c) => {
              const status = statusByConsignee[c.id]
              return (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 14px',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.55)',
                    border: '1px solid var(--glass-brd)',
                  }}
                >
                  <span style={{ fontSize: 14 }}>
                    <b>{c.code}</b> – {c.name}
                  </span>
                  {status ? (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: 999,
                        background: STATUS_STYLE[status].bg,
                        color: STATUS_STYLE[status].fg,
                      }}
                    >
                      {STATUS_STYLE[status].label}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="ktc-link"
                      onClick={() => request(c.id)}
                      disabled={requesting === c.id}
                    >
                      {requesting === c.id ? 'Requesting…' : 'Request'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Shell>
  )
}
