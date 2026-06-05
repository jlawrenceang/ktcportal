// Quick schema sanity check against DATABASE_URL.
// Usage: DATABASE_URL="postgresql://...:5432/postgres" node scripts/verify-schema.mjs
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) { console.error('Set DATABASE_URL'); process.exit(1) }

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  const tables = await c.query(
    "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1",
  )
  console.log('tables:', tables.rows.map((r) => r.table_name).join(', '))

  const cols = await c.query(
    "select column_name from information_schema.columns where table_schema='public' and table_name='brokers' order by 1",
  )
  console.log('brokers columns:', cols.rows.map((r) => r.column_name).join(', '))

  const bucket = await c.query("select id from storage.buckets where id='valid-ids'")
  console.log("storage bucket 'valid-ids':", bucket.rowCount ? 'present' : 'MISSING')

  const fns = await c.query(
    "select proname from pg_proc where proname in ('is_admin','broker_is_approved','current_broker_id','guard_broker_protected_fields','handle_new_user') order by 1",
  )
  console.log('functions:', fns.rows.map((r) => r.proname).join(', '))

  const pol = await c.query(
    "select schemaname, count(*)::int n from pg_policies where schemaname in ('public','storage') group by 1 order by 1",
  )
  pol.rows.forEach((r) => console.log(`policies(${r.schemaname}):`, r.n))

  const trg = await c.query("select tgname from pg_trigger where tgname='brokers_guard'")
  console.log('brokers_guard trigger:', trg.rowCount ? 'present' : 'MISSING')
} finally {
  await c.end()
}
