import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

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

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase()
}

function refFromUrl(url, fallback = 'live') {
  try { return new URL(url).host.split('.')[0] || fallback } catch { return fallback }
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const liveUrl = process.env.VITE_SUPABASE_URL
const liveAnon = process.env.VITE_SUPABASE_ANON_KEY
if (!liveUrl || !liveAnon) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Fill .env.local with the live Supabase project first.')
  process.exit(1)
}

const ref = refFromUrl(liveUrl)
if (ref !== PROD_REF) {
  console.error(`Refusing to build a live APK against non-production Supabase ref: ${ref}`)
  process.exit(1)
}

const env = {
  ...process.env,
  VITE_SUPABASE_URL: liveUrl,
  VITE_SUPABASE_ANON_KEY: liveAnon,
  VITE_APP_TARGET: 'prod',
  VITE_PUBLIC_PORTAL_URL: process.env.VITE_PUBLIC_PORTAL_URL || 'https://portal.ktcterminal.com',
}

const javaHome = resolve(process.env.USERPROFILE || '', '.jdks/jdk-21.0.11+10')
const androidHome = resolve(process.env.USERPROFILE || '', '.ktc-android/android-sdk')
if (!env.JAVA_HOME && existsSync(javaHome)) env.JAVA_HOME = javaHome
if (!env.ANDROID_HOME && existsSync(androidHome)) env.ANDROID_HOME = androidHome
if (env.JAVA_HOME && env.ANDROID_HOME) {
  env.Path = `${env.JAVA_HOME}\\bin;${env.ANDROID_HOME}\\platform-tools;${env.ANDROID_HOME}\\cmdline-tools\\latest\\bin;${env.Path || ''}`
}

console.log(`Building KTC Portal live APK against Supabase ref: ${ref}`)
run('npx', ['tsc', '--noEmit'], { env })
run('npx', ['vite', 'build'], { env })
run('npx', ['cap', 'sync', 'android'], { env })
run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['assembleDebug'], { cwd: resolve('android'), env })

const src = resolve('android/app/build/outputs/apk/debug/app-debug.apk')
const out = resolve('KTC-Portal-live-debug.apk')
copyFileSync(src, out)
console.log(`Live APK: ${out}`)
console.log(`SHA256: ${hashFile(out)}`)
