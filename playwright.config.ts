import { defineConfig, devices } from '@playwright/test'

// Default target is the deployed prod-testing site. Override with BASE_URL to
// run against a local preview (e.g. BASE_URL=http://localhost:4173 after
// `npm run build && npm run preview`).
const baseURL = process.env.BASE_URL ?? 'https://portal.ktcterminal.com'

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
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
