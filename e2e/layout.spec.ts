import { test, expect } from '@playwright/test'

// Layout-overflow guard — the viewport × language matrix's reason for existing.
// Tagalog strings run longer than English and can break scaling / push the page
// wider than the viewport (horizontal scroll) or clip text inside a box. This
// asserts NO horizontal overflow on the public screens, in every {desktop,mobile}
// × {en,fil} config (the project sets the viewport + seeds ktc_lang). It surfaces
// the offending elements so a real break is actionable, not a silent pass.
//
// Public screens only (no auth needed) — the highest-traffic first-impression
// surfaces, and the ones a logged-out visitor (or a bot) can reach. Authenticated
// overflow is a follow-up once a Tagalog-robust authenticated lane exists.

const SCREENS = ['/', '/login', '/register', '/agreement', '/forgot-password']

for (const path of SCREENS) {
  test(`no horizontal overflow · ${path}`, async ({ page }, testInfo) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
    // Let the SPA hydrate + fonts settle (a pre-hydration shell has no overflow).
    await page.waitForTimeout(900)

    const report = await page.evaluate(() => {
      const de = document.documentElement
      const vw = window.innerWidth
      const docOverflow = Math.max(0, de.scrollWidth - vw)
      // Elements whose right edge pushes past the viewport — the actual offenders
      // (filter out fixed/absolute decoration that legitimately bleeds off-canvas
      // is hard to do perfectly, so we report the worst few for a human to judge).
      const offenders: { tag: string; cls: string; right: number; text: string }[] = []
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        const r = (el as HTMLElement).getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const style = getComputedStyle(el as HTMLElement)
        if (style.position === 'fixed') continue // floating chrome may sit off-canvas by design
        if (r.right > vw + 2) {
          offenders.push({
            tag: (el as HTMLElement).tagName.toLowerCase(),
            cls: String((el as HTMLElement).className || '').slice(0, 36),
            right: Math.round(r.right),
            text: (el.textContent || '').trim().slice(0, 30),
          })
        }
      }
      offenders.sort((a, b) => b.right - a.right)
      return { vw, docOverflow, offenders: offenders.slice(0, 4) }
    })

    const detail = report.offenders.map((o) => `${o.tag}.${o.cls}@${o.right}px"${o.text}"`).join('  |  ')
    expect(
      report.docOverflow,
      `[${testInfo.project.name}] horizontal overflow of ${report.docOverflow}px at vw=${report.vw} on ${path}. Widest offenders: ${detail || '(none isolated — check fixed/absolute children)'}`,
    ).toBeLessThanOrEqual(2)
  })
}
