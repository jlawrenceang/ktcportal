import { test, expect } from '@playwright/test'

// Phase 1 — unauthenticated smoke. These run headlessly against the deployed
// site (or BASE_URL) without completing a login, so they are unaffected by the
// server-side CAPTCHA. They cover the no-auth parts of ST01 Lane 1 plus routing
// and the SPA rewrite. See docs/smoke-test-01-portal.md.

// These are DEPLOYED-site checks (no local server needed). .env.local sets
// BASE_URL=http://localhost:3000 for the local-preview workflow, which — with no
// `npm run preview` running — points every test at a dead port (ERR_CONNECTION_
// REFUSED) and fails the whole suite. So resolve to the deployed site unless
// BASE_URL is explicitly a non-localhost target. Run a local preview with e.g.
// `BASE_URL=http://localhost:4173 npx playwright test` only when a server is up.
const DEPLOYED = process.env.BASE_URL && !process.env.BASE_URL.includes('localhost')
  ? process.env.BASE_URL
  : 'https://portal.ktcterminal.com'
const isLoopbackTarget = (() => {
  try {
    const host = new URL(DEPLOYED).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
})()

test.describe('KTC portal — unauthenticated smoke', () => {
  test.use({ baseURL: DEPLOYED })
  // Signed-out "/" now renders the public access menu (AuthRail) inside the shared
  // PublicShell — orientation + the three ways in — NOT a redirect to /login (the
  // public Landing shipped 2026-06-26).
  test('root shows the public access menu (AuthRail) when logged out', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/$/) // stays at the root, not bounced to /login
    // href-based (language-agnostic — link labels are translated in Tagalog).
    await expect(page.locator('a[href="/login"]').first()).toBeVisible()
    await expect(page.locator('a[href="/register"]').first()).toBeVisible()
  })

  test('login page renders core elements', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    // Structural selectors (the heading + button text are translated in Tagalog).
    await expect(page.getByAltText('KTC Container Terminal Corp')).toBeVisible()
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.locator('form button[type="submit"]')).toBeVisible()
  })

  test('protected admin route redirects to /login when logged out', async ({ page }) => {
    await page.goto('/admin/consignees', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login$/)
  })

  test('protected broker route redirects to /login when logged out', async ({ page }) => {
    await page.goto('/job-order', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login$/)
  })

  test('SPA deep-link is served by the rewrite (HTTP 200, not a hard 404)', async ({ page }) => {
    const res = await page.goto('/admin/consignees', { waitUntil: 'domcontentloaded' })
    expect(res?.status()).toBe(200)
  })

  // Release / pull-out module (ADR-0024) — routes exist and are auth-gated.
  test('protected customer releases route redirects to /login when logged out', async ({ page }) => {
    await page.goto('/releases', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login$/)
  })

  test('protected admin releases route redirects to /login when logged out', async ({ page }) => {
    await page.goto('/admin/releases', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login$/)
  })

  test('SPA deep-link /admin/releases is served by the rewrite (HTTP 200)', async ({ page }) => {
    const res = await page.goto('/admin/releases', { waitUntil: 'domcontentloaded' })
    expect(res?.status()).toBe(200)
  })

  // Staff PWA (/app/*) — the focused single-purpose screens that operational roles now
  // land on by default. They're admin-gated, so a logged-out hit redirects. NOTE the
  // billing cutover (ADR-0037, v2.0.0): the cashier screen is now the Payment Order
  // desk — `/app/cashier` is GONE, replaced by `/app/payment-orders`.
  test('protected staff-PWA routes redirect to /login when logged out', async ({ page }) => {
    for (const path of ['/app', '/app/operations', '/app/payment-orders', '/app/checker', '/app/support']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/login$/)
    }
  })

  // Billing cutover (ADR-0037, v2.0.0) — the uniform `charges` table is the ONLY
  // X-ray billing path. The cashier collects via the Payment Order desk and adds/
  // approves charges via Charge Approval; both are admin-gated, so a logged-out hit
  // redirects, and the SPA rewrite serves them (no hard 404).
  test('protected admin billing routes (payment-orders + charges) redirect to /login when logged out', async ({ page }) => {
    for (const path of ['/admin/payment-orders', '/admin/charges']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/login$/)
    }
  })

  test('SPA deep-link /admin/payment-orders is served by the rewrite (HTTP 200)', async ({ page }) => {
    const res = await page.goto('/admin/payment-orders', { waitUntil: 'domcontentloaded' })
    expect(res?.status()).toBe(200)
  })

  // The DELETED billing routes (ADR-0037): the customer Pay page (/job-order/:id/pay)
  // and the cashier station (/admin/cashier, /app/cashier) no longer exist. They match
  // no <Route>, so App.tsx's catch-all navigates to "/" (the RootGate) — which for a
  // logged-out visitor renders the public access menu. The point: served by the SPA
  // rewrite (HTTP 200) and bounced to "/", never a dead screen.
  test('deleted billing routes fall through to the root access menu (not a hard 404)', async ({ page }) => {
    for (const path of ['/job-order/00000000/pay', '/admin/cashier', '/app/cashier']) {
      const res = await page.goto(path, { waitUntil: 'domcontentloaded' })
      expect(res?.status()).toBe(200)
      await expect(page).toHaveURL(/\/$/)
    }
  })

  // App.tsx's catch-all route now navigates to "/" (the RootGate); for a signed-out
  // visitor that renders the AuthRail access menu (it no longer lands on /login).
  test('unknown route falls through to the root access menu', async ({ page }) => {
    await page.goto('/this-route-does-not-exist', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('a[href="/register"]').first()).toBeVisible()
  })

  test('can switch to Create account (valid ID moved to post-confirmation)', async ({ page }) => {
    await page.goto('/register', { waitUntil: 'domcontentloaded' }) // the walk-in QR target opens straight in sign-up mode
    await expect(page.locator('#fullName')).toBeVisible()
    await expect(page.locator('#contactNumber')).toBeVisible()
    await expect(page.locator('#validId')).toHaveCount(0) // ID is uploaded after email confirmation now
  })

  test('public Agreement page renders without auth', async ({ page }) => {
    const res = await page.goto('/agreement', { waitUntil: 'domcontentloaded' })
    expect(res?.status()).toBe(200)
    await expect(page).toHaveURL(/\/agreement$/) // public — not redirected to /login
    await expect(page.getByRole('heading', { name: /KTC Customer Agreement/i }).first()).toBeVisible()
  })

  test('old legal routes redirect to /agreement', async ({ page }) => {
    for (const path of ['/irr', '/terms', '/privacy']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/agreement$/)
    }
  })

  test('registration shows the inline agreement + Terms and DPA consent tick', async ({ page }) => {
    await page.goto('/register', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('checkbox')).toHaveCount(1) // one tick = Terms + NDA + DPA (consolidated)
    // The agreement proper noun appears in the inline doc body (legal text isn't
    // translated), so it's a language-agnostic marker that the agreement rendered.
    await expect(page.getByText(/KTC Customer Agreement/i).first()).toBeVisible()
  })

  test('login enforces CAPTCHA: Turnstile mounts and the submit is gated', async ({ page }) => {
    // Test builds (Phase 2, localhost) are deliberately built WITHOUT the
    // Turnstile site key so minted sessions aren't blocked — only prod
    // meaningfully runs this check. Key the skip off the EFFECTIVE baseURL the
    // run resolves to (DEPLOYED), NOT the raw BASE_URL string: a localhost
    // BASE_URL is ignored and the run targets prod, where the Turnstile gate (a
    // non-negotiable) MUST be exercised — keying off raw BASE_URL skipped it.
    test.skip(
      !!process.env.E2E_SUPABASE_URL && isLoopbackTarget,
      'CAPTCHA is intentionally disabled on the loopback sandbox test build',
    )
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    // The Turnstile API script is loaded by src/components/Turnstile.tsx.
    await expect(
      page.locator('script[src*="challenges.cloudflare.com/turnstile"]'),
    ).toBeAttached({ timeout: 20000 })
    // Turnstile mounts its widget (a hidden response input id'd cf-chl-widget-*).
    await expect(page.locator('[id^="cf-chl-widget-"]')).toBeAttached({ timeout: 20000 })
    // Submit stays disabled until a CAPTCHA token exists — proves the gate is wired.
    await expect(page.locator('form button[type="submit"]')).toBeDisabled()
  })
})
