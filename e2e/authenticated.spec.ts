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
    test.skip(
      !e2eAuthConfigured,
      'Set E2E_SUPABASE_URL + E2E_SERVICE_ROLE_KEY (point at a test project) to run Phase 2. See e2e/README.md.',
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

  test('staff (minted) lands on the Admin Portal', async ({ page }) => {
    test.skip(!STAFF, 'set E2E_STAFF_EMAIL (e.g. <username>@ktc-staff.local) to run')
    await mintSession(page, STAFF!)
    await page.goto('/')
    await expect(page).toHaveURL(/\/admin$/)
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
})
