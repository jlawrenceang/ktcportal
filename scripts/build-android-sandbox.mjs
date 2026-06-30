import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

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
  console.error('Refusing to build a sandbox APK against the production Supabase ref.')
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

const javaHome = resolve(process.env.USERPROFILE || '', '.jdks/jdk-21.0.11+10')
const androidHome = resolve(process.env.USERPROFILE || '', '.ktc-android/android-sdk')
if (!env.JAVA_HOME && existsSync(javaHome)) env.JAVA_HOME = javaHome
if (!env.ANDROID_HOME && existsSync(androidHome)) env.ANDROID_HOME = androidHome
if (env.JAVA_HOME && env.ANDROID_HOME) {
  env.Path = `${env.JAVA_HOME}\\bin;${env.ANDROID_HOME}\\platform-tools;${env.ANDROID_HOME}\\cmdline-tools\\latest\\bin;${env.Path || ''}`
}

const stringsPath = resolve('android/app/src/main/res/values/strings.xml')
const originalStrings = readFileSync(stringsPath, 'utf8')
const testStrings = originalStrings
  .replace(/<string name="app_name">[^<]*<\/string>/, '<string name="app_name">KTC Test</string>')
  .replace(/<string name="title_activity_main">[^<]*<\/string>/, '<string name="title_activity_main">KTC Test</string>')

console.log(`Building KTC Test sandbox APK against Supabase ref: ${ref}`)

try {
  writeFileSync(stringsPath, testStrings)
  run('npx', ['tsc', '--noEmit'], { env })
  run('npx', ['vite', 'build', '--mode', 'sandbox'], { env })
  run('npx', ['cap', 'sync', 'android'], { env })
  run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['assembleDebug'], { cwd: resolve('android'), env })
} finally {
  writeFileSync(stringsPath, originalStrings)
}

const src = resolve('android/app/build/outputs/apk/debug/app-debug.apk')
const out = resolve('KTC-Test-sandbox-debug.apk')
copyFileSync(src, out)
console.log(`Sandbox APK: ${out}`)
console.log(`SHA256: ${hashFile(out)}`)
