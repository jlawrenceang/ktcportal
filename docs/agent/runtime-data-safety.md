# Runtime and Data Safety

## Authority

- **`src/lib/supabase.ts` is the runtime authority** for the live app target. It builds the client from `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
- Production project id: **`mdlnfhyylvapzdubhyic`** (KTC's own dedicated Supabase account).
- `docs/obsidian-vault/01-System/Runtime Target.md` mirrors this snapshot.

## Critical caveats (skimmers: read this first)

**KTC has its OWN Supabase account.** The connected `mcp__supabase__*` tools point at the **jta-sys** project (`twsylxbftvkwporglxnv`), and the `mcp__claude_ai_Supabase__*` account tools are on a different org. **Neither can reach the KTC project.** Never use them for KTC, and never apply KTC schema to jta-sys (or vice versa). See ADR-0002.

**Production-only runtime.** There is no separate staging Supabase project. Env vars in `.env.local` (local) and Vercel (deployed) both point at production. Every change lands on live data.

**RLS is enabled but security depends on the role model.** Tables have RLS; the owner/admin/broker access model is enforced via `is_owner` / `is_admin` columns + RLS policies + SECURITY DEFINER RPCs. Confirm policy intent in the migrations before assuming isolation. Note: admin policies return ALL broker rows, which is why `useBroker` must filter `.eq('user_id', uid)` (see `workflow-invariants.md`).

## Verify the real Supabase target first

Before any DB fix:
1. Confirm which page or client path is used.
2. Confirm you are operating on the KTC project (`mdlnfhyylvapzdubhyic`), not jta-sys.
3. Confirm whether the live DB actually has the intended function/trigger/column.

If `.env.local` and Vercel env vars ever disagree, the deployed site uses Vercel's (inlined at build time — a change needs a redeploy).

## Applying schema changes

- Migrations live in `supabase/migrations/` (`0001_init` … forward).
- Apply via `node scripts/run-migrations.mjs` over `DATABASE_URL` (session pooler, `ssl rejectUnauthorized:false`), or paste into the KTC project's SQL Editor.
- **Migrations are forward-only:** never edit an applied migration; write a new patch migration. Idempotent guards (`IF NOT EXISTS`, `drop policy if exists`, `create or replace`) are the house style.
- `git push` deploys the **frontend to Vercel only** — it does NOT run migrations.
- GoTrue gotcha: when inserting `auth.users` manually (e.g. `create_staff`), token columns (`confirmation_token`, `recovery_token`, `email_change*`, `phone_change*`, `reauthentication_token`) must be `''`, never NULL, or login fails with "Database error querying schema".

## Secrets hygiene

- **Public / safe:** the anon key and the Turnstile **site** key. These are inlined in the build by design.
- **Never commit / never paste in chat:** the Supabase `service_role` key, the database password, and the Turnstile **secret** key. The Turnstile secret lives only in Supabase Auth; the DB password is used inline only.
- `.env.local` is gitignored. `.vercel/` is gitignored.
- Env vars live in Vercel (frontend) and Supabase project settings (secrets). Rotate via the respective dashboards.

## Deployment

- Hosting: Vercel project `ktc-joborderform`, live at `portal.ktcterminal.com` (DNS managed by Vercel; Cloudflare is used only for the Turnstile widget). Config: `vercel.json` (Vite preset + SPA rewrite to `/index.html`).
- Vercel CLI is installed and linked locally (`vercel ls`, `vercel env ls`, `vercel logs`, `vercel inspect <url>`).
- After changing an env var in Vercel, **redeploy** — env vars are inlined at build time.
- When the domain or email changes, update Supabase Auth **Site URL** + **Redirect URLs**.
