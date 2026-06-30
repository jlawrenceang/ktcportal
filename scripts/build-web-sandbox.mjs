import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

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

function run(cmd, args, env) {
  const res = spawnSync(cmd, args, {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const sandboxUrl = process.env.E2E_SUPABASE_URL
const sandboxAnon = process.env.E2E_PUBLISHABLE_KEY
if (!sandboxUrl || !sandboxAnon) {
  console.error('Missing E2E_SUPABASE_URL / E2E_PUBLISHABLE_KEY. Fill .env.local with the sandbox Supabase project first.')
  process.exit(1)
}

let ref = 'sandbox'
try { ref = new URL(sandboxUrl).host.split('.')[0] || ref } catch { /* ignored */ }
if (ref === 'mdlnfhyylvapzdubhyic') {
  console.error('Refusing to build a sandbox web bundle against the production Supabase ref.')
  process.exit(1)
}

const env = {
  ...process.env,
  VITE_SUPABASE_URL: sandboxUrl,
  VITE_SUPABASE_ANON_KEY: sandboxAnon,
  VITE_TURNSTILE_SITE_KEY: '',
  VITE_APP_TARGET: 'sandbox',
  VITE_PUBLIC_PORTAL_URL: process.env.E2E_PUBLIC_PORTAL_URL || 'https://portal.ktcterminal.com',
}

console.log(`Building sandbox web bundle against Supabase ref: ${ref}`)
run('npx', ['tsc', '--noEmit'], env)
run('npx', ['vite', 'build', '--mode', 'sandbox'], env)
