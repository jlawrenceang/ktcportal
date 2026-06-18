// Standing security-invariants check — run before any release that touches SQL.
// Turns the one-time 0105 ACL sweep + the owner-guard assumption into a REPEATABLE
// gate, so a future migration can't silently re-open them. Connects read-only via
// DATABASE_URL in .env.local. Exits non-zero (with the offending objects) on any
// violation; prints nothing sensitive.
//
//   node scripts/check-security-invariants.mjs
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const raw = existsSync(path.join(root, '.env.local')) ? readFileSync(path.join(root, '.env.local'), 'utf8') : ''
const get = (k) => { const m = raw.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.*)$', 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : null }
const dbUrl = get('DATABASE_URL')
if (!dbUrl) { console.error('Need DATABASE_URL in .env.local'); process.exit(2) }

// Internal SECURITY DEFINER helpers/writers that must NEVER be EXECUTE-able by
// authenticated/anon (they are called only from triggers or other definer funcs).
const INTERNAL = [
  'notify_staff', 'assign_serving_numbers', 'log_security_event', 'log_jo_event',
  'push_user_ids_for_permission', 'push_on_notification', 'push_on_staff_notification',
  'session_alive', 'aal_satisfied', 'check_ops_alerts', 'reconcile_outbound',
  'run_boc_mirror', 'send_portal_email', 'expire_unverified_brokers', 'purge_expired_ids',
  'audit_valid_id_deletion', 'log_customer_status_change',
]

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await client.connect()
const failures = []

// 1) No SECURITY DEFINER *trigger* function may be client-callable (0105 rule).
const trig = await client.query(`
  select n.nspname || '.' || p.proname as fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and p.prorettype = 'trigger'::regtype
    and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
         or has_function_privilege('anon', p.oid, 'EXECUTE'))`)
if (trig.rows.length) failures.push(`Trigger functions EXECUTE-able by authenticated/anon: ${trig.rows.map((r) => r.fn).join(', ')}`)

// 2) Internal definer helpers must be revoked from authenticated/anon.
const intl = await client.query(`
  select distinct p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and p.proname = any($1::text[])
    and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
         or has_function_privilege('anon', p.oid, 'EXECUTE'))`, [INTERNAL])
if (intl.rows.length) failures.push(`Internal definer helpers EXECUTE-able by authenticated/anon: ${intl.rows.map((r) => r.proname).join(', ')}`)

// 3) The owner/privilege guard trigger must exist on public.customers — the broad
//    self-UPDATE policy relies entirely on it to block self-promotion.
const guard = await client.query(`
  select 1 from pg_trigger t
  join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
  where n.nspname = 'public' and c.relname = 'customers'
    and p.proname = 'guard_broker_protected_fields' and not t.tgisinternal`)
if (!guard.rows.length) failures.push('Missing guard trigger guard_broker_protected_fields on public.customers')

await client.end()

if (failures.length) {
  console.error('✗ SECURITY INVARIANT VIOLATIONS:')
  for (const f of failures) console.error('  - ' + f)
  process.exit(1)
}
console.log('✓ security invariants OK (definer-trigger ACLs, internal-helper ACLs, owner guard trigger)')
