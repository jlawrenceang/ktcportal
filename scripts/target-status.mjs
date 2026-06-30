import { existsSync, readFileSync } from 'node:fs'

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

function refFromDatabaseUrl(connStr, fallback = 'missing') {
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

function marker(ref, target) {
  if (target === 'live') return ref === PROD_REF ? 'OK' : 'CHECK'
  return ref && ref !== 'missing' && ref !== PROD_REF ? 'OK' : 'CHECK'
}

loadEnvFile('.env.local')
loadEnvFile('.env.migrate')
loadEnvFile('.env')

const liveRef = refFromUrl(process.env.VITE_SUPABASE_URL || '')
const testRef = refFromUrl(process.env.E2E_SUPABASE_URL || '')
const liveDbRef = refFromDatabaseUrl(process.env.DATABASE_URL || '')
const testDbRef = refFromDatabaseUrl(process.env.E2E_DATABASE_URL || '')
const publicUrl = process.env.VITE_PUBLIC_PORTAL_URL || 'https://portal.ktcterminal.com'

console.log('KTC target status')
console.log('=================')
console.log(`live web/app ref : ${liveRef} (${marker(liveRef, 'live')})`)
console.log(`live db ref      : ${liveDbRef} (${marker(liveDbRef, 'live')})`)
console.log(`test e2e ref     : ${testRef} (${marker(testRef, 'test')})`)
console.log(`test e2e db ref  : ${testDbRef} (${testDbRef === testRef && marker(testDbRef, 'test') === 'OK' ? 'OK' : 'CHECK'})`)
console.log(`public portal URL: ${publicUrl}`)
console.log('')
console.log('Use these explicit target commands:')
console.log('  Web test : npm run dev:test       | npm run preview:test')
console.log('  Web live : npm run dev:live       | npm run preview:live')
console.log('  APK test : npm run build:android:test   -> KTC-Test-sandbox-debug.apk')
console.log('  APK live : npm run build:android:live   -> KTC-Portal-live-debug.apk')
console.log('')
console.log('The live Vercel production deployment is not flipped by these commands.')
