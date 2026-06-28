import { defineConfig, devices } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'

// Load .env.local / .env so the E2E_* secrets (Phase 2) and BASE_URL can live
// in the gitignored env file instead of the shell. Same lightweight parser as
// scripts/run-migrations.mjs; real shell env always wins.
for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || process.env[m[1]] !== undefined) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}

// These lanes verify the DEPLOYED site. .env.local sets BASE_URL=http://localhost:3000
// for the local-preview workflow — but with no `npm run preview` running that points
// every test at a dead port (ERR_CONNECTION_REFUSED) and fails the whole suite. So
// resolve to the deployed site unless BASE_URL is EXPLICITLY a non-localhost target.
// Run against a local preview with e.g. BASE_URL=http://localhost:4173 (server up).
const DEPLOYED = 'https://portal.ktcterminal.com'
const baseURL = process.env.BASE_URL && !process.env.BASE_URL.includes('localhost')
  ? process.env.BASE_URL
  : DEPLOYED

// Seed the app's language + theme before first paint via storageState, so each
// project boots in the right config WITHOUT clicking a UI toggle. Origin is the
// deployed site (these are deployed-site lanes). Stored values: ktc_lang 'en'|'tl'
// (UI labels 'tl' as "FIL"); ktc-theme 'light'|'dark' (applied as data-theme on
// <html>, redefining the dark token block in v2-tokens.css / theme-colors.css).
const seedState = (lang: 'en' | 'tl', theme: 'light' | 'dark') => ({
  cookies: [],
  origins: [{
    origin: DEPLOYED,
    localStorage: [
      { name: 'ktc_lang', value: lang },
      { name: 'ktc_lang_set', value: '1' },
      { name: 'ktc-theme', value: theme },
    ],
  }],
})

const VIEWPORTS = [
  { tag: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  { tag: 'mobile', use: { ...devices['Pixel 5'] } }, // ~393×851, isMobile + touch
]
const LANGS = [{ tag: 'en', v: 'en' as const }, { tag: 'fil', v: 'tl' as const }]
const THEMES = [{ tag: 'light', v: 'light' as const }, { tag: 'dark', v: 'dark' as const }]

// Matrix = {desktop, mobile} × {EN, FIL} × {light, dark} = 8 configs. The app is
// fully responsive, Tagalog strings run longer (overflow risk), and dark mode has
// its own token/contrast surface — so the visual lanes (smoke + layout) run under
// all 8. See e2e/layout.spec.ts for the per-config horizontal-overflow guard. The
// mutation lane (customer-lifecycle) self-limits to en+light × {desktop,mobile} —
// its wires are config-agnostic and it writes throwaway PROD rows, so 8× is waste.
const projects = []
for (const vp of VIEWPORTS) {
  for (const lang of LANGS) {
    for (const theme of THEMES) {
      projects.push({
        name: `${vp.tag}-${lang.tag}-${theme.tag}`,
        use: { ...vp.use, storageState: seedState(lang.v, theme.v) },
      })
    }
  }
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Bound EVERY action/navigation. Playwright's default actionTimeout is 0
    // (unbounded), so a single missing-element .fill()/.click()/.textContent()
    // (e.g. an error-capture in a catch) hangs until the whole test times out.
    // A finite cap makes every step fail fast and keeps lanes well under budget.
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects,
})
