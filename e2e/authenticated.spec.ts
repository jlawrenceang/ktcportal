import { test } from '@playwright/test'

/**
 * Phase 2 — authenticated flows (ST01 Lanes 2–5).
 *
 * BLOCKED on a CAPTCHA-free auth path. The production Supabase project enforces
 * Cloudflare Turnstile on every password sign-in, so a headless browser cannot
 * complete a UI login. To unblock, pick ONE:
 *
 *   A) Dedicated test Supabase project with CAPTCHA off, OR using Turnstile TEST
 *      keys (site `1x00000000000000000000AA` / secret `1x0000000000000000000000000000000AA`).
 *      Point a test build + BASE_URL at it. Cleanest; full isolation from prod data.
 *
 *   B) Service-role session minting: with SUPABASE_SERVICE_ROLE_KEY (CI secret,
 *      never committed) create/seed a test user via the admin API, mint a session,
 *      inject it into localStorage as the supabase-js auth token via
 *      page.addInitScript(), then drive the UI. No UI login -> no CAPTCHA.
 *
 * Until one is chosen these are test.fixme: the suite documents the intended
 * coverage without failing. When unblocked, implement a storageState fixture per
 * role (owner / approved broker / staff) and fill these in to mirror ST01.
 */

test.fixme('owner login lands on the Admin Portal (/admin), not broker home', async () => {
  // ST01 1A-3/1A-4
})

test.fixme('broker registers (valid-ID upload), is gated pending, then approved by admin', async () => {
  // ST01 Lane 2
})

test.fixme('admin manages consignees: search, paginate, duplicate guard, accredit, approve', async () => {
  // ST01 Lane 3 — duplicate guard (23505) and "2303 required to approve"
})

test.fixme('approved broker submits a job order against an approved consignee', async () => {
  // ST01 Lane 4 — only approved consignees selectable; broker sees own, admin sees all
})

test.fixme('owner creates staff; staff signs in with username; owner is non-revocable', async () => {
  // ST01 Lane 5 — create_staff RPC, username login, owner row not revocable
})
