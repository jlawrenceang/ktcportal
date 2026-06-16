// TEMP load test v4 — write burst @500 (full roster) + READ RAMP to 3000.
// Re-run after the trigram index (0106): ANALYZE after seed so the planner uses it.
// Usage: node scripts/_tmp_loadtest.mjs <nCustomers> <writesPerCustomer> <nConsignees>
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => { const m = env.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.*)\\s*$', 'm')); if (!m) return null; let v = m[1].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return v }
const URL = get('VITE_SUPABASE_URL'), ANON = get('VITE_SUPABASE_ANON_KEY'), SVC = get('SUPABASE_SERVICE_ROLE_KEY'), DB = get('DATABASE_URL')
const NCUST = +(process.argv[2] || 50), PERUSER = +(process.argv[3] || 10), NCONS = +(process.argv[4] || 6000)
const LEVELS = [200, 500, 1000, 1500, 2000, 2500, 3000]
const ROSTER = { checker: 2, operations: 8, admin: 4, cashier: 8, csr: 2 }
const DOMAIN = 'ktctest.invalid', PW = 'LoadTest!12345', MINT_GAP = 2200, REQ_TIMEOUT = 45000
const admin = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } })
const db = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]) }
const withTimeout = (pr, ms) => Promise.race([pr, new Promise((res) => setTimeout(() => res({ error: { message: `timeout>${ms}ms`, __to: true } }), ms))])
async function pmap(items, conc, fn) { const out = []; let i = 0; const w = async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) } }; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, w)); return out }

async function mint(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw new Error('generateLink ' + error.message)
  const th = data.properties?.hashed_token; if (!th) throw new Error('no hashed_token')
  const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  let r = await anon.auth.verifyOtp({ token_hash: th, type: 'magiclink' })
  if (r.error) r = await anon.auth.verifyOtp({ token_hash: th, type: 'email' })
  if (r.error) throw new Error('verifyOtp ' + r.error.message)
  return r.data.session.access_token
}
const userClient = (token) => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } })

async function cleanup(tag) {
  const w = `(select id from public.customers where email like 'lt\\_%@${DOMAIN}')`
  const j = `(select jo.id from public.job_orders jo where jo.customer_id in ${w})`
  for (const q of [`delete from public.serving_numbers where job_order_id in ${j}`, `delete from public.service_completions where job_order_id in ${j}`, `delete from public.job_order_events where job_order_id in ${j}`, `delete from public.job_order_lines where job_order_id in ${j}`, `delete from public.job_orders where customer_id in ${w}`, `delete from public.consignees where name like 'LOADTEST %'`, `delete from public.vessel_schedule where vessel_visit like 'LOADTEST-%'`]) await db.query(q)
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const victims = (list?.users || []).filter((u) => (u.email || '').endsWith('@' + DOMAIN))
  for (const u of victims) await admin.auth.admin.deleteUser(u.id)
  console.log(`[${tag}] removed ${victims.length} auth user(s) + their data`)
}

await db.connect()
const t0 = Date.now()
try {
  console.log(`LOAD TEST v4 @ ${new Date().toISOString()} — write ${NCUST}×${PERUSER}=${NCUST * PERUSER}; read ramp ${LEVELS.join('/')}; ${NCONS} consignees (WITH trigram index)`)
  await cleanup('pre-clean')
  await db.query(`insert into public.consignees (name) select 'LOADTEST Consignee ' || g from generate_series(1,$1) g`, [NCONS])
  await db.query(`analyze public.consignees`) // so the planner uses the trigram index on fresh data
  await db.query(`insert into public.vessel_schedule (vessel_visit, vessel_name, voyage_number) values ('LOADTEST-V1','LOADTEST VESSEL','001E') on conflict do nothing`)
  const consPool = (await db.query(`select id from public.consignees where name like 'LOADTEST %' order by random() limit 1000`)).rows.map((r) => r.id)
  console.log(`seeded ${NCONS} consignees (analyzed) + 1 vessel`)

  const spec = [...Array(NCUST).keys()].map((i) => ({ email: `lt_c${i}@${DOMAIN}`, role: null, meta: { full_name: `Cust ${i}`, contact_number: '09170000000' } }))
  for (const [role, n] of Object.entries(ROSTER)) for (let i = 0; i < n; i++) spec.push({ email: `lt_${role}${i}@${DOMAIN}`, role, meta: { full_name: `${role} ${i}` } })
  await pmap(spec, 8, async (s) => { try { await admin.auth.admin.createUser({ email: s.email, password: PW, email_confirm: true, user_metadata: s.meta }) } catch (e) { /* ignore */ } })
  await db.query(`update public.customers set status='approved' where email like 'lt\\_c%@${DOMAIN}'`)
  for (const role of Object.keys(ROSTER)) await db.query(`update public.customers set staff_role=$1, status='approved' where email like $2`, [role, `lt\\_${role}%@${DOMAIN}`])

  console.log(`minting ${spec.length} sessions (paced ~${MINT_GAP}ms) ...`)
  const minted = []
  for (const s of spec) { let tok = null; for (let a = 0; a < 6; a++) { try { tok = await mint(s.email); break } catch (e) { if (/rate|429|limit|too many|request/i.test(String(e.message))) await sleep(12000); else break } } if (tok) minted.push({ email: s.email, role: s.role, token: tok }); await sleep(MINT_GAP); if (minted.length % 25 === 0) console.log(`  minted ${minted.length}/${spec.length}`) }
  const customers = minted.filter((u) => !u.role)
  const staff = {}; for (const role of Object.keys(ROSTER)) staff[role] = minted.filter((u) => u.role === role)
  const approvers = [...(staff.operations || []), ...(staff.admin || [])]
  const custClients = customers.map((u) => userClient(u.token))
  console.log(`minted ${minted.length}/${spec.length} — customers ${customers.length} · approvers ${approvers.length} · checkers ${(staff.checker || []).length} · cashiers ${(staff.cashier || []).length} · csr ${(staff.csr || []).length}`)
  if (!customers.length) throw new Error('no customer sessions minted')

  // ============ PHASE A: WRITE BURST + STAFF ============
  const tasks = []; for (const u of customers) for (let k = 0; k < PERUSER; k++) tasks.push({ u, k })
  console.log(`\n--- PHASE A: ${tasks.length} concurrent filings + full staff roster ---`)
  let done = false
  const m = { apOk: 0, apLat: [], apCon: 0, apFail: 0, xrOk: 0, xrLat: [], xrCon: 0, xrFail: 0, payOk: 0, payLat: [], payCon: 0, payFail: 0, csr: 0 }
  const benign = (s) => /not in|already|state|found|permission|two-gate|cannot complete|confirmed|accepted|submitted or on|no longer/i.test(s)
  async function approverW(st) { const c = userClient(st.token); for (;;) { const { data, error } = await withTimeout(c.from('job_orders').select('id').eq('status', 'submitted').limit(12), REQ_TIMEOUT); if (error || !data) { if (done) return; await sleep(60); continue } if (!data.length) { if (done) return; await sleep(40); continue } await Promise.all(data.map(async (r) => { const s = Date.now(); const { error: e } = await withTimeout(c.rpc('staff_transition_order', { p_id: r.id, p_status: 'processing', p_note: null, p_recoverable: null }), REQ_TIMEOUT); if (!e) { m.apOk++; m.apLat.push(Date.now() - s) } else if (benign(e.message)) m.apCon++; else { m.apFail++; if (m.apFail <= 2) console.log('  approve FAIL:', e.message.slice(0, 80)) } })) } }
  async function checkerW(st) { const c = userClient(st.token); for (;;) { const { data: jos } = await withTimeout(c.from('job_orders').select('id').eq('status', 'processing').limit(8), REQ_TIMEOUT); if (!jos || !jos.length) { if (done) return; await sleep(50); continue } const { data: lines } = await withTimeout(c.from('job_order_lines').select('id').in('job_order_id', jos.map((j) => j.id)).is('xray_done_at', null).limit(20), REQ_TIMEOUT); if (!lines || !lines.length) { if (done) return; await sleep(50); continue } await Promise.all(lines.map(async (l) => { const s = Date.now(); const { error: e } = await withTimeout(c.rpc('record_van_xray', { p_line_id: l.id }), REQ_TIMEOUT); if (!e) { m.xrOk++; m.xrLat.push(Date.now() - s) } else if (benign(e.message)) m.xrCon++; else m.xrFail++ })) } }
  async function cashierW(st) { const c = userClient(st.token); for (;;) { const { data } = await withTimeout(c.from('job_orders').select('id').eq('status', 'processing').eq('payment_status', 'unpaid').limit(8), REQ_TIMEOUT); if (!data || !data.length) { if (done) return; await sleep(50); continue } await Promise.all(data.map(async (r) => { const s = Date.now(); const { error: e } = await withTimeout(c.rpc('record_office_payment', { p_id: r.id, p_kind: 'base', p_note: 'lt' }), REQ_TIMEOUT); if (!e) { m.payOk++; m.payLat.push(Date.now() - s) } else if (benign(e.message)) m.payCon++; else m.payFail++ })) } }
  async function csrW(st) { const c = userClient(st.token); for (;;) { await withTimeout(c.from('support_tickets').select('id').limit(10), REQ_TIMEOUT); m.csr++; if (done) return; await sleep(80) } }
  const wp = Promise.all([...approvers.map(approverW), ...(staff.checker || []).map(checkerW), ...(staff.cashier || []).map(cashierW), ...(staff.csr || []).map(csrW)])
  const burst0 = Date.now()
  const results = await Promise.all(tasks.map(async ({ u, k }, n) => { const c = userClient(u.token), s = Date.now(); const { error } = await withTimeout(c.rpc('file_job_order', { p_consignee: consPool[n % consPool.length], p_entry_number: `C${n}-${u.email.slice(3, 8)}`, p_vessel_visit: 'LOADTEST-V1', p_vessel_name: 'LOADTEST VESSEL', p_voyage_number: '001E', p_lines: [{ container_number: `LT${String(n).padStart(7, '0')}`, service_request: 'X-Ray' }, ...(k % 2 ? [{ container_number: `LT${String(n).padStart(6, '0')}B`, service_request: 'X-Ray' }] : [])] }), REQ_TIMEOUT); return { ms: Date.now() - s, ok: !error, err: error?.message } }))
  const burstMs = Date.now() - burst0; done = true; await wp
  const ok = results.filter((r) => r.ok), errs = results.filter((r) => !r.ok), lat = ok.map((r) => r.ms)
  console.log(`  filing: ${tasks.length} concurrent · wall ${burstMs}ms · ${(results.length / (burstMs / 1000)).toFixed(0)} req/s · ok ${ok.length} · err ${errs.length} · lat p50 ${pct(lat, 50)} p95 ${pct(lat, 95)} p99 ${pct(lat, 99)} max ${Math.max(0, ...lat)}`)
  if (errs.length) { const b = {}; errs.forEach((e) => { const k = (e.err || '').slice(0, 60); b[k] = (b[k] || 0) + 1 }); console.log('  filing errors:', JSON.stringify(b)) }
  console.log(`  staff: approvals ok ${m.apOk}/con ${m.apCon}/fail ${m.apFail} (p95 ${pct(m.apLat, 95)}) · xray ok ${m.xrOk}/fail ${m.xrFail} (p95 ${pct(m.xrLat, 95)}) · pay ok ${m.payOk}/fail ${m.payFail} (p95 ${pct(m.payLat, 95)})`)
  const dup = (await db.query(`select serving_no from public.serving_numbers where week_start=public.serving_week() group by serving_no having count(*)>1`)).rows
  const overcap = (await db.query(`select jo.customer_id from public.job_orders jo join public.customers c on c.id=jo.customer_id where c.email like 'lt\\_c%@${DOMAIN}' and jo.status in ('submitted','processing') group by jo.customer_id having count(*)>10`)).rows
  console.log(`  integrity: duplicate serving numbers ${dup.length ? '❌ ' + dup.length : '✓ 0'} · over-cap customers ${overcap.length ? '❌ ' + overcap.length : '✓ 0'}`)

  // ============ PHASE B: READ RAMP ============
  console.log(`\n--- PHASE B: concurrent read ramp (page-load mix incl. consignee search) across ${custClients.length} sessions ---`)
  for (const L of LEVELS) {
    const s0 = Date.now()
    const rr = await Promise.all([...Array(L)].map(async (_, n) => {
      const c = custClients[n % custClients.length], s = Date.now(); const kind = n % 4
      const q = kind === 0 ? c.from('consignees').select('id,name,code').ilike('name', `%Consignee ${n % 900}%`).limit(10)
        : kind === 1 ? c.rpc('now_serving')
        : kind === 2 ? c.from('job_orders').select('id,status,jo_number').order('created_at', { ascending: false }).limit(20)
        : c.from('vessel_schedule').select('vessel_visit,vessel_name,voyage_number').limit(50)
      const { error } = await withTimeout(q, REQ_TIMEOUT)
      return { ms: Date.now() - s, ok: !error, to: !!error?.__to, err: error?.message }
    }))
    const wall = Date.now() - s0, okr = rr.filter((r) => r.ok), to = rr.filter((r) => r.to), er = rr.filter((r) => !r.ok && !r.to)
    const rl = okr.map((r) => r.ms)
    console.log(`  ${String(L).padStart(4)} concurrent · wall ${String(wall).padStart(5)}ms · ${String(Math.round(L / (wall / 1000))).padStart(4)} req/s · ok ${okr.length} · timeout ${to.length} · err ${er.length} · lat p50 ${pct(rl, 50)} p95 ${pct(rl, 95)} p99 ${pct(rl, 99)} max ${Math.max(0, ...rl)}`)
    if (er.length) { const b = {}; er.forEach((e) => { const k = (e.err || '').slice(0, 50); b[k] = (b[k] || 0) + 1 }); console.log('       errors:', JSON.stringify(b)) }
    await sleep(2000)
  }
} catch (e) {
  console.error('\nLOAD TEST ERROR:', e.message, (e.stack || '').split('\n')[1] || '')
  process.exitCode = 1
} finally {
  console.log('\ncleaning up ...')
  try { await cleanup('post-clean') } catch (e) { console.error('cleanup error:', e.message) }
  const c = (await db.query(`select (select count(*)::int from public.customers) c,(select count(*)::int from public.consignees) g,(select count(*)::int from public.job_orders) j`)).rows[0]
  console.log(`post-cleanup: customers=${c.c} consignees=${c.g} job_orders=${c.j} (expect 1/0/0)`)
  await db.end()
  console.log(`total elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}
