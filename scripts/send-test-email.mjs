// Send the confirm-signup template to yourself via Resend, to preview rendering.
//
// Reads from the gitignored .env.local:
//   RESEND_API_KEY=re_...           (required)
//   RESEND_FROM="KTC <noreply@ktcterminal.com>"   (optional; defaults to Resend's test sender)
//   TEST_EMAIL_TO=you@example.com   (optional; defaults to the account owner email below)
//
// Usage:  node scripts/send-test-email.mjs
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['.env.local', '.env']) {
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

const key = process.env.RESEND_API_KEY
if (!key) { console.error('Add RESEND_API_KEY to .env.local first.'); process.exit(1) }
const from = process.env.RESEND_FROM || 'onboarding@resend.dev'
const to = process.env.TEST_EMAIL_TO || 'jlawrenceang@gmail.com'

let html = readFileSync(path.join(root, 'docs/email-templates/confirm-signup.html'), 'utf8')
html = html.replace(/<!--[\s\S]*?-->/, '') // drop the instructions comment
// Supabase fills {{ .ConfirmationURL }} at send time; use a sample link for the preview.
html = html.replace(/\{\{\s*\.ConfirmationURL\s*\}\}/g, 'https://portal.ktcterminal.com/?this-is-a-sample-confirmation-link')

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ from, to, subject: '[TEST] Confirm your KTC broker account', html }),
})
const body = await res.json().catch(() => ({}))
console.log('Resend status:', res.status)
console.log(JSON.stringify(body))
if (res.ok) console.log(`\nSent to ${to} from ${from}. Check your inbox (and spam).`)
