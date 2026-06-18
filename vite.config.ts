import { execSync } from 'node:child_process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Stamp every build with its git commit + build date so a running
// deployment is traceable to an exact commit (shown next to APP_VERSION
// in the footers). On Vercel the SHA comes from the build env; locally
// from git; 'dev' if neither is available.
const commit =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
  (() => {
    try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'dev' }
  })()
const builtAt = new Date().toISOString().slice(0, 10)

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Fail-closed CAPTCHA: never ship a production build whose client-side
  // Turnstile gate silently no-ops because the site key is missing. Server-side
  // enforcement (Supabase Auth) stays the real backstop, but the two must not
  // drift — a token-less prod build either blocks legit users (server ON) or
  // removes the throttle (server OFF). So require the key at production build time.
  if (command === 'build' && mode === 'production') {
    const env = loadEnv(mode, process.cwd(), '')
    if (!env.VITE_TURNSTILE_SITE_KEY && !process.env.VITE_TURNSTILE_SITE_KEY) {
      throw new Error(
        'VITE_TURNSTILE_SITE_KEY is required for a production build (CAPTCHA). ' +
          'Set it in the build environment (Vercel project env or .env.local).',
      )
    }
  }
  return {
    plugins: [react()],
    define: {
      __APP_COMMIT__: JSON.stringify(commit),
      __APP_BUILT__: JSON.stringify(builtAt),
    },
  }
})
