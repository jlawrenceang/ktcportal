import type { Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Phase 2 auth harness — mint an authenticated session WITHOUT a UI login, so
// the server-side CAPTCHA is never in the way and never disabled.
//
// How it works: with the project's service_role key we ask Supabase for a
// magic-link (admin API, not CAPTCHA-gated), then navigate the browser to that
// link. Supabase verifies it and redirects back to the app with tokens in the
// URL; supabase-js consumes them and stores the session. We then drive the UI.
//
// Configure via env (never commit secrets):
//   E2E_SUPABASE_URL        — the project URL (a dedicated TEST project = Option A,
//                             or the prod project = Option B, read-only).
//   E2E_SERVICE_ROLE_KEY    — that project's service_role key.
//   BASE_URL                — the frontend pointing at that project (redirect target).
//   E2E_OWNER_EMAIL / E2E_BROKER_EMAIL / E2E_STAFF_EMAIL — seeded test accounts.
//
// See e2e/README.md and ADR-0010.

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? ''
const SERVICE_ROLE = process.env.E2E_SERVICE_ROLE_KEY ?? ''
const BASE_URL = process.env.BASE_URL ?? 'https://portal.ktcterminal.com'

export const e2eAuthConfigured = Boolean(SUPABASE_URL && SERVICE_ROLE)

export async function mintSession(page: Page, email: string): Promise<void> {
  if (!e2eAuthConfigured) throw new Error('E2E auth not configured (E2E_SUPABASE_URL / E2E_SERVICE_ROLE_KEY)')
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: BASE_URL },
  })
  if (error) throw new Error(`generateLink failed for ${email}: ${error.message}`)
  const link = data.properties?.action_link
  if (!link) throw new Error(`no action_link returned for ${email}`)

  // Start clean, then follow the magic link to establish the session.
  await page.goto(`${BASE_URL}/login`)
  await page.evaluate(() => window.localStorage.clear())
  await page.goto(link)
  // The verify redirect lands with tokens in the URL hash; supabase-js then
  // consumes them asynchronously. Navigating away before it persists the
  // session loses it — so wait for the auth token to hit localStorage.
  await page.waitForFunction(
    () => Object.keys(window.localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token')),
    undefined,
    { timeout: 20000 },
  )
}
