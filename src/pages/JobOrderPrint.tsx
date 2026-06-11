import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface PrintOrder {
  id: string
  jo_number: string | null
  entry_number: string | null
  status: string
  created_at: string
  customer?: { full_name: string | null; customer_code: string | null } | null
  consignee?: { code: string; name: string } | null
  lines?: { container_number: string; service_request: string }[]
  serving?: { service_line: string; serving_no: number; vacated_at: string | null }[]
}

const LINE_LABEL: Record<string, string> = { xray: 'X-ray', dea: 'DEA', oog: 'OOG', other: 'Other' }

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

// Static KTC business details (mirrors the Service Invoice header).
const COMPANY = {
  name: 'KTC CONTAINER TERMINAL CORP.',
  tin: 'VAT Reg. TIN 287-371-154-00000',
  addr: 'Purok 16, Buhisan, Tibungco, Bunawan District, 8000 Davao City, Davao del Sur, Philippines',
}

const LINE = '#2b4a6b' // invoice-style navy rule
const HEADFILL = '#eef2f7'

const PRINT_CSS = `
@media print {
  @page { size: A6 portrait; margin: 6mm; }
  html, body { background: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .no-print { display: none !important; }
  .slip { box-shadow: none !important; margin: 0 !important; width: 100% !important; max-width: none !important; border-radius: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`

export default function JobOrderPrint() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<PrintOrder | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    supabase
      .from('job_orders')
      .select('id, jo_number, entry_number, status, created_at, customer:customers(full_name, customer_code), consignee:consignees(code, name), lines:job_order_lines(container_number, service_request), serving:serving_numbers(service_line, serving_no, vacated_at)')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const o = data as unknown as PrintOrder
          setOrder({ ...o, customer: one(o.customer), consignee: one(o.consignee) })
        }
        setLoading(false)
      })
  }, [id])

  const approved = order && (order.status === 'processing' || order.status === 'completed')
  const processing = !!order && order.status === 'processing'
  const count = order?.lines?.length ?? 0

  return (
    <div style={{ minHeight: '100%', background: 'hsl(220 16% 96%)', padding: 24 }}>
      <style>{PRINT_CSS}</style>

      <div className="no-print" style={{ maxWidth: 420, margin: '0 auto 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <Link to="/job-orders" className="ktc-link" style={{ fontSize: 13 }}>← Back</Link>
        {approved && (
          <button className="ktc-btn" onClick={() => window.print()} style={{ width: 'auto', padding: '9px 18px', fontSize: 13 }}>
            Print / Save as PDF
          </button>
        )}
      </div>

      {loading ? (
        <p className="ktc-label" style={{ textAlign: 'center' }}>Loading…</p>
      ) : !order ? (
        <p className="ktc-label" style={{ textAlign: 'center' }}>Job order not found.</p>
      ) : !approved ? (
        <p className="ktc-label" style={{ textAlign: 'center', maxWidth: 380, margin: '0 auto' }}>
          This job order isn’t approved yet. A printable slip is available once a KTC admin approves it (status “processing”).
        </p>
      ) : (
        <div
          className="slip"
          style={{
            position: 'relative', overflow: 'hidden',
            maxWidth: 420, margin: '0 auto', background: '#fff', color: '#15233a',
            border: `1.5px solid ${LINE}`, padding: 0,
            fontFamily: '-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
            WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
          }}
        >
          {processing && (
            <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', zIndex: 1 }}>
              <span style={{ transform: 'rotate(-32deg)', fontSize: 44, fontWeight: 800, letterSpacing: '0.06em', color: '#f26a21', opacity: 0.12, whiteSpace: 'nowrap' }}>
                ON&nbsp;PROCESS
              </span>
            </div>
          )}

          <div style={{ position: 'relative', zIndex: 2, padding: 12 }}>
            {/* Header: company (left) + JOB ORDER (right) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ display: 'flex', gap: 7 }}>
                <img src="/ktc-logo.png" alt="KTC" style={{ height: 26, marginTop: 1 }} />
                <div style={{ lineHeight: 1.25 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '-0.01em' }}>{COMPANY.name}</div>
                  <div style={{ fontSize: 7, color: '#5a6678' }}>{COMPANY.tin}</div>
                  <div style={{ fontSize: 7, color: '#5a6678', maxWidth: 190 }}>{COMPANY.addr}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right', lineHeight: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: '#5a6678' }}>JOB</div>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '0.04em' }}>ORDER</div>
              </div>
            </div>

            {/* JO No. + Date strip */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 6, borderTop: `1px solid ${LINE}` }}>
              <div style={{ fontSize: 11 }}>
                <span style={{ color: '#5a6678' }}>JO No. </span>
                <b style={{ color: '#d6321e', fontSize: 13, letterSpacing: '0.02em' }}>{order.jo_number ?? '—'}</b>
              </div>
              <div style={{ fontSize: 9, color: '#5a6678', textAlign: 'right' }}>
                Date: <b style={{ color: '#15233a' }}>{new Date(order.created_at).toLocaleDateString()}</b>
                {(order.serving ?? []).filter((s) => !s.vacated_at).map((s) => (
                  <div key={s.service_line} style={{ marginTop: 2 }}>
                    {LINE_LABEL[s.service_line] ?? s.service_line} line: <b style={{ color: '#15233a', fontSize: 10.5 }}>#{s.serving_no}</b>
                  </div>
                ))}
              </div>
            </div>

            {processing && (
              <div style={{ marginTop: 7, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.04em', textAlign: 'center', color: '#b25a16', background: '#fff3e6', border: '1px solid #f4c89a', borderRadius: 4, padding: '4px 6px' }}>
                STILL ON PROCESS — NOT YET COMPLETED
              </div>
            )}

            {/* Customer block (mirrors SOLD TO) */}
            <div style={{ marginTop: 8, border: `1px solid ${LINE}` }}>
              <div style={{ background: HEADFILL, borderBottom: `1px solid ${LINE}`, padding: '3px 7px', fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', color: '#33455f' }}>
                JOB ORDER FOR
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
                <tbody>
                  <InfoRow label="Customer" value={order.customer?.full_name ?? '—'} />
                  <InfoRow label="Customer ID" value={order.customer?.customer_code ?? '—'} />
                  <InfoRow label="Consignee" value={order.consignee ? `${order.consignee.code} – ${order.consignee.name}` : '—'} />
                  <InfoRow label="Entry No." value={order.entry_number || '—'} />
                  <InfoRow label="Status" value={order.status === 'completed' ? 'Completed' : 'Approved'} last />
                </tbody>
              </table>
            </div>

            {/* Line items (mirrors the invoice table; Amount left ready for prices) */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8.5, marginTop: 8, border: `1px solid ${LINE}` }}>
              <thead>
                <tr style={{ background: HEADFILL }}>
                  <Th w="42%">Container No.</Th>
                  <Th w="33%">Nature of Service</Th>
                  <Th w="10%" center>Qty</Th>
                  <Th w="15%" right>Amount</Th>
                </tr>
              </thead>
              <tbody>
                {count === 0 ? (
                  <tr><Td colSpan={4} center muted>No containers</Td></tr>
                ) : (
                  order.lines!.map((l, i) => (
                    <tr key={i}>
                      <Td mono>{l.container_number}</Td>
                      <Td>{l.service_request}</Td>
                      <Td center>1</Td>
                      <Td right muted>—</Td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr style={{ background: HEADFILL }}>
                  <Td colSpan={2} bold>TOTAL CONTAINERS</Td>
                  <Td center bold>{count}</Td>
                  <Td right muted>—</Td>
                </tr>
              </tfoot>
            </table>

            {/* Signature footer (mirrors Prepared by / Received by) */}
            <div style={{ display: 'flex', gap: 14, marginTop: 16 }}>
              <SignLine label="Prepared by" />
              <SignLine label="Received by" />
            </div>

            <div style={{ marginTop: 9, fontSize: 6.5, fontStyle: 'italic', color: '#8893a4', lineHeight: 1.4 }}>
              Please notify KTC within 5 days of any discrepancy; otherwise this job order is considered final and correct.
            </div>
            <div style={{ marginTop: 5, paddingTop: 5, borderTop: `1px solid ${LINE}`, fontSize: 7, color: '#8893a4', textAlign: 'center' }}>
              KTC Online Portal · portal.ktcterminal.com — system-generated job order slip
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <tr style={last ? undefined : { borderBottom: '1px solid #e2e8f0' }}>
      <td style={{ padding: '2.5px 7px', color: '#5a6678', width: '32%', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{label}</td>
      <td style={{ padding: '2.5px 7px', fontWeight: 600 }}>{value}</td>
    </tr>
  )
}

function Th({ children, w, center, right }: { children: ReactNode; w?: string; center?: boolean; right?: boolean }) {
  return (
    <th style={{ width: w, padding: '3px 6px', fontSize: 7.5, fontWeight: 800, letterSpacing: '0.03em', color: '#33455f', textAlign: center ? 'center' : right ? 'right' : 'left', borderRight: '1px solid #cfd9e6', borderBottom: `1px solid ${LINE}` }}>
      {children}
    </th>
  )
}

function Td({ children, center, right, mono, muted, bold, colSpan }: { children: ReactNode; center?: boolean; right?: boolean; mono?: boolean; muted?: boolean; bold?: boolean; colSpan?: number }) {
  return (
    <td colSpan={colSpan} style={{
      padding: '2.5px 6px', borderTop: '1px solid #e2e8f0', borderRight: '1px solid #eef1f5',
      textAlign: center ? 'center' : right ? 'right' : 'left',
      fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
      fontWeight: bold ? 800 : mono ? 600 : undefined,
      color: muted ? '#9aa6b6' : undefined,
    }}>
      {children}
    </td>
  )
}

function SignLine({ label }: { label: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ borderTop: '1px solid #15233a', marginTop: 14 }} />
      <div style={{ fontSize: 7.5, color: '#5a6678', marginTop: 2 }}>{label}</div>
    </div>
  )
}
