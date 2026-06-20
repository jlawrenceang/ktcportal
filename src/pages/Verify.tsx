import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { CheckCircleIcon, AlertTriangleIcon } from '../components/icons'

// Public slip-verification page (the slip QR points here). No login: it calls
// the anon `verify_job_order` RPC and confirms, LIVE against the KTC database,
// whether a Job Order is paid + its status. The printed text is cosmetic — this
// scan is the proof, so an edited image can't fake a paid invoice. The JO number
// + container numbers shown here are the cross-check against a copied QR.
type V = { jo_number: string | null; status: string; payment_status: string | null; rps_status: string | null; rps_payment_status: string | null; completed_at: string | null; consignee: string | null; containers: string[] | null }

const STATUS_LABEL: Record<string, string> = {
  completed: 'Completed', processing: 'In process', on_hold: 'On hold',
  submitted: 'Filed', held: 'Draft', rejected: 'Rejected', cancelled: 'Cancelled',
}

export default function Verify() {
  const { id } = useParams<{ id: string }>()
  const [phase, setPhase] = useState<'loading' | 'found' | 'notfound'>('loading')
  const [v, setV] = useState<V | null>(null)

  useEffect(() => {
    if (!id) { setPhase('notfound'); return }
    void supabase.rpc('verify_job_order', { p_id: id }).then(({ data, error }) => {
      const row = (data as V[] | null)?.[0] ?? null
      if (error || !row) { setPhase('notfound'); return }
      setV(row); setPhase('found')
    })
  }, [id])

  // Fully paid = base confirmed AND (no RPS due OR RPS confirmed).
  const paid = v?.payment_status === 'confirmed' && (v?.rps_status !== 'needed' || v?.rps_payment_status === 'confirmed')
  const headTone = phase === 'notfound' ? { bg: '#fdecea', brd: '#f3b6ad', ink: '#a31708' }
    : paid ? { bg: '#e9f7ee', brd: '#b3e3c4', ink: '#13682f' }
    : { bg: '#fff6e6', brd: '#f4c89a', ink: '#a35a16' }

  return (
    <div style={{ minHeight: '100%', background: 'hsl(220 16% 96%)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 430, background: '#fff', borderRadius: 16, border: '1px solid #d9e0ea', boxShadow: '0 10px 40px rgb(0 0 0 / 0.08)', overflow: 'hidden', fontFamily: '-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif', color: '#15233a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '16px 20px', borderBottom: '1px solid #eef1f5' }}>
          <img src="/ktc-logo.png" alt="KTC" style={{ height: 30 }} />
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>KTC Online Portal</div>
            <div style={{ fontSize: 11, color: '#5a6678' }}>Job Order verification</div>
          </div>
        </div>

        <div style={{ padding: 20 }}>
          {phase === 'loading' ? (
            <p style={{ textAlign: 'center', color: '#5a6678', fontSize: 14 }}>Verifying…</p>
          ) : phase === 'notfound' ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 12px', borderRadius: 12, background: headTone.bg, border: `1px solid ${headTone.brd}`, color: headTone.ink, fontWeight: 800, fontSize: 18, letterSpacing: '0.02em' }}>
                <AlertTriangleIcon size={18} /> NOT FOUND
              </div>
              <p style={{ textAlign: 'center', fontSize: 13, color: '#5a6678', marginTop: 14 }}>
                This code doesn’t match any Job Order in the KTC system. The slip may be invalid.
              </p>
            </>
          ) : (
            <>
              {/* Headline: PAID is the cashier-clearance signal */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '16px 12px', borderRadius: 12, background: headTone.bg, border: `1px solid ${headTone.brd}`, color: headTone.ink, fontWeight: 800, fontSize: 24, letterSpacing: '0.04em' }}>
                {paid ? <><CheckCircleIcon size={22} /> PAID</> : <><AlertTriangleIcon size={22} /> NOT PAID</>}
              </div>
              <p style={{ textAlign: 'center', fontSize: 13, color: '#5a6678', marginTop: 8 }}>
                Order status: <b style={{ color: '#15233a' }}>{STATUS_LABEL[v!.status] ?? v!.status}</b>
                {v!.status === 'completed' ? '' : !paid ? ' · not cleared for release' : ''}
              </p>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, marginTop: 14 }}>
                <tbody>
                  <Row k="JO Number" val={v!.jo_number ?? '—'} />
                  <Row k="Consignee" val={v!.consignee ?? '—'} />
                  <Row k="Containers" val={(v!.containers ?? []).length ? v!.containers!.join(', ') : '—'} mono />
                  {v!.completed_at && <Row k="Completed" val={new Date(v!.completed_at).toLocaleString()} />}
                </tbody>
              </table>

              <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 10, background: '#f3f6fb', border: '1px solid #dde6f1', fontSize: 11.5, color: '#46566c', lineHeight: 1.5 }}>
                <b>Check this against the paper.</b> Match the JO number and container numbers above to the physical slip and the actual containers. Genuine KTC verification appears only at <b>portal.ktcterminal.com</b>.
              </div>
              <p style={{ fontSize: 11, color: '#8893a4', marginTop: 12, textAlign: 'center' }}>
                Verified live against the KTC database
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ k, val, mono }: { k: string; val: string; mono?: boolean }) {
  return (
    <tr style={{ borderBottom: '1px solid #eef1f5' }}>
      <td style={{ padding: '7px 0', color: '#5a6678', width: '34%', verticalAlign: 'top' }}>{k}</td>
      <td style={{ padding: '7px 0', fontWeight: 600, fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined }}>{val}</td>
    </tr>
  )
}
