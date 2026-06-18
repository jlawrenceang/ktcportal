// Deploy + configure the vessel-sync Edge Function (one-way Google Sheet -> app),
// end to end:
//   1. deploys supabase/functions/vessel-sync via the Management API
//   2. sets the function secrets (Google service account + sheet + CRON_SECRET)
//   3. stores the function URL + secret in Vault so the pg_cron job
//      (migration 0107) starts calling it hourly
//
// Reads from the gitignored .env.local:
//   SUPABASE_ACCESS_TOKEN=sbp_...                       (required)
//   VITE_SUPABASE_URL=https://<ref>.supabase.co          (required)
//   DATABASE_URL=postgres://...                          (required, for the Vault step)
//   GOOGLE_SA_EMAIL=...@....iam.gserviceaccount.com      (the SAME service account as boc-mirror)
//   GOOGLE_SA_KEY="-----BEGIN PRIVATE KEY-----\n..."     (PKCS8 PEM, \n-escaped)
//   VESSEL_SHEET_ID=<the long id from the vessel Sheet URL>
//   VESSEL_CRON_SECRET=<any random string>               (optional; generated if absent)
//
// One-time Google setup (manual): reuse the boc-mirror service account (or make
// one + enable the Google Sheets API + create a JSON key). SHARE the vessel
// Sheet with the service-account email as EDITOR (the function writes the
// computed Last Free Day back into the sheet). The sheet's first row must be
// the headers: vessel_visit, vessel_name, voyage_number (required) +
// shipping_line, actual_arrival, finish_discharging, berth, remarks, cancelled.
//
// Usage:  node scripts/setup-vessel-sync.mjs
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

// 1) Deploy the function.
const source = readFileSync(path.join(root, 'supabase/functions/vessel-sync/index.ts'), 'utf8')
const form = new FormData()
form.append('metadata', JSON.stringify({ name: 'vessel-sync', entrypoint_path: 'index.ts', verify_jwt: false }))
form.append('file', new Blob([source], { type: 'application/typescript' }), 'index.ts')
const dep = await api('/functions/deploy?slug=vessel-sync', { method: 'POST', body: form })
if (!dep.ok) { console.error(`deploy failed: ${dep.status} ${await dep.text()}`); process.exit(1) }
console.log('✓ vessel-sync function deployed')

// 2) Function secrets. Use a PER-FUNCTION secret name (VESSEL_CRON_SECRET) so a
//    rerun never clobbers boc-mirror's secret — the function reads
//    VESSEL_CRON_SECRET ?? CRON_SECRET. (Avoids the project-wide-CRON_SECRET gotcha.)
const cronSecret = get('VESSEL_CRON_SECRET') || randomBytes(24).toString('hex')
const secrets = [{ name: 'VESSEL_CRON_SECRET', value: cronSecret }]
for (const [env, name] of [['GOOGLE_SA_EMAIL', 'GOOGLE_SA_EMAIL'], ['GOOGLE_SA_KEY', 'GOOGLE_SA_KEY'], ['VESSEL_SHEET_ID', 'VESSEL_SHEET_ID']]) {
  const v = get(env)
  if (v) secrets.push({ name, value: v })
}
const sec = await api('/secrets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(secrets),
})
if (!sec.ok && sec.status !== 201) { console.error(`secrets failed: ${sec.status} ${await sec.text()}`); process.exit(1) }
console.log(`✓ secrets set (${secrets.map((s) => s.name).join(', ')})`)
if (secrets.length < 4) {
  console.log('  ⚠ Google values missing — the sync will answer "not configured" until')
  console.log('    GOOGLE_SA_EMAIL / GOOGLE_SA_KEY / VESSEL_SHEET_ID are in .env.local and this script reruns.')
}

// 3) Vault: tell the pg_cron job (0107) where to call.
const fnUrl = `https://${ref}.supabase.co/functions/v1/vessel-sync`
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await client.connect()
for (const [name, value] of [['vessel_sync_url', fnUrl], ['vessel_sync_secret', cronSecret]]) {
  const { rows } = await client.query('select id from vault.secrets where name = $1', [name])
  if (rows.length) await client.query('select vault.update_secret($1, $2)', [rows[0].id, value])
  else await client.query('select vault.create_secret($1, $2)', [value, name])
}
await client.end()
console.log('✓ vault updated — the hourly cron (migration 0107) is now armed')
console.log(`  Manual test:  curl -X POST ${fnUrl} -H "x-cron-secret: <VESSEL_CRON_SECRET>"`)
