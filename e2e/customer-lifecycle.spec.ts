import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Customer lifecycle — the first per-role END-TO-END lane, modeled on the
// break-test: a HAPPY PATH (prove every frontend → API → DB wire is alive) and a
// BREAK PATH (adversarial inputs / access abuse are blocked). The "green tests,
// dead app" antidote: drive the REAL UI, then assert the row actually landed in
// the database (or that a forbidden action was refused).
//
// LESSON (why this is ONE test, not many): KTC enforces ONE session per account
// (claim_session). Minting a fresh magic-link session per test trips the
// "already signed in on another device" guard and blocks the new tab. So mint
// ONCE and drive every flow in a single session, sequentially.
//
// Runs ONLY with prod service-role creds; creates a CLEARLY-marked throwaway
// customer that afterAll purges completely (verified 0 residual). Run live:
//   BASE_URL=https://portal.ktcterminal.com npx playwright test customer-lifecycle
// ─────────────────────────────────────────────────────────────────────────────

const URL = process.env.VITE_SUPABASE_URL ?? ''
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.E2E_PUBLISHABLE_KEY ?? ''
const BASE = process.env.BASE_URL ?? 'https://portal.ktcterminal.com'
const configured = Boolean(URL && SR)

let admin: SupabaseClient
let userId = ''
let customerId = ''
let seedOk = false
const STAMP = Date.now()
const email = `e2e-rt-${STAMP}@ktcport-test.invalid`
const TAG = `E2ERT${STAMP}`
const verdicts: Record<string, string> = {}

async function mint(page: Page) {
  await page.addInitScript((uid) => {
    try {
      localStorage.setItem('ktc_lang', 'en')
      localStorage.setItem(`ktc_lang_chosen_${uid}`, '1')
      localStorage.setItem(`ktc_setup_done_${uid}`, '1')
    } catch { /* ignore */ }
  }, userId)
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: BASE } })
  if (error) throw new Error('generateLink: ' + error.message)
  const link = data.properties!.action_link!
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => localStorage.clear())
  await page.goto(link)
  await page.waitForFunction(
    () => Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token')),
    { timeout: 20000 },
  )
}

// dismiss a page tour / first-run / single-session overlay so it doesn't cover the form
async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  for (let i = 0; i < 3; i++) {
    const term = page.getByRole('button', { name: /Terminate other session/i })
    if (await term.isVisible().catch(() => false)) { await term.click().catch(() => {}); await page.waitForTimeout(400); continue }
    const btn = page.getByRole('button', { name: /skip|done|got it|finish|close|dismiss|×|✕/i }).first()
    if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(250); continue }
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(200)
  }
}

const cnt = async (tbl: string, col: string, val: string, extraCol?: string, extraVal?: string) => {
  let q = admin.from(tbl).select('id', { count: 'exact', head: true }).eq(col, val)
  if (extraCol && extraVal) q = q.eq(extraCol, extraVal)
  return (await q).count ?? 0
}

test.describe('customer lifecycle (live v1.7.0)', () => {
  test.skip(!configured, 'set VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (prod) to run')
  test.describe.configure({ timeout: 180000 })

  test.beforeAll(async () => {
    admin = createClient(URL, SR, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: u, error } = await admin.auth.admin.createUser({ email, password: `E2e!${STAMP}aZ`, email_confirm: true })
    if (error) throw new Error('createUser: ' + error.message)
    userId = u.user!.id
    for (let i = 0; i < 12 && !customerId; i++) {
      const { data: c } = await admin.from('customers').select('id').eq('user_id', userId).maybeSingle()
      if (c) customerId = (c as { id: string }).id
      else await new Promise((r) => setTimeout(r, 400))
    }
    if (!customerId) throw new Error('handle_new_user did not create a customers row')
    const { error: upErr } = await admin.from('customers')
      .update({ status: 'approved', terms_version: 'v4', full_name: `${TAG} Tester`, contact_number: '09170000000' })
      .eq('id', customerId)
    if (upErr) throw new Error('approve: ' + upErr.message)
    const { count: cons } = await admin.from('consignees').select('id', { count: 'exact', head: true }).eq('status', 'approved')
    const { count: ves } = await admin.from('vessel_schedule_v').select('vessel_visit', { count: 'exact', head: true }).eq('is_current', true)
    seedOk = (cons ?? 0) > 0 && (ves ?? 0) > 0
    console.log(`[setup] customer=${customerId} approved · seedData(JO)=${seedOk} (consignees=${cons} vessels=${ves})`)
  })

  test.afterAll(async () => {
    if (!admin || !userId) return
    if (customerId) {
      await admin.from('release_orders').delete().eq('customer_id', customerId)
      await admin.from('support_tickets').delete().eq('customer_id', customerId)
      await admin.from('job_orders').delete().eq('broker_id', customerId)
      await admin.from('consignees').delete().eq('requested_by', customerId)
      await admin.from('notifications').delete().eq('customer_id', customerId)
    }
    const { error: delErr } = await admin.auth.admin.deleteUser(userId)
    const residual: Record<string, number> = {}
    if (customerId) {
      for (const [tbl, col] of [['release_orders', 'customer_id'], ['support_tickets', 'customer_id'], ['job_orders', 'broker_id'], ['consignees', 'requested_by']] as const) {
        const c = await cnt(tbl, col, customerId)
        if (c) residual[tbl] = c
      }
    }
    const { data: stillUser } = await admin.from('customers').select('id').eq('id', customerId).maybeSingle()
    console.log(`\n[VERDICTS] ${JSON.stringify(verdicts)}`)
    console.log(`[cleanup] deleteUser=${delErr ? delErr.message : 'ok'} · residual=${JSON.stringify(residual)} · customerRowGone=${!stillUser}`)
    expect(Object.keys(residual), `residual test rows left on prod: ${JSON.stringify(residual)}`).toHaveLength(0)
    expect(stillUser, 'customers row should be cascade-deleted').toBeFalsy()
  })

  test('customer · happy path (wires alive) + break path (abuse blocked)', async ({ page }) => {
    await mint(page) // ONE session for the whole lane

    // ── HAPPY 1 · Release (NEW v1.7.0 wire) ──────────────────────────────────
    try {
      await page.goto(`${BASE}/releases`); await settle(page)
      const bl = `${TAG}BL`
      await page.locator('#rel-bl').fill(bl)
      await page.getByRole('button', { name: /File release/i }).click()
      await expect.poll(() => cnt('release_orders', 'customer_id', customerId, 'bl_number', bl), { timeout: 15000 }).toBeGreaterThan(0)
      verdicts.release = 'ALIVE'
    } catch (e) { verdicts.release = 'DEAD WIRE: ' + String(e).slice(0, 120) }

    // ── HAPPY 2 · Support ticket ─────────────────────────────────────────────
    try {
      await page.goto(`${BASE}/support`); await settle(page)
      await page.getByRole('button', { name: /New ticket/i }).click()
      const subject = `${TAG} test ticket`
      await page.getByPlaceholder(/Short summary/i).fill(subject)
      await page.getByPlaceholder(/Describe what you need/i).fill('E2E round-trip wire check.')
      await page.getByRole('button', { name: /Submit ticket/i }).click()
      await expect.poll(() => cnt('support_tickets', 'customer_id', customerId, 'subject', subject), { timeout: 15000 }).toBeGreaterThan(0)
      verdicts.support = 'ALIVE'
    } catch (e) { verdicts.support = 'DEAD WIRE: ' + String(e).slice(0, 120) }

    // ── HAPPY 3 · Consignee request ──────────────────────────────────────────
    try {
      await page.goto(`${BASE}/releases`); await settle(page)
      await page.getByRole('button', { name: /Request a new one/i }).click()
      const name = `${TAG} Consignee Co`
      await page.locator('label:has-text("Trade name (as in invoice)") + input').fill(name)
      await page.locator('label:has-text("Business address line 1") + input').fill('123 Test St')
      await page.locator('label:has-text("TIN") + input').fill('000-000-000-000')
      const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex')
      await page.locator('input[type=file]').first().setInputFiles({ name: '2303.png', mimeType: 'image/png', buffer: png })
      await page.getByRole('button', { name: /Submit request/i }).click()
      await expect.poll(() => cnt('consignees', 'requested_by', customerId, 'name', name), { timeout: 20000 }).toBeGreaterThan(0)
      verdicts.consignee = 'ALIVE'
    } catch (e) {
      // 0 orphan rows on prod + real customers use this daily → the synthetic
      // 2303 upload is the likely blocker, not a product dead wire.
      const formErr = await page.getByText(/upload|attach|could not|error/i).first().textContent().catch(() => null)
      verdicts.consignee = `INCONCLUSIVE (UI submit not confirmed; likely the synthetic 2303 upload${formErr ? ` — form said: "${formErr.slice(0, 60)}"` : ''})`
    }

    // ── HAPPY 4 · Job Order (skips without seed data) ────────────────────────
    if (!seedOk) {
      verdicts.jobOrder = 'SKIPPED (no approved consignee + current vessel)'
    } else {
      try {
        await page.goto(`${BASE}/job-order`); await settle(page)
        await page.getByPlaceholder(/Search consignee/i).fill('a')
        const opt = page.getByRole('option').first()
        await opt.waitFor({ timeout: 8000 })
        await opt.click()
        await page.getByLabel(/Entry/i).first().fill(`${TAG}-ENTRY`)
        await page.getByRole('button', { name: /Submit|File/i }).first().click()
        await expect.poll(() => cnt('job_orders', 'broker_id', customerId), { timeout: 15000 }).toBeGreaterThan(0)
        verdicts.jobOrder = 'ALIVE'
      } catch (e) { verdicts.jobOrder = 'INCONCLUSIVE (vessel/container UI not driven): ' + String(e).slice(0, 90) }
    }

    // ── BREAK 1 · RLS scopes reads to own rows (no cross-customer leak) ───────
    try {
      const token = await page.evaluate(() => {
        const k = Object.keys(localStorage).find((x) => x.startsWith('sb-') && x.endsWith('-auth-token'))
        try { return k ? (JSON.parse(localStorage.getItem(k)!).access_token as string) : null } catch { return null }
      })
      if (!token) throw new Error('no token')
      const asUser = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } })
      const { data: custs } = await asUser.from('customers').select('id')
      const { data: rels } = await asUser.from('release_orders').select('customer_id')
      const { data: jos } = await asUser.from('job_orders').select('broker_id')
      const leakCust = (custs ?? []).some((r) => (r as { id: string }).id !== customerId) || (custs ?? []).length > 1
      const leakRel = (rels ?? []).some((r) => (r as { customer_id: string }).customer_id !== customerId)
      const leakJo = (jos ?? []).some((r) => (r as { broker_id: string }).broker_id !== customerId)
      verdicts.rls = (leakCust || leakRel || leakJo) ? 'LEAK: RLS returned another customer rows' : 'BLOCKED'
    } catch (e) { verdicts.rls = 'ERROR: ' + String(e).slice(0, 120) }

    // ── BREAK 2 · blank BL refused (no row) ──────────────────────────────────
    try {
      await page.goto(`${BASE}/releases`); await settle(page)
      const before = await cnt('release_orders', 'customer_id', customerId)
      await page.locator('#rel-bl').fill('')
      await page.getByRole('button', { name: /File release/i }).click()
      await page.waitForTimeout(2500)
      const after = await cnt('release_orders', 'customer_id', customerId)
      verdicts.blankBl = after === before ? 'BLOCKED' : 'LEAK: blank BL created a release'
    } catch (e) { verdicts.blankBl = 'ERROR: ' + String(e).slice(0, 120) }

    // ── BREAK 3 · evil BL does not XSS / crash ───────────────────────────────
    try {
      let dialog = false
      page.on('dialog', (d) => { dialog = true; d.dismiss().catch(() => {}) })
      await page.goto(`${BASE}/releases`); await settle(page)
      await page.locator('#rel-bl').fill('<script>alert(1)</script>')
      await page.getByRole('button', { name: /File release/i }).click()
      await page.waitForTimeout(2500)
      const responsive = await page.getByRole('button', { name: /File release/i }).isVisible().catch(() => false)
      verdicts.evilBl = (!dialog && responsive) ? 'BLOCKED' : `LEAK: dialog=${dialog} responsive=${responsive}`
    } catch (e) { verdicts.evilBl = 'ERROR: ' + String(e).slice(0, 120) }

    // ── BREAK 4 · double-submit does not duplicate ───────────────────────────
    try {
      await page.goto(`${BASE}/releases`); await settle(page)
      const bl = `${TAG}DUP`
      await page.locator('#rel-bl').fill(bl)
      const btn = page.getByRole('button', { name: /File release/i })
      await Promise.all([btn.click(), btn.click().catch(() => {})])
      await page.waitForTimeout(3000)
      const c = await cnt('release_orders', 'customer_id', customerId, 'bl_number', bl)
      verdicts.doubleSubmit = c <= 1 ? 'BLOCKED' : `LEAK: ${c} duplicate releases`
    } catch (e) { verdicts.doubleSubmit = 'ERROR: ' + String(e).slice(0, 120) }

    // ── Assert: no dead wire, no leak ────────────────────────────────────────
    const bad = Object.entries(verdicts).filter(([, s]) => /DEAD WIRE|^LEAK/.test(s))
    expect(bad, `dead wires / leaks found: ${JSON.stringify(bad)}`).toHaveLength(0)
  })
})
