import { test, expect } from '@playwright/test'
import { mintSession, e2eAuthConfigured } from './helpers/session'

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

  // X-ray billing cutover (ADR-0037, v2.0.0) — the uniform `charges` table is the ONLY
  // billing path (the old base/RPS/supplement/service-invoice billing was DELETED). Run
  // against the seeded TEST project; do not mutate prod.
  test.fixme('charges: add_charge service/rps auto-bill; addon is proposed → approve_charge (maker-checker, approver ≠ creator)', async () => {})
  test.fixme('per-charge pay: customer submit_charge_payment (proof) in JobOrderCharges → cashier confirm_charge_payment', async () => {})
  test.fixme('invoice gate: confirm_charge_payment / confirm_payment_order are BLOCKED until record_charge_invoice sets a FINAL ERP+BIR invoice', async () => {})
  test.fixme('payment orders: create_payment_order bundles whole charges (one customer) → confirm_payment_order records ONE collection OR', async () => {})
  test.fixme('one-rule completion: a JO auto-completes only when all services are done AND every billed charge is confirmed (or reversed)', async () => {})
  test.fixme('serving number: assigns on submitted, resets MONTHLY, displays YYMM-XXXX (e.g. 2606-0001); charge-only work skips the queue', async () => {})
  test.fixme('admin-only cancel: customer self-cancel blocked once a charge leaves pristine; admin_cancel_job_order(p_id,p_reason) cancels with a reason', async () => {})
})
