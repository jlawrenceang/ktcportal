// Deploy + configure the BOC Sheets mirror Edge Function, end to end:
//   1. deploys supabase/functions/boc-mirror via the Management API
//   2. sets the function secrets (Google service account + sheet + CRON_SECRET)
//   3. stores the function URL + secret in Vault so the pg_cron job
//      (migration 0037) starts calling it hourly
//
// Reads from the gitignored .env.local:
//   SUPABASE_ACCESS_TOKEN=sbp_...       (required)
//   VITE_SUPABASE_URL=https://<ref>.supabase.co  (required)
//   DATABASE_URL=postgres://...          (required, for the Vault step)
//   GOOGLE_SA_EMAIL=...@....iam.gserviceaccount.com   (optional on first run)
//   GOOGLE_SA_KEY="-----BEGIN PRIVATE KEY-----\n..."  (optional; \n-escaped)
//   BOC_SHEET_ID=<the long id from the Sheet URL>     (optional)
//   BOC_CRON_SECRET=<any random string>               (optional; generated if absent)
//
// Without the Google values the function still deploys and answers
// "mirror not configured" — rerun this script after adding them.
//
// One-time Google setup (manual): create a Google Cloud service account,
// enable the Google Sheets API, create a JSON key (copy client_email +
// private_key into .env.local), and SHARE the target Sheet with the
// service-account email as Editor.
//
// Usage:  node scripts/setup-boc-mirror.mjs
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
const source = readFileSync(path.join(root, 'supabase/functions/boc-mirror/index.ts'), 'utf8')
const form = new FormData()
form.append('metadata', JSON.stringify({ name: 'boc-mirror', entrypoint_path: 'index.ts', verify_jwt: false }))
form.append('file', new Blob([source], { type: 'application/typescript' }), 'index.ts')
const dep = await api('/functions/deploy?slug=boc-mirror', { method: 'POST', body: form })
if (!dep.ok) { console.error(`deploy failed: ${dep.status} ${await dep.text()}`); process.exit(1) }
console.log('✓ boc-mirror function deployed')

// 2) Function secrets. Use a PER-FUNCTION secret name (BOC_CRON_SECRET) so a
//    rerun never clobbers vessel-sync's secret — the function reads
//    BOC_CRON_SECRET ?? CRON_SECRET. (Avoids the project-wide-CRON_SECRET gotcha.)
const cronSecret = get('BOC_CRON_SECRET') || randomBytes(24).toString('hex')
const secrets = [{ name: 'BOC_CRON_SECRET', value: cronSecret }]
for (const [env, name] of [['GOOGLE_SA_EMAIL', 'GOOGLE_SA_EMAIL'], ['GOOGLE_SA_KEY', 'GOOGLE_SA_KEY'], ['BOC_SHEET_ID', 'BOC_SHEET_ID']]) {
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
  console.log('  ⚠ Google values missing — the mirror will answer "not configured" until')
  console.log('    GOOGLE_SA_EMAIL / GOOGLE_SA_KEY / BOC_SHEET_ID are in .env.local and this script reruns.')
}

// 3) Vault: tell the pg_cron job (0037) where to call.
const fnUrl = `https://${ref}.supabase.co/functions/v1/boc-mirror`
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await client.connect()
for (const [name, value] of [['boc_mirror_url', fnUrl], ['boc_mirror_secret', cronSecret]]) {
  const { rows } = await client.query('select id from vault.secrets where name = $1', [name])
  if (rows.length) await client.query('select vault.update_secret($1, $2)', [rows[0].id, value])
  else await client.query('select vault.create_secret($1, $2)', [value, name])
}
await client.end()
console.log('✓ vault updated — the hourly cron (migration 0037) is now armed')
console.log(`  Manual test:  curl -X POST ${fnUrl} -H "x-cron-secret: <BOC_CRON_SECRET>"`)
