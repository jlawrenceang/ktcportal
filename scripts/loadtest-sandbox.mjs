// Sandbox read-load harness. Signs in as the seeded customer + staff accounts and
// fires concurrent RLS-scoped reads against core paths (vessel schedule, job orders),
// reporting latency percentiles + throughput. Read-only; SANDBOX ONLY (hard-guarded).
//
// Usage: node scripts/loadtest-sandbox.mjs [totalRequests] [concurrency]
//   e.g. node scripts/loadtest-sandbox.mjs 2000 50
//
// Requires seeded sandbox accounts (see the e2e account seed) + E2E_TEST_PASSWORD
// (defaults to the seed's KtcSandbox2026!). The single-IP GoTrue session-minting
// ceiling is a known test-rig limit — this harness mints a few sessions up front and
// reuses their tokens for the read load, so it measures READ scaling, not auth.
import { existsSync, readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { createClient } from '@supabase/supabase-js'

const PROD_REF = 'mdlnfhyylvapzdubhyic', SANDBOX_REF = 'zwvzadkgeyhkhyshkwhc'
function loadEnv(p) {
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || process.env[m[1]] !== undefined) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}
loadEnv('.env.local'); loadEnv('.env')

const url = process.env.E2E_SUPABASE_URL
const anon = process.env.E2E_PUBLISHABLE_KEY
const pw = process.env.E2E_TEST_PASSWORD || 'KtcSandbox2026!'
if (!url || !anon) { console.error('Missing E2E_SUPABASE_URL / E2E_PUBLISHABLE_KEY'); process.exit(1) }
const ref = (() => { try { return new URL(url).host.split('.')[0] } catch { return null } })()
if (ref === PROD_REF || ref !== SANDBOX_REF) { console.error(`REFUSING: url ref ${ref} is not the sandbox`); process.exit(3) }

const TOTAL = Number(process.argv[2] || 2000)
const CONCURRENCY = Number(process.argv[3] || 50)

async function signIn(email) {
  const c = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: pw })
  if (error) { console.error(`sign-in failed for ${email}: ${error.message}`); return null }
  return c
}
const custa = await signIn('custa@sandbox.ktc.test')
const admin = await signIn('admin@ktc-staff.local')
const clients = [['custa', custa], ['admin', admin]].filter(([, c]) => c)
if (!clients.length) { console.error('No sessions minted — cannot load test.'); process.exit(1) }
console.log(`sessions: ${clients.map(([n]) => n).join(', ')}`)

const queries = [
  ['vessels', (c) => c.from('vessel_schedule_v').select('vessel_visit,vessel_name,voyage_number').eq('is_current', true).limit(20)],
  ['orders',  (c) => c.from('job_orders').select('id,jo_number,status').limit(20)],
]

const lat = []
let ok = 0, err = 0, done = 0
async function oneRequest() {
  const [, client] = clients[done % clients.length]
  const [, qfn] = queries[done % queries.length]
  const t0 = performance.now()
  try {
    const { error } = await qfn(client)
    const dt = performance.now() - t0
    lat.push(dt)
    if (error) err++; else ok++
  } catch { err++; lat.push(performance.now() - t0) }
}
async function worker() { while (done < TOTAL) { done++; await oneRequest() } }

console.log(`load: ${TOTAL} requests @ concurrency ${CONCURRENCY} vs sandbox ${ref} ...`)
const start = performance.now()
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
const wall = (performance.now() - start) / 1000

lat.sort((a, b) => a - b)
const pct = (p) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(p / 100 * lat.length))].toFixed(0) : 'n/a'
const avg = lat.length ? (lat.reduce((a, b) => a + b, 0) / lat.length).toFixed(0) : 'n/a'
console.log('\n===== load result =====')
console.log(`requests   : ${ok + err} (ok ${ok} / err ${err}, ${((err / (ok + err)) * 100).toFixed(1)}% err)`)
console.log(`wall time  : ${wall.toFixed(1)}s`)
console.log(`throughput : ${((ok + err) / wall).toFixed(0)} req/s`)
console.log(`latency ms : p50 ${pct(50)} · p90 ${pct(90)} · p95 ${pct(95)} · p99 ${pct(99)} · avg ${avg} · max ${lat.length ? lat[lat.length - 1].toFixed(0) : 'n/a'}`)
