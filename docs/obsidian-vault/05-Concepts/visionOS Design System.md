---
title: visionOS Design System
tags: [concept, frontend, design]
type: concept
---

# 🎨 visionOS Design System

KTC reuses the jta-sys v2 "visionOS" design language, re-skinned to the KTC brand.

## Tokens & aesthetic

- Cool-neutral canvas, frosted-glass surfaces (`rgba(255,255,255,.6)` blur + saturate), soft motion.
- KTC brand accent: **orange `#F26A21`** / **red `#D6321E`** (from the KTC logo).
- Logo: `assets/ktc-logo.png` (white background keyed out → transparent). Served at `/ktc-logo.png`.
- Font: Inter (loaded via Google Fonts in `index.html`).

## Reusable classes

- `ktc-glass` — frosted card surface
- `ktc-btn` — primary button
- `ktc-input` — form input
- `ktc-label` — muted label text
- `ktc-link` — text button / link

Tokens live in `src/styles/*`. Reuse these classes rather than re-rolling inline styles where possible.

## Origin

The system was ported from how jta-sys styles its v2 surfaces, so the two apps feel related while KTC keeps its own accent and logo.

## Related

- [[Tech Stack]] · [[Architecture]]
- ADR-0003
