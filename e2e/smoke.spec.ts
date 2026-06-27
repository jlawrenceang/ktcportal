import { test, expect } from '@playwright/test'

// Phase 1 — unauthenticated smoke. These run headlessly against the deployed
// site (or BASE_URL) without completing a login, so they are unaffected by the
// server-side CAPTCHA. They cover the no-auth parts of ST01 Lane 1 plus routing
// and the SPA rewrite. See docs/smoke-test-01-portal.md.

test.describe('KTC portal — unauthenticated smoke', () => {
  // Signed-out "/" now renders the public access menu (AuthRail) inside the shared
  // PublicShell — orientation + the three ways in — NOT a redirect to /login (the
  // public Landing shipped 2026-06-26).
  test('root shows the public access menu (AuthRail) when logged out', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/$/) // stays at the root, not bounced to /login
    await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create an account' }).first()).toBeVisible()
  })

  test('login page renders core elements', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByAltText('KTC Container Terminal Corp')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('protected admin route redirects to /login when logged out', async ({ page }) => {
    await page.goto('/admin/consignees')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('protected broker route redirects to /login when logged out', async ({ page }) => {
    await page.goto('/job-order')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('SPA deep-link is served by the rewrite (HTTP 200, not a hard 404)', async ({ page }) => {
    const res = await page.goto('/admin/consignees')
    expect(res?.status()).toBe(200)
  })

  // Release / pull-out module (ADR-0024) — routes exist and are auth-gated.
  test('protected customer releases route redirects to /login when logged out', async ({ page }) => {
    await page.goto('/releases')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('protected admin releases route redirects to /login when logged out', async ({ page }) => {
    await page.goto('/admin/releases')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('SPA deep-link /admin/releases is served by the rewrite (HTTP 200)', async ({ page }) => {
    const res = await page.goto('/admin/releases')
    expect(res?.status()).toBe(200)
  })

  // Staff PWA (/app/*) — the focused single-purpose screens that operational roles now
  // land on by default (ADR-0035 era). They're admin-gated, so a logged-out hit redirects.
  test('protected staff-PWA routes redirect to /login when logged out', async ({ page }) => {
    for (const path of ['/app', '/app/operations', '/app/cashier', '/app/checker', '/app/support']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
    }
  })

  // App.tsx's catch-all route now navigates to "/" (the RootGate); for a signed-out
  // visitor that renders the AuthRail access menu (it no longer lands on /login).
  test('unknown route falls through to the root access menu', async ({ page }) => {
    await page.goto('/this-route-does-not-exist')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('link', { name: 'Create an account' }).first()).toBeVisible()
  })

  test('can switch to Create account (valid ID moved to post-confirmation)', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Create one' }).click()
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible()
    await expect(page.locator('#fullName')).toBeVisible()
    await expect(page.locator('#validId')).toHaveCount(0) // ID is uploaded after email confirmation now
  })

  test('public Agreement page renders without auth', async ({ page }) => {
    const res = await page.goto('/agreement')
    expect(res?.status()).toBe(200)
    await expect(page).toHaveURL(/\/agreement$/) // public — not redirected to /login
    await expect(page.getByRole('heading', { name: /KTC Customer Agreement/i }).first()).toBeVisible()
  })

  test('old legal routes redirect to /agreement', async ({ page }) => {
    for (const path of ['/irr', '/terms', '/privacy']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/agreement$/)
    }
  })

  test('registration shows the inline agreement + Terms and DPA consent ticks', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Create one' }).click()
    await expect(page.getByRole('checkbox')).toHaveCount(1) // one tick = Terms + NDA + DPA (consolidated)
    await expect(page.getByRole('button', { name: /View full/i })).toBeVisible() // opens the agreement modal
    await expect(page.getByText(/KTC Customer Agreement/i).first()).toBeVisible() // inline doc
    await expect(page.getByText(/Data Privacy Act/i).first()).toBeVisible()
  })

  test('login enforces CAPTCHA: Turnstile mounts and the submit is gated', async ({ page }) => {
    // Test builds (Phase 2, localhost) are deliberately built WITHOUT the
    // Turnstile site key so minted sessions aren't blocked — only prod
    // meaningfully runs this check.
    test.skip(
      !!process.env.E2E_SUPABASE_URL && (process.env.BASE_URL ?? '').includes('localhost'),
      'CAPTCHA is intentionally disabled on the localhost test build',
    )
    await page.goto('/login')
    // The Turnstile API script is loaded by src/components/Turnstile.tsx.
    await expect(
      page.locator('script[src*="challenges.cloudflare.com/turnstile"]'),
    ).toBeAttached({ timeout: 20000 })
    // Turnstile mounts its widget (a hidden response input id'd cf-chl-widget-*).
    await expect(page.locator('[id^="cf-chl-widget-"]')).toBeAttached({ timeout: 20000 })
    // Submit stays disabled until a CAPTCHA token exists — proves the gate is wired.
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled()
  })
})
