import { useState } from 'react'
import AdminShell from './AdminShell'
import { MarkdownBody } from '../components/MarkdownDoc'
import ManualFlow, { type FlowStep, type FlowPhase } from '../components/ManualFlow'
import ProtectedDoc from '../components/ProtectedDoc'
import { usePermissions } from '../lib/usePermissions'
import { useT } from '../lib/i18n'
import { PrinterIcon } from '../components/icons'
import adminBody from '../content/manual-admin.md?raw'
import operationsBody from '../content/manual-operations.md?raw'
import cashierBody from '../content/manual-cashier.md?raw'
import checkerBody from '../content/manual-checker.md?raw'
import csrBody from '../content/manual-csr.md?raw'
import customerBody from '../content/manual-customer.md?raw'
import adminBodyTl from '../content/manual-admin.tl.md?raw'
import operationsBodyTl from '../content/manual-operations.tl.md?raw'
import cashierBodyTl from '../content/manual-cashier.tl.md?raw'
import checkerBodyTl from '../content/manual-checker.tl.md?raw'
import csrBodyTl from '../content/manual-csr.tl.md?raw'
import customerBodyTl from '../content/manual-customer.tl.md?raw'

// Staff user manual, role-aware: cashier and checker see their own guide;
// admin/owner default to the admin guide with tabs for every other role
// (handy when walking a customer or floor staff through something). Each guide
// has an English + Filipino body, picked by the active language.
const GUIDES = [
  { key: 'admin', label: 'Admin', en: adminBody, tl: adminBodyTl },
  { key: 'operations', label: 'Operations', en: operationsBody, tl: operationsBodyTl },
  { key: 'cashier', label: 'Cashier', en: cashierBody, tl: cashierBodyTl },
  { key: 'checker', label: 'Checker', en: checkerBody, tl: checkerBodyTl },
  { key: 'csr', label: 'CSR', en: csrBody, tl: csrBodyTl },
  { key: 'customer', label: 'Customer', en: customerBody, tl: customerBodyTl },
] as const

// "Process at a glance" flow per role — the same chart style as the customer
// guide, summarising each role's day-to-day loop above the detailed markdown.
const ROLE_FLOWS: Record<string, { steps: FlowStep[]; phases: FlowPhase[] }> = {
  admin: {
    steps: [
      { title: 'Approve customer accounts' },
      { title: 'Manage consignees' },
      { title: 'Set rates, fees & role access' },
      { title: 'Process job orders' },
      { title: 'Oversee payments & invoices' },
      { title: 'Post bulletins & announcements' },
    ],
    phases: [
      { label: 'Onboard & set up', from: 0, to: 3 },
      { label: 'Run orders & payments', from: 3, to: 6 },
    ],
  },
  operations: {
    steps: [
      { title: 'Keep the vessel schedule current' },
      { title: 'File or review job orders' },
      { title: 'Process orders in your scope' },
      { title: 'Resolve holds & info requests' },
    ],
    phases: [{ label: 'Run the floor', from: 0, to: 4 }],
  },
  cashier: {
    steps: [
      { title: 'Review uploaded payment proofs' },
      { title: 'Collect office payments' },
      { title: 'Record the ERP Service Invoice no.' },
      { title: 'Order is marked paid' },
    ],
    phases: [{ label: 'Take payment & invoice', from: 0, to: 4 }],
  },
  checker: {
    steps: [
      { title: 'Open the X-ray queue' },
      { title: 'Find the van (scan or pick the JO)' },
      { title: 'Confirm X-ray per container' },
      { title: 'Record RPS assessment if flagged' },
      { title: 'Order clears once all lines are done' },
    ],
    phases: [{ label: 'Check & clear', from: 0, to: 5 }],
  },
  csr: {
    steps: [
      { title: 'Answer support tickets' },
      { title: 'Review consignee requests' },
      { title: 'File orders on behalf (intake)' },
      { title: 'Verify pull-out documents' },
    ],
    phases: [{ label: 'Intake & comms', from: 0, to: 4 }],
  },
  customer: {
    steps: [
      { title: 'Create your account' },
      { title: 'Confirm your email' },
      { title: 'Get verified' },
      { title: 'File a Job Order' },
      { title: 'Track your orders by batch' },
      { title: 'View charges & pay' },
      { title: 'KTC processes your order' },
      { title: 'Print & claim' },
    ],
    phases: [
      { label: 'Set up & file', from: 0, to: 4 },
      { label: 'Track, pay & claim', from: 4, to: 8 },
    ],
  },
}

export default function ManualPage() {
  const { broker } = usePermissions()
  const { t, lang } = useT()
  const floorGuide = broker?.staff_role === 'cashier' ? 'cashier'
    : broker?.staff_role === 'checker' ? 'checker'
    : broker?.staff_role === 'operations' ? 'operations'
    : broker?.staff_role === 'csr' ? 'csr' : null
  const [tab, setTab] = useState<(typeof GUIDES)[number]['key']>(floorGuide ?? 'admin')
  const active = floorGuide ?? tab
  const guide = GUIDES.find((g) => g.key === active) ?? GUIDES[0]

  return (
    <AdminShell>
      <div style={{ margin: '14px 4px 10px' }}>
        <h1 className="ktc-title">{t('Staff manual')}</h1>
        <p className="ktc-sub">{t('Step-by-step guides for each role — how to run the portal day to day.')}</p>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '14px 4px 10px' }}>
        {!floorGuide && GUIDES.map((g) => (
          <button
            key={g.key}
            className={`ktc-nav-link${active === g.key ? ' is-active' : ''}`}
            onClick={() => setTab(g.key)}
          >
            {t(g.label)}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {broker?.is_owner && (
          <button className="ktc-btn-secondary ktc-btn--sm" onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><PrinterIcon size={15} /> {t('Print this guide')}</button>
        )}
      </div>
      <ProtectedDoc>
        <div className="ktc-glass" style={{ padding: '30px 32px' }}>
          {ROLE_FLOWS[active] && <ManualFlow steps={ROLE_FLOWS[active].steps} phases={ROLE_FLOWS[active].phases} />}
          <MarkdownBody body={lang === 'tl' ? guide.tl : guide.en} />
        </div>
      </ProtectedDoc>
    </AdminShell>
  )
}
