# Branding & form theme

The KTC Job Order Form uses the **JTA v2 "visionOS" design system**, ported from
`jta-sys/src/styles/v2-tokens.css`, with the accent swapped to the KTC brand.

## Source of truth

- **Theme CSS:** [`../assets/jotform-theme.css`](../assets/jotform-theme.css) — edit here, then re-apply (below).
- **Logo:** [`../assets/ktc-logo.png`](../assets/ktc-logo.png) — KTC Container Terminal Corp,
  trimmed to 483×200, transparent bg (from `LETTER HEAD.docx`). Shown top-left of the form
  header, embedded as a data URI at apply time (the `__KTC_LOGO__` token in the theme CSS).

## Tokens (mirrors v2-tokens.css)

| Token | Value | Role |
|---|---|---|
| Canvas | `#f1f2f5` (+ 3 radial washes) | cool-neutral page |
| Glass | `rgba(255,255,255,.55)`, blur 20px, saturate 1.6 | form card |
| Specular edge | `inset 0 1px 0 hsl(0 0% 100% / .65)` | lit top edge |
| Radii | 16 / 22 / **30** (card) / 11 (button) | visionOS generosity |
| Depth | layered `--shadow-lg` | real elevation |
| Type | Inter (system-ui fallback) | display + body |
| Ink ramp | `222 20% 12%` → `222 8% 50%` | text |
| **Accent** | **`#F26A21` → `#D6321E`** (KTC) | focus ring + submit + asterisk |

> JTA's own accent is indigo `#3f4fd1`; we use KTC orange/red instead — the same way
> jta-sys swaps accents via its `data-accent` presets. To go pure-JTA indigo, set
> `--acc:#3f4fd1; --acc-2:#3f4fd1; --acc-rgb:63 79 209` in the theme CSS and re-apply.

## How the theme is applied

Jotform stores injected custom CSS in the form's **`injectCSS`** property — the API
equivalent of the builder's **Form Designer → Inject Custom CSS** box (verified working
on the Free plan). It renders as an inline `<style>` on top of the base `nova` skin, so
the `styles` property must stay `"nova"`. Re-apply after editing the CSS or swapping the
logo — the script inlines `ktc-logo.png` and writes `injectCSS`:

```bash
JOTFORM_API_KEY=xxxxx bash scripts/apply-theme.sh
```

> Earlier note: do NOT put CSS in the `styles` property — that field is only the
> theme-name slug Jotform drops into `cdn.jotfor.ms/css/styles/<name>.css`, so CSS there
> just 404s the skin. `injectCSS` is the right slot.

> ⚠️ If you edit the **Inject Custom CSS** box in the Jotform Designer, it overwrites
> `injectCSS` and wipes this. Edit `assets/jotform-theme.css` and re-run the script instead,
> so the repo stays the source of truth.
