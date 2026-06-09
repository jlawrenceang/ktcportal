// Upsert the Resend secrets into Supabase Vault so the approval-email trigger
// (migration 0015) can read them. The key never touches the repo or stdout.
//
// Reads from the gitignored .env.local:
//   DATABASE_URL=postgresql://...   (required — same one run-migrations uses)
//   RESEND_API_KEY=re_...           (required — stored as vault secret 'resend_api_key')
//   RESEND_FROM="KTC <noreply@ktcterminal.com>"  (optional — stored as 'resend_from')
//
// Usage:  node scripts/set-vault-secrets.mjs
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['.env.local', '.env.migrate', '.env']) {
  const p = path.join(root, f)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) {
      let v = m[2].trim(); if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1)
      process.env[m[1]] = v
    }
  }
}

const url = process.env.DATABASE_URL
const key = process.env.RESEND_API_KEY
const from = process.env.RESEND_FROM || 'KTC Container Terminal <noreply@ktcterminal.com>'
if (!url) { console.error('No DATABASE_URL in .env.local'); process.exit(1) }
if (!key) { console.error('No RESEND_API_KEY in .env.local'); process.exit(1) }

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()

async function upsert(name, value) {
  const ex = await client.query('select id from vault.secrets where name = $1', [name])
  if (ex.rows.length) {
    await client.query('select vault.update_secret($1, $2)', [ex.rows[0].id, value])
    console.log(`updated vault secret '${name}' (${value.length} chars)`)
  } else {
    await client.query('select vault.create_secret($1, $2)', [value, name])
    console.log(`created vault secret '${name}' (${value.length} chars)`)
  }
}

try {
  await upsert('resend_api_key', key)
  await upsert('resend_from', from)
  console.log('done — Resend secrets are in Vault.')
} catch (e) {
  console.error('FAILED:', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}
