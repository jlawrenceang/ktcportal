// Deploy + configure the Web Push pipeline, end to end:
//   1. generates a VAPID keypair + a PUSH_SECRET (or reuses ones in .env.local)
//   2. deploys supabase/functions/send-push via the Management API
//   3. sets the function secrets (VAPID_* + PUSH_SECRET — never touches the
//      shared CRON_SECRET, so boc-mirror / vessel-sync keep working)
//   4. stores push_url + push_secret in Vault (the 0114 triggers read these)
//   5. publishes the VAPID PUBLIC key into public.push_config so the browser
//      can subscribe without a build-time env var
//
// Reads from the gitignored .env.local:
//   SUPABASE_ACCESS_TOKEN, VITE_SUPABASE_URL, DATABASE_URL   (required)
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / PUSH_SECRET       (optional; generated + appended if absent)
//   VAPID_SUBJECT                                            (optional; defaults to mailto:portal@ktcterminal.com)
//
// Usage:  node scripts/setup-push.mjs
import { readFileSync, existsSync, appendFileSync } from 'node:fs'
import { randomBytes, createECDH } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, '.env.local')
const raw = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
const get = (k) => {
  const m = raw.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const token = get('SUPABASE_ACCESS_TOKEN')
const url = get('VITE_SUPABASE_URL')
const dbUrl = get('DATABASE_URL')
if (!token || !url || !dbUrl) {
  console.error('Need SUPABASE_ACCESS_TOKEN, VITE_SUPABASE_URL and DATABASE_URL in .env.local')
  process.exit(1)
}
const ref = new URL(url).host.split('.')[0]
const api = (p, init = {}) =>
  fetch(`https://api.supabase.com/v1/projects/${ref}${p}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  })

// 0) VAPID keys + PUSH_SECRET — reuse from .env.local or generate (and append).
let vapidPublic = get('VAPID_PUBLIC_KEY')
let vapidPrivate = get('VAPID_PRIVATE_KEY')
let pushSecret = get('PUSH_SECRET')
const subject = get('VAPID_SUBJECT') || 'mailto:portal@ktcterminal.com'
const toAppend = []
if (!vapidPublic || !vapidPrivate) {
  const ec = createECDH('prime256v1')
  ec.generateKeys()
  vapidPublic = b64url(ec.getPublicKey()) // 65-byte uncompressed point
  const priv = ec.getPrivateKey()
  const padded = Buffer.concat([Buffer.alloc(32 - priv.length, 0), priv]).subarray(-32) // left-pad to 32
  vapidPrivate = b64url(padded)
  toAppend.push(`VAPID_PUBLIC_KEY=${vapidPublic}`, `VAPID_PRIVATE_KEY=${vapidPrivate}`)
  console.log('✓ generated VAPID keypair')
}
if (!pushSecret) {
  pushSecret = randomBytes(24).toString('hex')
  toAppend.push(`PUSH_SECRET=${pushSecret}`)
  console.log('✓ generated PUSH_SECRET')
}
if (toAppend.length) {
  appendFileSync(envPath, (raw.endsWith('\n') ? '' : '\n') + toAppend.join('\n') + '\n')
  console.log(`✓ appended ${toAppend.length} value(s) to .env.local`)
}

// 1) Deploy the function.
const source = readFileSync(path.join(root, 'supabase/functions/send-push/index.ts'), 'utf8')
const form = new FormData()
form.append('metadata', JSON.stringify({ name: 'send-push', entrypoint_path: 'index.ts', verify_jwt: false }))
form.append('file', new Blob([source], { type: 'application/typescript' }), 'index.ts')
const dep = await api('/functions/deploy?slug=send-push', { method: 'POST', body: form })
if (!dep.ok) { console.error(`deploy failed: ${dep.status} ${await dep.text()}`); process.exit(1) }
console.log('✓ send-push function deployed')

// 2) Function secrets (NEVER include CRON_SECRET — that's shared project-wide).
const secrets = [
  { name: 'PUSH_SECRET', value: pushSecret },
  { name: 'VAPID_PUBLIC_KEY', value: vapidPublic },
  { name: 'VAPID_PRIVATE_KEY', value: vapidPrivate },
  { name: 'VAPID_SUBJECT', value: subject },
]
const sec = await api('/secrets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(secrets),
})
if (!sec.ok && sec.status !== 201) { console.error(`secrets failed: ${sec.status} ${await sec.text()}`); process.exit(1) }
console.log(`✓ secrets set (${secrets.map((s) => s.name).join(', ')})`)

// 3) Vault (triggers) + 4) push_config (browser reads the public key).
const fnUrl = `https://${ref}.supabase.co/functions/v1/send-push`
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await client.connect()
for (const [name, value] of [['push_url', fnUrl], ['push_secret', pushSecret]]) {
  const { rows } = await client.query('select id from vault.secrets where name = $1', [name])
  if (rows.length) await client.query('select vault.update_secret($1, $2)', [rows[0].id, value])
  else await client.query('select vault.create_secret($1, $2)', [value, name])
}
await client.query(
  `insert into public.push_config (key, value) values ('vapid_public', $1)
   on conflict (key) do update set value = excluded.value`,
  [vapidPublic],
)
await client.end()
console.log('✓ vault + push_config updated — the 0114 triggers are now armed')
console.log(`  Manual test:  curl -X POST ${fnUrl} -H "x-push-secret: <PUSH_SECRET>" -H "Content-Type: application/json" -d '{"user_ids":[],"title":"t"}'`)
