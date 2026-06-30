import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const PROD_REF = 'mdlnfhyylvapzdubhyic'

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

function refFromUrl(url, fallback = 'missing') {
  try { return new URL(url).host.split('.')[0] || fallback } catch { return fallback }
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

const liveUrl = process.env.VITE_SUPABASE_URL
const liveAnon = process.env.VITE_SUPABASE_ANON_KEY
if (!liveUrl || !liveAnon) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Production web builds must declare their Supabase target.')
  process.exit(1)
}

const ref = refFromUrl(liveUrl)
if (ref !== PROD_REF) {
  console.error(`Refusing production web build against non-production Supabase ref: ${ref}`)
  console.error('Use npm run build:test for the e2e sandbox target.')
  process.exit(1)
}

const env = {
  ...process.env,
  VITE_SUPABASE_URL: liveUrl,
  VITE_SUPABASE_ANON_KEY: liveAnon,
  VITE_APP_TARGET: 'prod',
}

console.log(`Building production web bundle against Supabase ref: ${ref}`)
run('npx', ['tsc', '--noEmit'], env)
run('npx', ['vite', 'build'], env)
