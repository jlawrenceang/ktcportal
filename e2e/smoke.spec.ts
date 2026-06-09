import { test, expect } from '@playwright/test'

// Phase 1 — unauthenticated smoke. These run headlessly against the deployed
// site (or BASE_URL) without completing a login, so they are unaffected by the
// server-side CAPTCHA. They cover the no-auth parts of ST01 Lane 1 plus routing
// and the SPA rewrite. See docs/smoke-test-01-portal.md.

test.describe('KTC portal — unauthenticated smoke', () => {
  test('root redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
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

  test('unknown route falls through to /login', async ({ page }) => {
    await page.goto('/this-route-does-not-exist')
    await expect(page).toHaveURL(/\/login$/)
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
    await expect(page.getByRole('heading', { name: /KTC Broker Agreement/i }).first()).toBeVisible()
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
    await expect(page.getByRole('checkbox')).toHaveCount(2) // Terms + DPA consent
    await expect(page.getByRole('link', { name: /View full/i })).toBeVisible() // opens /agreement
    await expect(page.getByText(/KTC Broker Agreement/i).first()).toBeVisible() // inline doc
    await expect(page.getByText(/Data Privacy Act/i).first()).toBeVisible()
  })

  test('login enforces CAPTCHA: Turnstile mounts and the submit is gated', async ({ page }) => {
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
