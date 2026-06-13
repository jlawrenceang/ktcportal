# Archive — superseded docs (holding pen)

Read-only history. Per `docs/agent/doc-governance.md`: agents **move** superseded docs here (never delete); only the OWNER decides deletion or revival. Each entry notes what superseded it.

| Archived doc | Archived | Superseded by / why |
|---|---|---|
| `branding.md` | 2026-06-13 | Jotform-era theme notes (CSS data-URIs, Jotform theme paths). The portal is a React + Tailwind SPA with the visionOS design layer — see `docs/obsidian-vault/05-Concepts/visionOS Design System.md`. |
| `form-spec.md` | 2026-06-13 | Jotform form spec (form ID `261546852224458`). The Jotform was replaced by the in-app New Job Order form (`src/pages/JobOrder.tsx`). |
| `sheet-schema.md` | 2026-06-13 | Google Sheets backend schema. Replaced by Supabase (`supabase/migrations/`); Sheets survives only as the read-only BOC mirror (`docs/obsidian-vault/04-Workflows/BOC Sheets Mirror.md`). |
| `migration-to-supabase.md` | 2026-06-13 | The Sheets→Supabase migration plan — completed long ago (schema live at migration 0055). Kept as historical record of the cutover. |
| `smoke-test-02-broker-lifecycle.md` | 2026-06-13 | The original ST02 (customer lifecycle, migrations 0014–0027). Superseded by the full-scope `docs/smoke-test-02-portal.md` (migrations 0011–0055), which reuses the ST02 ID. |
