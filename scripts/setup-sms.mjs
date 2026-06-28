// Deploy + configure the send-sms Edge Function, end to end:
//   1. deploys supabase/functions/send-sms via the Management API
//   2. sets the function secrets (gateway creds + the shared trigger secret)
//   3. stores the function URL + secret in Vault so the notifications trigger
//      (migration 0193, sms_on_notification) starts firing texts
//
// Reads from the gitignored .env.local:
//   SUPABASE_ACCESS_TOKEN=sbp_...                 (required — a PERSONAL token)
//   VITE_SUPABASE_URL=https://<ref>.supabase.co   (required)
//   DATABASE_URL=postgres://...                   (required, for the Vault step)
//   SMS_GATEWAY_URL=https://api.sms-gate.app      (optional; default = free cloud relay)
//   SMS_GATEWAY_USER=<from the phone app>         (optional on first run)
//   SMS_GATEWAY_PASS=<from the phone app>         (optional on first run)
//   SMS_SECRET=<any random string>                (optional; generated if absent)
//
// Without SMS_GATEWAY_USER/PASS the function still deploys and answers "gateway
// not configured"; and the trigger stays a silent no-op until this script has
// written the Vault rows. So you can run it once now (arms the Vault, dormant)
// and rerun after adding the phone's credentials to .env.local to go live.
//
// One-time gateway setup (manual): install "SMS Gateway for Android" (sms-gate.app)
// on a dedicated phone + SIM kept charged + online, pick Cloud mode (api.sms-gate.app),
// and copy its Basic-auth user/pass into .env.local as SMS_GATEWAY_USER / _PASS.
//
// Usage:  node scripts/setup-sms.mjs
import { readFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const raw = existsSync(path.join(root, '.env.local')) ? readFileSync(path.join(root, '.env.local'), 'utf8') : ''
const get = (k) => {
  const m = raw.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}

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

// 1) Deploy the function (multipart: metadata + source file).
const source = readFileSync(path.join(root, 'supabase/functions/send-sms/index.ts'), 'utf8')
const form = new FormData()
form.append('metadata', JSON.stringify({ name: 'send-sms', entrypoint_path: 'index.ts', verify_jwt: false }))
form.append('file', new Blob([source], { type: 'application/typescript' }), 'index.ts')
const dep = await api('/functions/deploy?slug=send-sms', { method: 'POST', body: form })
if (!dep.ok) { console.error(`deploy failed: ${dep.status} ${await dep.text()}`); process.exit(1) }
console.log('✓ send-sms function deployed')

// 2) Function secrets. SMS_SECRET gates the function (the trigger sends it as
//    x-sms-secret); the gateway creds are optional on a first dormant run.
const smsSecret = get('SMS_SECRET') || randomBytes(24).toString('hex')
const secrets = [{ name: 'SMS_SECRET', value: smsSecret }]
for (const name of ['SMS_GATEWAY_URL', 'SMS_GATEWAY_USER', 'SMS_GATEWAY_PASS']) {
  const v = get(name)
  if (v) secrets.push({ name, value: v })
}
const sec = await api('/secrets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(secrets),
})
if (!sec.ok && sec.status !== 201) { console.error(`secrets failed: ${sec.status} ${await sec.text()}`); process.exit(1) }
console.log(`✓ secrets set (${secrets.map((s) => s.name).join(', ')})`)
if (!get('SMS_GATEWAY_USER') || !get('SMS_GATEWAY_PASS')) {
  console.log('  ⚠ Gateway creds missing — the function answers "gateway not configured" until')
  console.log('    SMS_GATEWAY_USER / SMS_GATEWAY_PASS are in .env.local and this script reruns.')
}

// 3) Vault: arm the notifications trigger (migration 0193) with where + how to call.
const fnUrl = `https://${ref}.supabase.co/functions/v1/send-sms`
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await client.connect()
for (const [name, value] of [['sms_url', fnUrl], ['sms_secret', smsSecret]]) {
  const { rows } = await client.query('select id from vault.secrets where name = $1', [name])
  if (rows.length) await client.query('select vault.update_secret($1, $2)', [rows[0].id, value])
  else await client.query('select vault.create_secret($1, $2)', [value, name])
}
await client.end()
console.log('✓ vault updated — the notifications SMS trigger (migration 0193) is now armed')
console.log(`  Manual test:  curl -X POST ${fnUrl} -H "x-sms-secret: ${smsSecret}" -H "Content-Type: application/json" -d '{"to":["+639XXXXXXXXX"],"message":"KTC test"}'`)
