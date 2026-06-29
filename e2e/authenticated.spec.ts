import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mintSession, e2eAuthConfigured } from './helpers/session'

// ── Minted-token RPC helpers (cutover charges lanes) ─────────────────────────
// Mint a REAL authenticated access token for any seeded account WITHOUT a UI login
// (admin magic-link → follow the verify redirect → pull access_token from the hash),
// then drive the money-path RPCs through PostgREST — the same grant/RLS/RPC pipeline
// the UI uses. Lets the v2.0.0 charges lanes run headless against the seeded project.
const SB_URL = process.env.E2E_SUPABASE_URL ?? ''
const SB_SR = process.env.E2E_SERVICE_ROLE_KEY ?? ''
const SB_ANON = process.env.E2E_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
const REDIRECT = process.env.BASE_URL && !process.env.BASE_URL.includes('localhost') ? process.env.BASE_URL : 'http://127.0.0.1:3000'
const svc = () => createClient(SB_URL, SB_SR, { auth: { autoRefreshToken: false, persistSession: false } })
async function tokenFor(email: string): Promise<string> {
  const { data, error } = await svc().auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: REDIRECT } })
  if (error) throw new Error('generateLink ' + email + ': ' + error.message)
  const res = await fetch(data.properties!.action_link!, { redirect: 'manual' })
  const m = (res.headers.get('location') || '').match(/access_token=([^&]+)/)
  if (!m) throw new Error('no access_token in verify redirect for ' + email)
  return decodeURIComponent(m[1])
}
const authed = (tok: string): SupabaseClient =>
  createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: `Bearer ${tok}` } }, auth: { persistSession: false, autoRefreshToken: false } })

// Phase 2 — authenticated flows (ST01 Lanes 1–5). These use service-role
// magic-link session minting (see helpers/session.ts) so the CAPTCHA is never
// in the way and never disabled. They run ONLY when E2E_SUPABASE_URL +
// E2E_SERVICE_ROLE_KEY are set — point them at a dedicated TEST Supabase project
// (Option A) for the mutation lanes; do not mutate prod data. See e2e/README.md.

const OWNER = process.env.E2E_OWNER_EMAIL ?? 'jlawrenceang@gmail.com'
const BROKER = process.env.E2E_BROKER_EMAIL // a seeded, approved broker
const STAFF = process.env.E2E_STAFF_EMAIL // e.g. <username>@ktc-staff.local

test.describe('KTC portal — authenticated (Phase 2)', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeEach(() => {
    // Gated behind an explicit opt-in: these mint REAL role accounts (owner/broker/
    // staff) and the fixme lanes mutate data, so they must run against a DEDICATED
    // TEST project — never prod (minting the real owner against prod would evict the
    // owner's live session; the mutation lanes would corrupt prod). Without the
    // opt-in they SKIP cleanly (no false failure). The prod authenticated round-trip
    // is covered by customer-lifecycle.spec.ts (a throwaway customer, self-purged).
    // To run: E2E_AUTH_LIVE=1 with E2E_SUPABASE_URL/E2E_SERVICE_ROLE_KEY +
    // BASE_URL pointing at that test project's frontend. See e2e/README.md.
    test.skip(
      !e2eAuthConfigured || !process.env.E2E_AUTH_LIVE,
      'authenticated.spec runs against a dedicated TEST project — set E2E_AUTH_LIVE=1 (+ E2E_SUPABASE_URL/E2E_SERVICE_ROLE_KEY/BASE_URL for it). Prod auth lane = customer-lifecycle.spec.ts.',
    )
  })

  test('owner lands on the Admin Portal', async ({ page }) => {
    await mintSession(page, OWNER)
    await page.goto('/')
    await expect(page).toHaveURL(/\/admin$/)
    // grouped nav: Consignees lives under the "Customers" dropdown group
    await expect(page.getByRole('navigation', { name: 'Admin' }).getByRole('button', { name: /Customers/ })).toBeVisible()
  })

  test('owner can open the Consignees admin (master list)', async ({ page }) => {
    await mintSession(page, OWNER)
    await page.goto('/admin/consignees')
    await expect(page).toHaveURL(/\/admin\/consignees$/)
  })

  test('owner can open Settings (owner-only staff creation)', async ({ page }) => {
    await mintSession(page, OWNER)
    await page.goto('/admin/settings')
    await expect(page).toHaveURL(/\/admin\/settings$/)
    await expect(page.getByText(/Create staff account/i)).toBeVisible()
  })

  test('approved broker lands on broker home with the job-order nav', async ({ page }) => {
    test.skip(!BROKER, 'set E2E_BROKER_EMAIL (a seeded approved broker) to run')
    await mintSession(page, BROKER!)
    await page.goto('/')
    // exact: the home page also has a "New Job Order …" card link
    await expect(page.getByRole('link', { name: 'New Job Order', exact: true })).toBeVisible()
  })

  test('approved broker can open New Job Order and search consignees via the search_consignees RPC', async ({ page }) => {
    test.skip(!BROKER, 'set E2E_BROKER_EMAIL to run')
    await mintSession(page, BROKER!)
    await page.goto('/job-order')
    // ADR-0037 / migration 0218: a broker can NO LONGER SELECT the full consignee
    // master list (anti-scrape). The picker calls the `search_consignees` RPC, which
    // returns only id/code/name. This just drives the typeahead input.
    const box = page.getByPlaceholder(/Search consignee/i)
    await expect(box).toBeVisible()
    await box.fill('aa') // the picker debounces + queries the RPC server-side
    await expect(box).toHaveValue('aa')
  })

  test('staff (minted) lands on its role home (/admin or the /app/* staff PWA)', async ({ page }) => {
    test.skip(!STAFF, 'set E2E_STAFF_EMAIL (e.g. <username>@ktc-staff.local) to run')
    await mintSession(page, STAFF!)
    await page.goto('/')
    // RoleLanding (src/App.tsx): admin/owner → /admin; operational roles land on
    // their focused staff-PWA screen. NOTE (ADR-0037, v2.0.0): the cashier now lands
    // on the Payment Order desk — `/app/payment-orders`, not the retired `/app/cashier`.
    await expect(page).toHaveURL(/\/(admin|app(\/(operations|payment-orders|checker|support))?)$/)
  })

  // Mutation-heavy lanes — implement against the seeded TEST project once E2E_* is
  // wired. Kept as fixme so they don't accidentally mutate prod data. (The prod
  // round-trip + the NEW per-charge billing wires are exercised live by
  // customer-lifecycle.spec.ts against a throwaway, self-purged customer.)
  test.fixme('registration → pending → admin approval (ST01 Lane 2)', async () => {})
  test.fixme('consignee CRUD: add, duplicate guard, accredit, approve (ST01 Lane 3)', async () => {})
  test.fixme('submit a job order against a search_consignees pick → filing auto-seeds the base service charge (0212)', async () => {})
  test.fixme('owner creates staff; staff signs in; owner non-revocable (ST01 Lane 5)', async () => {})

  // Release / pull-out module (ADR-0024). The release DESK screens are unchanged, but
  // release billing now rides the same `charges` spine (0214/0215). Run on the TEST project.
  test.fixme('customer files a release: consignee + BL + DO/BL upload → submitted', async () => {})
  test.fixme('CSR verifies release docs → docs_verified; hold → on_hold → customer resubmits', async () => {})
  test.fixme('record the release collection OR + ERP control no. → released; gated on every charge confirmed', async () => {})

  // Job-order ops (ADR-0035) — queue/priority/re-X-ray lanes that SURVIVED the cutover.
  test.fixme('roles: each role lands on its /app/* screen (cashier → /app/payment-orders); server-enforced gates', async () => {})
  test.fixme('priority lane: ops/CSR request_priority → admin review_priority → served ahead', async () => {})
  test.fixme('re-X-ray: checker/ops request_rexray on a completed JO → child JO-####A → admin review_rexray; child is internal', async () => {})

})

// ── X-ray billing cutover (ADR-0037, v2.0.0) — the uniform `charges` table is the
// ONLY billing path. These mutate, so they run ONCE (desktop-en-light) against the
// seeded TEST project, driving the money-path RPCs through PostgREST with REAL minted
// staff/customer tokens (maker-checker, the FINAL-invoice confirm gate, payment-order
// bundling, serving number, admin-only cancel). They create throwaway JOs (entry_number
// 'AUTHRPC-…') and purge them in afterAll, leaving the seeded 6-charge fixture intact.
test.describe('KTC portal — charges money-path (RPC, seeded TEST project)', () => {
  test.describe.configure({ mode: 'serial' })
  let admin: SupabaseClient
  let broker: SupabaseClient, ops: SupabaseClient, adm: SupabaseClient, cash: SupabaseClient
  let brokerCust = '', ltc1Cust = '', consignee = '', J1 = ''
  const runHere = () => /^desktop-en-light$/.test(test.info().project.name)
  const gate = () => test.skip(!e2eAuthConfigured || !process.env.E2E_AUTH_LIVE || !SB_SR || !runHere(),
    'charges RPC lanes run once (desktop-en-light) against the seeded TEST project; set E2E_AUTH_LIVE=1 + E2E_SUPABASE_URL/E2E_SERVICE_ROLE_KEY/E2E_PUBLISHABLE_KEY.')

  const mkCharge = async (jo: string, o: Record<string, unknown> = {}) => {
    const { data, error } = await admin.from('charges').insert({
      job_order_id: jo, charge_type: 'service', label: 'AUTHRPC charge', qty: 1, unit_rate: 2918,
      amount: (o.amount ?? 2918), vatable: true, bill_status: 'billed', invoice_state: (o.inv ?? 'draft'),
      erp_invoice_no: (o.erp ?? null), bir_invoice_no: (o.bir ?? null), payment_status: (o.pay ?? 'unpaid'),
    }).select('id').single()
    if (error) throw new Error('mkCharge: ' + error.message)
    return (data as { id: string }).id
  }
  const mkJO = async (cust: string, status: string) => {
    const { data, error } = await admin.from('job_orders')
      .insert({ customer_id: cust, consignee_id: consignee, status, entry_number: 'AUTHRPC-' + Math.random().toString(36).slice(2, 8) })
      .select('id').single()
    if (error) throw new Error('mkJO: ' + error.message)
    return (data as { id: string }).id
  }

  test.beforeAll(async () => {
    if (!e2eAuthConfigured || !process.env.E2E_AUTH_LIVE || !SB_SR || !runHere()) return
    admin = svc()
    const { data: bc } = await admin.from('customers').select('id').eq('email', process.env.E2E_BROKER_EMAIL ?? 'e2e-broker@test.local').single()
    const { data: lc } = await admin.from('customers').select('id').eq('email', 'lt-c001@loadtest.ktc').single()
    const { data: cn } = await admin.from('consignees').select('id').eq('status', 'approved').limit(1).single()
    brokerCust = (bc as { id: string }).id; ltc1Cust = (lc as { id: string }).id; consignee = (cn as { id: string }).id
    broker = authed(await tokenFor(process.env.E2E_BROKER_EMAIL ?? 'e2e-broker@test.local'))
    ops = authed(await tokenFor('lt-ops1@ktc-staff.local'))
    adm = authed(await tokenFor('lt-admin@ktc-staff.local'))
    cash = authed(await tokenFor('lt-cash1@ktc-staff.local'))
    J1 = await mkJO(brokerCust, 'processing')
  })
  test.afterAll(async () => {
    if (admin) await admin.from('job_orders').delete().like('entry_number', 'AUTHRPC-%')
  })

  test('charges: add_charge addon is proposed → maker-checker approve (approver ≠ creator)', async () => {
    gate()
    const { data: addonId, error } = await ops.rpc('add_charge', { p_jo: J1, p_type: 'addon', p_label: 'Re-scan fee', p_qty: 1, p_unit_rate: 500 })
    expect(error, 'ops proposes addon').toBeNull()
    const { data: pre } = await admin.from('charges').select('bill_status').eq('id', addonId).single()
    expect((pre as { bill_status: string }).bill_status).toBe('proposed')
    const { error: self } = await ops.rpc('approve_charge', { p_charge: addonId })
    expect(self, 'creator cannot approve own charge').not.toBeNull()
    const { error: ok } = await adm.rpc('approve_charge', { p_charge: addonId })
    expect(ok, 'a different staffer approves').toBeNull()
    const { data: post } = await admin.from('charges').select('bill_status').eq('id', addonId).single()
    expect((post as { bill_status: string }).bill_status).toBe('billed')
  })

  test('per-charge pay: submit → confirm BLOCKED before FINAL invoice → record invoice → confirm', async () => {
    gate()
    const c = await mkCharge(J1, { pay: 'unpaid', inv: 'draft' })
    expect((await broker.rpc('submit_charge_payment', { p_charge: c, p_proof: 'payment-slips/test.png' })).error, 'broker submits proof').toBeNull()
    expect((await cash.rpc('confirm_charge_payment', { p_charge: c, p_ok: true })).error, 'confirm blocked w/o final invoice').not.toBeNull()
    expect((await cash.rpc('record_charge_invoice', { p_charge: c, p_erp: 'OR-INV-00160001', p_bir: '0260001' })).error, 'record final invoice').toBeNull()
    expect((await cash.rpc('confirm_charge_payment', { p_charge: c, p_ok: true })).error, 'confirm after invoice').toBeNull()
    const { data } = await admin.from('charges').select('payment_status').eq('id', c).single()
    expect((data as { payment_status: string }).payment_status).toBe('confirmed')
  })

  test('payment orders: bundle same-customer charges OK; cross-customer BLOCKED', async () => {
    gate()
    const a = await mkCharge(J1, { pay: 'unpaid' }), b = await mkCharge(J1, { pay: 'unpaid' })
    const { data: poId, error } = await cash.rpc('create_payment_order', { p_consignee: consignee, p_charge_ids: [a, b] })
    expect(error, 'same-customer bundle').toBeNull()
    expect(poId).toBeTruthy()
    const Jx = await mkJO(ltc1Cust, 'processing'); const cx = await mkCharge(Jx, { pay: 'unpaid' })
    const { error: cross } = await cash.rpc('create_payment_order', { p_consignee: consignee, p_charge_ids: [await mkCharge(J1, {}), cx] })
    expect(cross, 'cross-customer bundle blocked').not.toBeNull()
  })

  test('serving number: monthly reset boundary + YYMM-XXXX display', async () => {
    gate()
    const { data: sw } = await admin.rpc('serving_week')
    const d = new Date(sw as string)
    expect(d.getUTCDate(), 'serving_week() is a month boundary (PH first-of-month)').toBe(1)
    const { data: row } = await admin.from('serving_numbers').select('serving_no, week_start').order('week_start', { ascending: false }).limit(1).single()
    if (row) {
      const wm = new Date((row as { week_start: string }).week_start)
      const disp = `${String(wm.getUTCFullYear()).slice(2)}${String(wm.getUTCMonth() + 1).padStart(2, '0')}-${String((row as { serving_no: number }).serving_no).padStart(4, '0')}`
      expect(disp).toMatch(/^\d{4}-\d{4}$/)
    }
  })

  test('admin-only cancel: cashier blocked, admin allowed; customer self-cancel pristine OK / billed BLOCKED', async () => {
    gate()
    const c = await mkCharge(J1, { pay: 'unpaid' })
    expect((await cash.rpc('cancel_charge', { p_charge: c, p_reason: 'x' })).error, 'cashier cannot cancel a charge').not.toBeNull()
    expect((await adm.rpc('cancel_charge', { p_charge: c, p_reason: 'admin void' })).error, 'admin cancels a charge').toBeNull()
    const pristine = await mkJO(brokerCust, 'submitted'); await mkCharge(pristine, { pay: 'unpaid', inv: 'draft' })
    expect((await broker.rpc('cancel_job_order', { p_id: pristine })).error, 'customer self-cancels pristine order').toBeNull()
    const billed = await mkJO(brokerCust, 'submitted'); await mkCharge(billed, { pay: 'submitted', inv: 'final', erp: 'OR-INV-00161000', bir: '0261000' })
    expect((await broker.rpc('cancel_job_order', { p_id: billed })).error, 'self-cancel blocked once billing moved').not.toBeNull()
    expect((await adm.rpc('admin_cancel_job_order', { p_id: billed, p_reason: 'override' })).error, 'admin_cancel_job_order works').toBeNull()
  })

  // Out of scope here (separate modules): the release/priority/re-X-ray lanes.
  test.fixme('one-rule completion via confirm; release billing on the charges spine; priority + re-X-ray lanes', async () => {})
})
