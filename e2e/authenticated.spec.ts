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

  test('approved broker can open New Job Order and search the consignee master list', async ({ page }) => {
    test.skip(!BROKER, 'set E2E_BROKER_EMAIL to run')
    await mintSession(page, BROKER!)
    await page.goto('/job-order')
    const box = page.getByPlaceholder(/Search consignee/i)
    await expect(box).toBeVisible()
    await box.fill('aa') // >=2 chars triggers the server-side typeahead
    await expect(box).toHaveValue('aa')
  })

  test('staff (minted) lands on its role home (/admin or the /app/* staff PWA)', async ({ page }) => {
    test.skip(!STAFF, 'set E2E_STAFF_EMAIL (e.g. <username>@ktc-staff.local) to run')
    await mintSession(page, STAFF!)
    await page.goto('/')
    // RoleLanding (src/App.tsx): admin/owner → /admin; operational roles
    // (operations/cashier/checker/csr) now land on their focused staff-PWA screen.
    await expect(page).toHaveURL(/\/(admin|app(\/(operations|cashier|checker|support))?)$/)
  })

  // Mutation-heavy ST01 lanes — implement against the seeded TEST project once
  // E2E_* is wired. Kept as fixme so they don't accidentally mutate prod data.
  test.fixme('registration → pending → admin approval (ST01 Lane 2)', async () => {})
  test.fixme('consignee CRUD: add, duplicate guard, accredit, approve (ST01 Lane 3)', async () => {})
  test.fixme('submit a job order against a master-list consignee (ST01 Lane 4)', async () => {})
  test.fixme('owner creates staff; staff signs in; owner non-revocable (ST01 Lane 5)', async () => {})

  // Release / pull-out module (ADR-0024) — the automated counterpart to ST04.
  // Run against the seeded TEST project; do not mutate prod.
  test.fixme('customer files a release: consignee + BL + DO/BL upload → submitted (ST04 Lane A)', async () => {})
  test.fixme('CSR verifies release docs → docs_verified; hold → on_hold → customer resubmits (ST04 Lane B)', async () => {})
  test.fixme('staff sets charges once (>0) → payable; adds a supplement (ST04 Lane C)', async () => {})
  test.fixme('customer pays → cashier confirms → paid (ST04 Lane D)', async () => {})
  test.fixme('record OR: BIR OR ≤6 digits + ERP OR-INV cash-only → released; OR blocked by unpaid supplement (ST04 Lane E)', async () => {})
  test.fixme('cancel a pre-payment release (customer + staff) (ST04 Lane F)', async () => {})

  // Job-order ops overhaul (ADR-0035) — the automated counterpart to ST06. Run against
  // the seeded TEST project; do not mutate prod. Each maps to an ST06 lane.
  test.fixme('roles re-split: each role lands on its /app/* screen; cashier money-only; CSR no approval (ST06 Lane A)', async () => {})
  test.fixme('serving number auto-assigns on submitted, vacates on exit, new tail on re-entry (ST06 Lane B)', async () => {})
  test.fixme('priority lane: ops/CSR request_priority → admin review_priority → served ahead (ST06 Lane C)', async () => {})
  test.fixme('re-X-ray: checker/ops request_rexray on a completed JO → child JO-####A → admin review_rexray; child is internal (ST06 Lane D)', async () => {})
  test.fixme('charges request→bill: ops request_supplement (label only) → cashier bill_supplement (amount) → pay → confirm (ST06 Lane E)', async () => {})
  test.fixme('payment requires invoice: record_service_invoice before review_payment confirms base (online + walk-in) (ST06 Lane F)', async () => {})
  test.fixme('automatic completion: no manual button; auto-completes from services-last and payment-last (ST06 Lane G)', async () => {})
})
