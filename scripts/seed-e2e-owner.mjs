import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const PROD_REF = 'mdlnfhyylvapzdubhyic'
const OWNER_EMAIL = (process.env.E2E_OWNER_EMAIL || 'jlawrenceang@gmail.com').toLowerCase()
const OWNER_NAME = process.env.E2E_OWNER_NAME || 'KTC Owner'

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || process.env[m[1]] !== undefined) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}

function refFromUrl(url, fallback = 'unknown') {
  try { return new URL(url).host.split('.')[0] || fallback } catch { return fallback }
}

function refFromDatabaseUrl(connStr, fallback = 'unknown') {
  try {
    const u = new URL(connStr)
    const host = u.hostname
    if (host.startsWith('db.') && host.endsWith('.supabase.co')) {
      return host.split('.')[1] || fallback
    }
    const user = decodeURIComponent(u.username || '')
    const m = user.match(/^postgres\.([a-z0-9]{20})$/i)
    if (m) return m[1]
    return fallback
  } catch {
    return fallback
  }
}

async function openClient(label, connStr) {
  const txn = connStr.replace(':5432', ':6543')
  const tries = txn !== connStr ? [['6543', txn], ['5432', connStr]] : [[new URL(connStr).port || 'default', connStr]]
  for (const [port, u] of tries) {
    const client = new pg.Client({ connectionString: u, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 })
    try {
      await client.connect()
      console.log(`${label}: connected on :${port}`)
      return client
    } catch (e) {
      console.log(`${label}: :${port} connect failed - ${e.message}`)
    }
  }
  throw new Error(`${label}: could not connect to the database on either pooler port.`)
}

async function findAuthUserByEmail(admin, email) {
  const perPage = 1000
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const found = data.users.find((u) => u.email?.toLowerCase() === email)
    if (found) return found
    if (data.users.length < perPage) return null
  }
  throw new Error(`Could not find ${email}; auth user list exceeded the scan limit.`)
}

async function ensureAuthOwner(admin, email) {
  const existing = await findAuthUserByEmail(admin, email)
  const password = process.env.E2E_OWNER_PASSWORD
  if (existing) {
    if (password) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
      if (error) throw error
      console.log('auth owner: exists; password refreshed from E2E_OWNER_PASSWORD')
    } else {
      console.log('auth owner: exists; password left unchanged')
    }
    return existing
  }

  const randomPassword = `ktc-e2e-${randomUUID()}`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: password || randomPassword,
    email_confirm: true,
    user_metadata: { full_name: OWNER_NAME },
  })
  if (error) throw error
  console.log(password
    ? 'auth owner: created; password set from E2E_OWNER_PASSWORD'
    : 'auth owner: created with a random password; set E2E_OWNER_PASSWORD and rerun if you need password login')
  return data.user
}

loadEnvFile('.env.local')
loadEnvFile('.env.migrate')
loadEnvFile('.env')

const e2eUrl = process.env.E2E_SUPABASE_URL
const e2eDbUrl = process.env.E2E_DATABASE_URL
const e2eServiceRole = process.env.E2E_SERVICE_ROLE_KEY || process.env.E2E_SUPABASE_SERVICE_ROLE_KEY
const e2eRef = refFromUrl(e2eUrl || '')
const e2eDbRef = refFromDatabaseUrl(e2eDbUrl || '')
const liveRef = refFromUrl(process.env.VITE_SUPABASE_URL || '')

if (!e2eUrl || !e2eDbUrl || !e2eServiceRole) {
  console.error('Missing E2E_SUPABASE_URL / E2E_DATABASE_URL / E2E_SERVICE_ROLE_KEY. Fill .env.local first.')
  process.exit(1)
}
if (e2eRef === PROD_REF || e2eDbRef === PROD_REF || e2eDbRef === 'unknown' || e2eDbRef !== e2eRef) {
  console.error(`Refusing to seed owner: E2E target mismatch or production target (url ref=${e2eRef}, db ref=${e2eDbRef}).`)
  process.exit(1)
}

console.log(`live ref: ${liveRef}`)
console.log(`e2e ref : ${e2eRef}`)
console.log(`e2e db  : ${e2eDbRef}`)
console.log(`owner   : ${OWNER_EMAIL}`)

const admin = createClient(e2eUrl, e2eServiceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const user = await ensureAuthOwner(admin, OWNER_EMAIL)
if (!user?.id) throw new Error('Owner auth user has no id.')

const e2e = await openClient('e2e owner seed', e2eDbUrl)

try {
  await e2e.query('begin')
  const matches = await e2e.query(
    `select id, user_id, email, is_owner, is_root_owner
       from public.customers
      where user_id = $1
         or lower(coalesce(email, '')) = $2
      order by created_at asc`,
    [user.id, OWNER_EMAIL],
  )
  if (matches.rows.length > 1) {
    throw new Error(`Multiple customer rows match ${OWNER_EMAIL}/${user.id}; resolve duplicates before seeding owner.`)
  }

  await e2e.query('alter table public.customers disable trigger brokers_guard')
  await e2e.query('update public.customers set is_root_owner = false where is_root_owner and user_id <> $1', [user.id])

  let row
  if (matches.rows.length === 1) {
    row = (await e2e.query(
      `update public.customers
          set user_id = $1,
              email = $2,
              full_name = coalesce(nullif(full_name, ''), $3),
              contact_number = coalesce(contact_number, ''),
              is_admin = true,
              is_owner = true,
              is_root_owner = true,
              status = 'approved',
              staff_role = null,
              decided_at = coalesce(decided_at, now()),
              email_confirmed_at = coalesce(email_confirmed_at, now())
        where id = $4
        returning id, user_id, email, status, is_admin, is_owner, is_root_owner`,
      [user.id, OWNER_EMAIL, OWNER_NAME, matches.rows[0].id],
    )).rows[0]
  } else {
    row = (await e2e.query(
      `insert into public.customers
        (user_id, email, full_name, contact_number, is_admin, is_owner, is_root_owner, status, decided_at, email_confirmed_at)
       values
        ($1, $2, $3, '', true, true, true, 'approved', now(), now())
       returning id, user_id, email, status, is_admin, is_owner, is_root_owner`,
      [user.id, OWNER_EMAIL, OWNER_NAME],
    )).rows[0]
  }

  await e2e.query('alter table public.customers enable trigger brokers_guard')
  await e2e.query('commit')

  console.log('customer owner row:', JSON.stringify(row))
} catch (e) {
  try { await e2e.query('rollback') } catch { /* ignored */ }
  throw e
} finally {
  await e2e.end()
}
